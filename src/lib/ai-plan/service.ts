import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { generateJson } from "@/lib/ai/llm";
import { assertAiAllowed } from "@/lib/ai/guard";
import { ApiError } from "@/lib/api";
import { dateOnly } from "@/lib/dates";
import { materialize } from "@/lib/planning/plan-import/service";
import type { PlanBlock } from "@/lib/planning/plan-import/types";
import { prisma } from "@/lib/prisma";

import { chooseAlternative, type Rating, swapForEquipment } from "./adjust";
import { expandAiPlan, toRow } from "./expand";
import { fakeAiPlan } from "./fake";
import { proposeWeekChanges, type WeekProposal } from "./feedback";
import { allowedEquipment, type Equipment, type Location, LOCATIONS, type PlanRequest, SAFETY } from "./options";
import { buildPlanPrompt, buildSwapPrompt, PLAN_SYSTEM } from "./prompt";
import { type AiPlan, aiPlanSchema, aiSwapSchema } from "./schema";
import { validateAiPlan } from "./validate";
import { womenMode } from "@/lib/health/women-service";

/** Para tests: sustituyen la llamada a Gemini y la comprobación de clave + consentimiento. */
export type AiDeps = { generate?: typeof generateJson; assertAllowed?: (userId: string) => Promise<void>; womenMode?: (userId: string) => Promise<string> };

/** Solo para tests y E2E (sin clave de Gemini): LIFEOS_FAKE_AI=1. */
const fakeAi = () => process.env.LIFEOS_FAKE_AI === "1";

/**
 * Genera un plan con IA y lo guarda como BORRADOR (no crea sesiones hasta
 * activarlo). Lo que se envía a Gemini: el cuestionario (sin datos del ciclo
 * ni personales). Lo que devuelve se valida y, si incumple, se pide una vez más.
 */
export async function generateAiPlan(userId: string, request: PlanRequest, deps: AiDeps = {}) {
  if (request.safety.length) {
    throw new ApiError(
      422,
      `Por tu respuesta (${request.safety.map((s) => SAFETY[s].toLowerCase()).join("; ")}), no voy a generar un plan: consulta antes con un profesional sanitario que te valore. Cuando te dé el visto bueno, vuelve a intentarlo.`,
      { code: "safety" },
    );
  }
  // Embarazo o posparto (Salud de la mujer): un plan genérico no es seguro. Solo se lee el modo, nada se envía.
  if ((await (deps.womenMode ?? womenMode)(userId)) !== "NONE") {
    throw new ApiError(422, "Con el modo embarazo o posparto activo no se generan planes con IA: sigue las pautas de tu médica o matrona y la guía de vuelta por fases de «Salud de la mujer».", { code: "safety" });
  }
  if (!fakeAi()) await (deps.assertAllowed ?? assertAiAllowed)(userId);
  const generate = deps.generate ?? generateJson;

  let plan: AiPlan | null = null;
  let warnings: string[] = [];
  let model = "simulado";
  for (let attempt = 0; attempt < 2; attempt++) {
    if (fakeAi()) plan = aiPlanSchema.parse(fakeAiPlan(request));
    else {
      const res = await generate(aiPlanSchema, { userId, system: PLAN_SYSTEM, prompt: buildPlanPrompt(request, attempt ? warnings : undefined), temperature: 0.5 });
      plan = res.data;
      model = res.model;
    }
    warnings = validateAiPlan(plan, request);
    if (!warnings.length) break;
  }

  return saveDraftPlan(userId, plan!, request, { source: "AI", prefix: "IA", meta: { request, model, warnings, generatedAt: new Date().toISOString() }, warnings });
}

/**
 * Guarda un plan generado (IA o rutina del cuestionario) como BORRADOR: mesociclo + días con fecha.
 * No toca nada más hasta que se activa.
 */
