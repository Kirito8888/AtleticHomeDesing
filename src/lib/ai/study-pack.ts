import "server-only";

import { z } from "zod";

import { Prisma } from "@/generated/prisma/client";
import { assertAiAllowed } from "@/lib/ai/guard";
import { localConfig } from "@/lib/ai/local";
import { aiFor, extractJson, isTransientAiError } from "@/lib/ai/provider";
import { ApiError } from "@/lib/api";
import { env } from "@/lib/env";
import { log } from "@/lib/log";
import { prisma } from "@/lib/prisma";
import { activeKinds, allocate, LEVEL_QUESTIONS, parseFormat, type Kind } from "@/lib/study/exam-format";
import { requireModule } from "@/lib/study/modules-service";
import { fakeBatchJson, fakeSummaryJson } from "@/lib/study/pack-fake";
import { batchToItems, gameBatchSchema, sanitizeBatch, sanitizeSummary, summarySchema, type GameBatch, type Summary } from "@/lib/study/pack-schema";
import { batchPrompt, emptyNote, PACK_SYSTEM, retryNote, sourceHash, splitParts, summaryPrompt } from "@/lib/study/pack-prompts";
import type { QuestItem } from "@/lib/study/quest-mock";

const fakeAi = () => process.env.LIFEOS_FAKE_AI === "1";

/** Tope de texto fuente del resumen (≈ 40 000 tokens). Si se pasa, se avisa en `meta.truncated`: no se recorta en silencio. */
export const MAX_SUMMARY_CHARS = 150_000;
/** Reintentos por respuesta que no pasa la validación (zod o fuentes). */
export const MAX_VALIDATION_RETRIES = 2;
/** Esperas ante un 429 (límite por minuto del nivel gratuito) o una saturación temporal del proveedor (503…): se repite la misma llamada. */
export const RATE_LIMIT_WAITS_MS = [15_000, 30_000, 60_000, 90_000];
/** Un trabajo `RUNNING` sin actividad en este tiempo se da por interrumpido (reinicio del servidor). */
export const STALE_MS = 25 * 60_000;
/** Preguntas objetivo de un nivel (todas las partes juntas): el juego original tiene ~10. */
const LEVEL_TARGET = LEVEL_QUESTIONS;

/** Tope de salida por llamada: un lote o el resumen en JSON no cabe en los 8 192 por defecto. */
export const PACK_MAX_OUTPUT_TOKENS = 32_768;

/** Lo mínimo que necesita el generador de la IA: así los tests y la IA simulada entran por el mismo camino. */
export interface PackAi {
  model: string;
  /** L2 · Servidor de IA local: ya atiende de una en una y no tiene cuota por minuto, así que no hace falta pausa entre llamadas. */
  local?: boolean;
  text(p: { system: string; prompt: string; json: Record<string, unknown> }): Promise<{ text: string; inputTokens?: number; outputTokens?: number }>;
}
export interface PackDeps {
  ai?: PackAi;
  sleep?: (ms: number) => Promise<void>;
  /** Pausa entre llamadas (por defecto `STUDY_PACK_MIN_INTERVAL_MS`, o 0 con la IA local). */
  minIntervalMs?: number;
}

export interface PackMeta {
  done: number;
  total: number;
  /** Partes que no pasaron la validación tras los reintentos. */
  failed: { part: string; error: string }[];
  truncated?: boolean;
}

const schemaOf = (s: z.ZodType) => {
  const { $schema: _i, ...rest } = z.toJSONSchema(s) as Record<string, unknown>;
  void _i;
  return rest;
};
/** L2 · Por qué no salió una parte (para el log; sin texto de la usuaria). */
export type PartFailReason = "json" | "schema" | "sources" | "empty" | "error";

