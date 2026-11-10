import "server-only";

import { ApiError } from "@/lib/api";
import { dateOnly, toIsoDay } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { ensureHealthConsent } from "@/lib/privacy/service";
import { openJson, sealJson } from "@/lib/security/data-key";

import { computeIsak, type IsakInput, isakInputSchema, type IsakResult, parseIsakFile } from "./isak";

/**
 * Composición corporal ISAK: medidas y resultado cifrados (`BodyComposition.data`), solo para su
 * dueña. Sin `athleteId`: ni la entrenadora ni la IA ni el informe semanal ni el .ics lo leen.
 */
export type BodyCompositionRecord = { id: string; date: string; source: "manual" | "import"; input: IsakInput; result: IsakResult };
type Stored = { input: IsakInput; result: IsakResult; source: "manual" | "import" };

export async function listBodyComposition(userId: string): Promise<BodyCompositionRecord[]> {
  const rows = await prisma.bodyComposition.findMany({ where: { userId }, orderBy: [{ date: "asc" }, { createdAt: "asc" }] });
  const out: BodyCompositionRecord[] = [];
  for (const r of rows) {
    const s = openJson<Stored>(r.data);
    const p = isakInputSchema.safeParse(s.input);
    if (p.success) out.push({ id: r.id, date: toIsoDay(r.date), source: s.source, input: p.data, result: computeIsak(p.data) });
  }
  return out;
}

/** Calcula sin guardar. */
export function previewBodyComposition(input: unknown): IsakResult {
  return computeIsak(isakInputSchema.parse(input));
}

/** Guarda recalculando en el servidor: el resultado que mande el cliente no se usa. */
export async function saveBodyComposition(userId: string, input: unknown, source: "manual" | "import" = "manual") {
  const i = isakInputSchema.parse(input);
  await ensureHealthConsent(userId);
  const data = sealJson({ input: i, result: computeIsak(i), source } satisfies Stored);
  return prisma.bodyComposition.create({ data: { userId, date: dateOnly(i.date), data }, select: { id: true } });
}

export async function deleteBodyComposition(userId: string, id: string) {
  const { count } = await prisma.bodyComposition.deleteMany({ where: { id, userId } });
  if (!count) throw new ApiError(404, "Medición no encontrada");
}

/** CSV/JSON: sin `commit` solo previsualiza (con el cálculo de cada fila válida); con `commit` guarda las válidas. */
export async function importBodyComposition(userId: string, text: string, kind: "csv" | "json", commit: boolean) {
  const rows = parseIsakFile(text, kind);
  const valid = rows.filter((r) => r.input);
  const preview = rows.map((r) => ({ line: r.line, errors: r.errors, date: r.input?.date, result: r.input ? computeIsak(r.input) : undefined }));
  if (!commit) return { total: rows.length, valid: valid.length, rows: preview.slice(0, 50), imported: 0 };
  if (!valid.length) throw new ApiError(400, "No hay filas válidas que importar");
  await ensureHealthConsent(userId);
  const data = valid.map((r) => ({ userId, date: dateOnly(r.input!.date), data: sealJson({ input: r.input!, result: computeIsak(r.input!), source: "import" } satisfies Stored) }));
  await prisma.bodyComposition.createMany({ data });
  return { total: rows.length, valid: valid.length, rows: preview.slice(0, 50), imported: valid.length };
}