export async function saveDraftPlan(userId: string, plan: AiPlan, request: PlanRequest, o: { source: "AI" | "ROUTINE"; prefix: string; meta: Record<string, unknown>; warnings: string[] }) {
  const code = await nextCode(userId, o.prefix);
  const e = expandAiPlan(plan, request, code);
  if (!e.days.length) throw new ApiError(422, "El plan no tiene ningún día a partir de la fecha elegida");

  const meso = await prisma.$transaction(async (tx) => {
    const m = await tx.planMeso.create({
      data: {
        userId,
        code,
        name: e.name,
        startDate: dateOnly(e.start),
        endDate: dateOnly(e.end),
        intro: e.intro as Prisma.InputJsonValue,
        weeks: e.weeks as Prisma.InputJsonValue,
        variants: [],
        source: o.source,
        status: "DRAFT",
        meta: o.meta as Prisma.InputJsonValue,
      },
    });
    await tx.planDay.createMany({
      data: e.days.map((d) => ({
        userId,
        mesoId: m.id,
        key: d.key,
        week: d.week,
        code: d.code,
        date: dateOnly(d.date),
        title: d.title,
        durationMin: d.durationMin,
        type: d.type,
        weekTitle: d.weekTitle,
        content: d.blocks as Prisma.InputJsonValue,
        light: d.light as Prisma.InputJsonValue,
      })),
    });
    return m;
  });
  return { code: meso.code, days: e.days.length, warnings: o.warnings, overlapDays: await overlapDays(userId, meso.id, e.start, e.end) };
}

async function nextCode(userId: string, prefix = "IA"): Promise<string> {
  const codes = await prisma.planMeso.findMany({ where: { userId, code: { startsWith: prefix } }, select: { code: true } });
  const max = codes.reduce((a, c) => Math.max(a, Number(c.code.slice(prefix.length)) || 0), 0);
  return `${prefix}${max + 1}`;
}

/** Días con sesión de otros planes activos en las mismas fechas (p. ej. el de la entrenadora). */
export async function overlapDays(userId: string, mesoId: string, start: string, end: string): Promise<number> {
  return prisma.planDay.count({
    where: { userId, mesoId: { not: mesoId }, sessionId: { not: null }, meso: { status: "ACTIVE" }, date: { gte: dateOnly(start), lte: dateOnly(end) } },
  });
}

async function aiMeso(userId: string, code: string, sources: string[] = ["AI"]) {
  const meso = await prisma.planMeso.findUnique({ where: { userId_code: { userId, code } } });
  if (!meso || !sources.includes(meso.source)) throw new ApiError(404, "Plan no encontrado");
  return meso;
}

/** Pasa el borrador a tus entrenamientos: crea el mesociclo y las sesiones planificadas. */
export async function activateAiPlan(userId: string, code: string) {
  // También activa los planes propios (MANUAL) y las rutinas del cuestionario (ROUTINE, v1.7)
  const meso = await aiMeso(userId, code, ["AI", "MANUAL", "ROUTINE"]);
  return prisma.$transaction(
    async (tx) => {
      let cycleId = meso.cycleId;
      if (!cycleId) {
        cycleId = (
          await tx.trainingCycle.create({
            data: { userId, level: "MESO", name: `${meso.code} · ${meso.name}`.slice(0, 120), startDate: meso.startDate, endDate: meso.endDate, color: "#7c3aed" },
          })
        ).id;
      }
      await tx.planMeso.update({ where: { id: meso.id }, data: { status: "ACTIVE", cycleId } });
      return materialize(tx, userId, meso.id);
    },
    { timeout: 60_000, maxWait: 10_000 },
  );
}

/** Vuelve a generar con las mismas respuestas; el borrador anterior se borra. */
export async function regenerateAiPlan(userId: string, code: string, deps: AiDeps = {}) {
  const meso = await aiMeso(userId, code);
  if (meso.status !== "DRAFT") throw new ApiError(409, "Solo se regeneran borradores: este plan ya está en tus entrenamientos");
  const request = (meso.meta as { request: PlanRequest }).request;
  const res = await generateAiPlan(userId, request, deps);
  await prisma.planMeso.delete({ where: { id: meso.id } });
  return res;
}

async function dayOf(userId: string, dayId: string) {
  const day = await prisma.planDay.findFirst({ where: { id: dayId, userId }, include: { meso: true } });
  if (!day) throw new ApiError(404, "Día no encontrado");
  return day;
}