/** Fallo de validación de una parte tras agotar los reintentos. `jsonErrors`: intentos cuya respuesta no era JSON (tasa de fallos de JSON). */
export class PackPartError extends Error {
  constructor(
    message: string,
    readonly reason: PartFailReason,
    readonly jsonErrors: number,
  ) {
    super(message);
  }
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function realAi(model: string, ai: Awaited<ReturnType<typeof aiFor>>): PackAi {
  return {
    model,
    text: (p) => ai.text({ system: p.system, messages: [{ role: "user", text: p.prompt }], temperature: 0.3, json: p.json, maxOutputTokens: PACK_MAX_OUTPUT_TOKENS, thinking: true }),
  };
}

async function resolveAi(userId: string): Promise<PackAi> {
  if (fakeAi()) {
    return {
      model: "simulado",
      async text(p) {
        return { text: p.prompt.includes("RESUMEN DE ESTUDIO") ? fakeSummaryJson(p.prompt) : fakeBatchJson(p.prompt), inputTokens: 0, outputTokens: 0 };
      },
    };
  }
  const ai = await aiFor(userId);
  return { ...realAi(ai.chatModel, ai), local: Boolean(localConfig()) };
}

const problemsOf = (e: z.ZodError) => e.issues.slice(0, 6).map((i) => `${i.path.join(".") || "(raíz)"}: ${i.message}`);

/**
 * Una llamada a la IA con validación: JSON → zod → `accept` (validación contra las fuentes). Si falla, reintenta enviando los fallos
 * (hasta `MAX_VALIDATION_RETRIES`); ante un 429 o un 503 del proveedor espera y repite (`RATE_LIMIT_WAITS_MS`). Lanza el último problema si no hay manera.
 */
export async function validatedCall<S extends z.ZodType, R>(
  ai: PackAi,
  deps: Required<Pick<PackDeps, "sleep">>,
  p: { system: string; prompt: string; schema: S; accept: (data: z.infer<S>) => { result: R; problems: string[] } },
): Promise<{ result: R; inputTokens: number; outputTokens: number }> {
  const json = schemaOf(p.schema);
  let note = "";
  let tokensIn = 0;
  let tokensOut = 0;
  let last = "La IA no devolvió nada utilizable";
  let reason: PartFailReason = "empty";
  let jsonErrors = 0;
  let waits = 0;
  for (let attempt = 0; attempt <= MAX_VALIDATION_RETRIES; attempt++) {
    let res;
    try {
      res = await ai.text({ system: p.system, prompt: p.prompt + note, json });
    } catch (e) {
      if (isTransientAiError(e) && waits < RATE_LIMIT_WAITS_MS.length) {
        await deps.sleep(RATE_LIMIT_WAITS_MS[waits++]);
        attempt--; // un 429 o un 503 no gasta un reintento de validación
        continue;
      }
      // Respuesta vacía, bloqueada o cortada: sí gasta un reintento, pidiendo algo más corto o más neutro.
      const d = e instanceof ApiError ? (e.details as { code?: string; reason?: string } | undefined) : undefined;
      if (d?.code === "ai_empty") {
        last = e instanceof ApiError ? e.message : "La IA no devolvió contenido";
        reason = "empty";
        note = emptyNote(d.reason ?? "OTHER");
        continue;
      }
      throw e;
    }
    tokensIn += res.inputTokens ?? 0;
    tokensOut += res.outputTokens ?? 0;
    let problems: string[];
    try {
      const parsed = p.schema.safeParse(extractJson(res.text));
      if (parsed.success) {
        const acc = p.accept(parsed.data);
        if (!acc.problems.length) return { result: acc.result, inputTokens: tokensIn, outputTokens: tokensOut };
        problems = acc.problems;
        reason = "sources";
      } else {
        problems = problemsOf(parsed.error);
        reason = "schema";
      }
    } catch {
      problems = ["La respuesta no es JSON válido."];
      reason = "json";
      jsonErrors++;
    }
    last = reason === "json" ? `La IA no devolvió JSON válido tras ${MAX_VALIDATION_RETRIES + 1} intentos.` : problems[0];
    note = retryNote(problems);
  }
  throw new PackPartError(last, reason, jsonErrors);
}

/** Lotes de la partición: cuántas preguntas de cada tipo pide cada parte (suman ~`LEVEL_TARGET` en total). */
export function partCounts(format: ReturnType<typeof parseFormat>, parts: number): Partial<Record<Kind, number>>[] {
  const per = Math.max(activeKinds(format).length, Math.round(LEVEL_TARGET / Math.max(1, parts)));
  return Array.from({ length: parts }, () => allocate(format, per));
}

const total = (b: GameBatch) => b.theoryTest.length + b.theoryEssay.length + b.practiceCmd.length + b.practiceTest.length + b.practiceEssay.length;

async function loadSources(userId: string, moduleId: string, topicDocumentId: string | null, extraDocIds: string[]) {
  const ids = [...new Set([...(topicDocumentId ? [topicDocumentId] : []), ...extraDocIds])];
  if (!ids.length) throw new ApiError(409, "Este tema no tiene apuntes. Sube un PDF o PPTX y asígnalo al tema.");
  const docs = await prisma.studyDocument.findMany({
    where: { userId, id: { in: ids }, moduleId, status: "EMBEDDED" },
    include: { chunks: { orderBy: { chunkIndex: "asc" }, select: { content: true } } },
  });
  const ordered = ids.map((id) => docs.find((d) => d.id === id)).filter((d): d is NonNullable<typeof d> => !!d);
  const chunks = ordered.flatMap((d) => d.chunks.map((c) => c.content));
  if (!chunks.length) throw new ApiError(409, "Los apuntes de este tema aún no están procesados. Espera a que terminen de procesarse.");
  return chunks;
}

/**
 * Prepara el paquete: valida pertenencia y apuntes, y lo deja en PENDING (borra lo anterior si cambió el texto o se pide `force`).
 * No llama a la IA: de eso se encarga `runPack`, en segundo plano.
 *
 * @throws {ApiError} 404 tema ajeno · 409 sin apuntes procesados · (de `assertAiAllowed`) 403/503.
 */
export async function preparePack(userId: string, topicId: string, opts: { documentIds?: string[]; force?: boolean } = {}) {
  const topic = await prisma.studyTopic.findFirst({ where: { id: topicId, userId } });
  if (!topic) throw new ApiError(404, "Ese tema no existe.");
  const chunks = await loadSources(userId, topic.moduleId, topic.documentId, opts.documentIds ?? []);
  if (!fakeAi()) await assertAiAllowed(userId);
  const hash = sourceHash(chunks.join("\n"));
  const prev = await prisma.studyTopicPack.findUnique({ where: { topicId } });
  if (prev?.status === "RUNNING" && Date.now() - prev.updatedAt.getTime() < STALE_MS) throw new ApiError(409, "Este tema ya se está generando.");
  // Si cambió el texto (o se pide `force`) se descarta lo generado; si no, se conserva y solo se rehace lo que falte.
  const clear = prev && (opts.force || prev.sourceHash !== hash) ? { summary: Prisma.DbNull, game: Prisma.DbNull, failures: Prisma.DbNull, inputTokens: 0, outputTokens: 0 } : {};
  return prisma.studyTopicPack.upsert({
    where: { topicId },
    create: { userId, topicId, status: "PENDING", sourceHash: hash },
    update: { status: "PENDING", error: null, sourceHash: hash, ...clear },
  });
}

/**
 * Genera (o completa) el paquete: resumen y un lote de juego por parte del texto, uno a uno. Guarda tras cada parte; las partes ya
 * generadas no se repiten, así que volver a lanzarlo solo rehace las que fallaron. Nunca lanza: deja el estado en BD
 * (READY · PARTIAL si alguna parte falló · FAILED si no se pudo generar nada).
 */
export async function runPack(userId: string, topicId: string, opts: { documentIds?: string[] } = {}, deps: PackDeps = {}): Promise<void> {
  const sleep = deps.sleep ?? defaultSleep;
  let gap = deps.minIntervalMs ?? 0;
  let lastCall = 0;
  const throttle = async () => {
    const wait = lastCall + gap - Date.now();
    if (gap > 0 && lastCall && wait > 0) await sleep(wait);
    lastCall = Date.now();
  };
  const failLog = (kind: string, e: unknown) => {
    const extra = e instanceof PackPartError ? { code: e.reason, count: e.jsonErrors } : { code: e instanceof ApiError ? e.status : "error" };
    log.warn("paquete de estudio: parte sin generar", { job: "study-pack", kind, ...extra });
  };
  try {
    const topic = await prisma.studyTopic.findFirst({ where: { id: topicId, userId }, include: { module: true } });
    if (!topic) return;
    const format = parseFormat(topic.module.examFormat);
    const chunks = await loadSources(userId, topic.moduleId, topic.documentId, opts.documentIds ?? []);
    const full = chunks.join("\n\n");
    const ai = deps.ai ?? (await resolveAi(userId));
    // L2 · Con la IA local no se espera entre partes: su cola ya serializa y no hay límite por minuto.
    gap = deps.minIntervalMs ?? (ai.local ? 0 : env().STUDY_PACK_MIN_INTERVAL_MS);
    const pack = await prisma.studyTopicPack.findUnique({ where: { topicId } });
    const summaryDone = pack?.summary ? summarySchema.safeParse(pack.summary).success : false;
    const levels = (pack?.game as { levels?: Record<string, GameBatch> } | null)?.levels ?? {};
    const parts = splitParts(chunks);
    const counts = partCounts(format, parts.length);
    const meta: PackMeta = { done: 0, total: 1 + parts.length, failed: [], truncated: full.length > MAX_SUMMARY_CHARS };
    let summary: Summary | null = summaryDone ? (pack!.summary as Summary) : null;
    let tin = pack?.inputTokens ?? 0;
    let tout = pack?.outputTokens ?? 0;
    const save = (status: string, extra: { error?: string | null } = {}) =>
      prisma.studyTopicPack.update({
        where: { topicId },
        data: { status, model: ai.model, inputTokens: tin, outputTokens: tout, failures: meta as object, ...(summary ? { summary: summary as object } : {}), game: { levels } as object, ...extra },
      });
    meta.done = (summary ? 1 : 0) + parts.filter((_, i) => levels[`g${i + 1}`]).length;
    await save("RUNNING");

    if (!summary) {
      await throttle();
      try {
        const sources = full.slice(0, MAX_SUMMARY_CHARS);
        const r = await validatedCall(ai, { sleep }, {
          system: PACK_SYSTEM,
          prompt: summaryPrompt({ moduleName: topic.module.name, topic: topic.name, sources }),
          schema: summarySchema,
          accept: (d) => {
            const s = sanitizeSummary(d, sources);
            const blocks = s.summary.levels.safe.length + s.summary.levels.probable.length + s.summary.levels.extra.length;
            return { result: s.summary, problems: blocks ? [] : ["Ningún bloque tiene una cita literal de las fuentes en «evidence»."] };
          },
        });
        summary = r.result;
        tin += r.inputTokens;
        tout += r.outputTokens;
        meta.done++;
      } catch (e) {
        meta.failed.push({ part: "summary", error: e instanceof Error ? e.message : "error" });
        failLog("summary", e);
      }
      await save("RUNNING");
    }

    for (let i = 0; i < parts.length; i++) {
      const key = `g${i + 1}`;
      if (levels[key]) continue;
      await throttle();
      try {
        const r = await validatedCall(ai, { sleep }, {
          system: PACK_SYSTEM,
          prompt: batchPrompt({ moduleName: topic.module.name, topic: topic.name, part: `${i + 1} de ${parts.length}`, counts: counts[i], sources: parts[i] }),
          schema: gameBatchSchema,
          accept: (d) => {
            const s = sanitizeBatch(d, parts[i]);
            return { result: s.batch, problems: total(s.batch) ? [] : ["Ninguna pregunta se pudo respaldar con las fuentes (cita literal en «evidence», comandos y opciones de los apuntes)."] };
          },
        });
        levels[key] = r.result;
        tin += r.inputTokens;
        tout += r.outputTokens;
        meta.done++;
      } catch (e) {
        meta.failed.push({ part: key, error: e instanceof Error ? e.message : "error" });
        failLog(key, e);
      }
      await save("RUNNING");
    }
    const anyGame = Object.values(levels).some((b) => total(b) > 0);
    const status = meta.failed.length === 0 ? "READY" : summary || anyGame ? "PARTIAL" : "FAILED";
    await save(status, { error: status === "FAILED" ? meta.failed[0]?.error : null });
  } catch (e) {
    log.error("paquete de estudio", { job: "study-pack", err: e });
    const msg = e instanceof ApiError ? e.message : "No se pudo generar el paquete. Inténtalo de nuevo.";
    await prisma.studyTopicPack.update({ where: { topicId }, data: { status: "FAILED", error: msg } }).catch(() => {});
  }
}

/** Estado y contenido de un paquete (solo del dueño). Un `RUNNING` sin actividad se muestra como interrumpido. */
export async function getPack(userId: string, topicId: string) {
  await prisma.studyTopic.findFirstOrThrow({ where: { id: topicId, userId }, select: { id: true } }).catch(() => {
    throw new ApiError(404, "Ese tema no existe.");
  });
  const p = await prisma.studyTopicPack.findFirst({ where: { topicId, userId } });
  if (!p) return null;
  const stale = p.status === "RUNNING" && Date.now() - p.updatedAt.getTime() > STALE_MS;
  const summary = p.summary ? summarySchema.safeParse(p.summary) : null;
  return {
    status: stale ? "FAILED" : p.status,
    error: stale ? "La generación se interrumpió (reinicio del servidor). Vuelve a lanzarla: solo se rehará lo que falta." : p.error,
    meta: (p.failures as PackMeta | null) ?? null,
    summary: summary?.success ? summary.data : null,
    questions: Object.values(((p.game as { levels?: Record<string, GameBatch> } | null)?.levels ?? {})).reduce((a, b) => a + total(b), 0),
    model: p.model,
    updatedAt: p.updatedAt.toISOString(),
  };
}

/** Preguntas del juego guardadas para un tema (vacío si no hay paquete). Ids estables `pk:<tema>:…`. */
export async function packItems(userId: string, topicId: string): Promise<QuestItem[]> {
  const p = await prisma.studyTopicPack.findFirst({ where: { topicId, userId }, select: { game: true } });
  const levels = (p?.game as { levels?: Record<string, unknown> } | null)?.levels ?? {};
  return Object.values(levels).flatMap((raw) => {
    const b = gameBatchSchema.safeParse(raw);
    return b.success ? batchToItems(b.data, topicId) : [];
  });
}

export async function assertTopicOfModule(userId: string, moduleId: string, topicId: string) {
  await requireModule(userId, moduleId);
  const t = await prisma.studyTopic.findFirst({ where: { id: topicId, moduleId, userId }, select: { id: true } });
  if (!t) throw new ApiError(404, "Ese tema no existe en esta asignatura.");
}