async function rematerialize(userId: string, mesoId: string) {
  await prisma.$transaction((tx) => materialize(tx, userId, mesoId), { timeout: 60_000, maxWait: 10_000 });
}

/** Versión suave o normal para un día. */
export async function setDayMode(userId: string, dayId: string, mode: "LIGHT" | null) {
  const day = await dayOf(userId, dayId);
  if (mode === "LIGHT" && !day.light) throw new ApiError(400, "Este día no tiene versión suave");
  await prisma.planDay.update({ where: { id: day.id }, data: { mode } });
  await rematerialize(userId, day.mesoId);
  return { mode };
}

/**
 * Hoy entreno en otro sitio o con otro material: cambia los ejercicios que no
 * se pueden hacer por alternativas compatibles; si alguno no tiene, se pide a
 * la IA solo ese cambio (si está permitida).
 */
export async function swapDayLocation(userId: string, dayId: string, location: Location, equipment: Equipment[], deps: AiDeps = {}) {
  const day = await dayOf(userId, dayId);
  const allowed = allowedEquipment(location, equipment);
  const content = day.content as PlanBlock[];
  const res = swapForEquipment(content, allowed);
  let blocks = res.blocks;
  let aiSwapped = 0;
  if (res.unresolved.length) {
    const meta = day.meso.meta as { request?: PlanRequest } | null;
    const req = meta?.request;
    // Una sustitución por cada ejercicio sin alternativa, en el mismo orden (null = se queda).
    let replacements: Array<ReturnType<typeof toRow> | null> | null = null;
    if (fakeAi()) {
      replacements = res.unresolved.map((u) => ({ ...u.item, exercise: `${u.item.exercise} (adaptado)`, equipment: ["peso_corporal"], original: u.item.exercise }));
    } else {
      try {
        await (deps.assertAllowed ?? assertAiAllowed)(userId);
        const out = await (deps.generate ?? generateJson)(aiSwapSchema, {
          userId,
          system: PLAN_SYSTEM,
          prompt: buildSwapPrompt({
            exercises: res.unresolved.map((u) => `${u.item.exercise} (${u.item.sets})`),
            location,
            equipment: [...allowed],
            areas: req?.areas ?? [],
            avoid: req?.avoid ?? [],
          }),
          temperature: 0.4,
        });
        replacements = res.unresolved.map((_, k) => {
          const e = out.data.exercises[k];
          return e && e.equipment.every((q) => allowed.has(q)) ? toRow(e) : null;
        });
      } catch {
        replacements = null; // sin IA: se quedan como estaban y se avisa
      }
    }
    if (replacements?.length) {
      blocks = blocks.map((b, bi) =>
        b.kind !== "table"
          ? b
          : {
              ...b,
              rows: b.rows.map((r, ri) => {
                const k = res.unresolved.findIndex((u) => u.block === bi && u.row === ri);
                const rep = k >= 0 ? replacements![k] : null;
                if (!rep) return r;
                aiSwapped++;
                return { ...rep, sets: r.sets, original: r.original ?? r.exercise };
              }),
            },
      );
    }
  }
  blocks = blocks.map((b) => (b.kind === "text" && b.title === "Dónde" ? { ...b, text: LOCATIONS[location] } : b));
  await prisma.planDay.update({ where: { id: day.id }, data: { content: blocks as Prisma.InputJsonValue } });
  return { swapped: res.swapped + aiSwapped, pending: res.unresolved.length - aiSwapped };
}

/** Elegir otra de las alternativas de un ejercicio. */
export async function chooseDayAlternative(userId: string, dayId: string, block: number, row: number, alt: number) {
  const day = await dayOf(userId, dayId);
  const blocks = chooseAlternative(day.content as PlanBlock[], block, row, alt);
  await prisma.planDay.update({ where: { id: day.id }, data: { content: blocks as Prisma.InputJsonValue } });
  return { ok: true };
}

/** Días de la semana siguiente y cuáles ya se hicieron (no se tocan). */
async function nextWeekState(userId: string, mesoId: string, week: number, db: Pick<typeof prisma, "planDay" | "trainingSession"> = prisma) {
  const days = await db.planDay.findMany({ where: { mesoId, week: week + 1 }, orderBy: { key: "asc" } });
  const ids = days.flatMap((d) => (d.sessionId ? [d.sessionId] : []));
  const done = new Set((await db.trainingSession.findMany({ where: { userId, id: { in: ids }, status: { not: "PLANNED" } }, select: { id: true } })).map((s) => s.id));
  return { days, done };
}

const appliedWeeks = (meta: unknown): number[] => {
  const a = (meta as { feedbackApplied?: unknown } | null)?.feedbackApplied;
  return Array.isArray(a) ? a.filter((n): n is number => typeof n === "number") : [];
};

/**
 * «¿Cómo fue la semana?»: guarda la valoración y propone cambios para la
 * siguiente (solo días aún pendientes). NO escribe en el plan: eso lo hace
 * `applyWeekFeedback` tras confirmar. Con dolor ≥ 4 propone la versión suave.
 */
export async function submitWeekFeedback(userId: string, code: string, week: number, rating: Rating, pain: number | null) {
  const meso = await prisma.planMeso.findUnique({ where: { userId_code: { userId, code } } });
  if (!meso) throw new ApiError(404, "Plan no encontrado");
  await prisma.planFeedback.upsert({
    where: { mesoId_week: { mesoId: meso.id, week } },
    create: { userId, mesoId: meso.id, week, rating, pain },
    update: { rating, pain },
  });
  return { saved: true, proposal: await previewWeekFeedback(userId, code, week) };
}

/** Vista previa de lo que cambiaría (solo lecturas). `null` si no hay valoración o ya se aplicó. */
export async function previewWeekFeedback(userId: string, code: string, week: number): Promise<WeekProposal | null> {
  const meso = await prisma.planMeso.findUnique({ where: { userId_code: { userId, code } } });
  if (!meso) throw new ApiError(404, "Plan no encontrado");
  if (appliedWeeks(meso.meta).includes(week)) return null;
  const fb = await prisma.planFeedback.findUnique({ where: { mesoId_week: { mesoId: meso.id, week } } });
  if (!fb) return null;
  const { days, done } = await nextWeekState(userId, meso.id, week);
  return proposeWeekChanges(days, done, fb.rating as Rating, fb.pain);
}

/** Aplica la propuesta confirmada, una sola vez; rechaza si el plan cambió desde la vista previa. */
export async function applyWeekFeedback(userId: string, code: string, week: number, version: string) {
  const stale = () => new ApiError(409, "El plan cambió desde la propuesta: revísala de nuevo");
  return prisma.$transaction(
    async (tx) => {
      const meso = await tx.planMeso.findUnique({ where: { userId_code: { userId, code } } });
      if (!meso) throw new ApiError(404, "Plan no encontrado");
      const applied = appliedWeeks(meso.meta);
      if (applied.includes(week)) throw new ApiError(409, "Estos cambios ya se aplicaron");
      const fb = await tx.planFeedback.findUnique({ where: { mesoId_week: { mesoId: meso.id, week } } });
      if (!fb) throw new ApiError(409, "Primero envía cómo fue la semana");
      const { days, done } = await nextWeekState(userId, meso.id, week, tx);
      const proposal = proposeWeekChanges(days, done, fb.rating as Rating, fb.pain);
      if (proposal.version !== version) throw stale();
      const updatedAt = new Map(days.map((d) => [d.id, d.updatedAt]));
      for (const c of proposal.days) {
        const r = await tx.planDay.updateMany({ where: { id: c.dayId, updatedAt: updatedAt.get(c.dayId) }, data: { content: c.content as Prisma.InputJsonValue, mode: c.mode } });
        if (r.count !== 1) throw stale();
      }
      const meta = { ...((meso.meta as Record<string, unknown> | null) ?? {}), feedbackApplied: [...applied, week] };
      await tx.planMeso.update({ where: { id: meso.id }, data: { meta: meta as Prisma.InputJsonValue } });
      if (proposal.days.length) await materialize(tx, userId, meso.id);
      return { adjusted: proposal.days.length };
    },
    { timeout: 60_000, maxWait: 10_000 },
  );
}
