import "server-only";

import { createHash } from "node:crypto";

import { z } from "zod";

import { dateOnly, isoDate, toIsoDay } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { contributesLoad, dedupeKey, HISTORY_LIMITS, norm, SERIES_LIMITS, type HistoryRow } from "@/lib/training/history-import";
import { createSessionSchema } from "@/lib/training/schemas";
import { createTrainingSession, recomputeDailyLoads } from "@/lib/training/service";

export const historyRowSchema = z.object({
  line: z.number().int().min(0).max(100_000),
  date: isoDate,
  title: z.string().trim().min(1).max(200),
  kind: z.enum(["TRACK", "STRENGTH", "MIXED"]),
  modality: z.enum(["RUN", "SPRINT", "HURDLES", "SWIM", "CYCLE", "ROW", "WALK", "OTHER"]).nullish(),
  distanceM: z.number().min(0).max(1_000_000).nullish(),
  durationSec: z.number().int().min(0).max(86_400).nullish(),
  rpe: z.number().min(0).max(10).nullish(),
  manualTss: z.number().min(0).max(2000).nullish(),
  notes: z.string().max(5000).nullish(),
  typeText: z.string().max(30).nullish(),
  sets: z
    .array(z.object({ exercise: z.string().trim().min(1).max(100), reps: z.number().int().min(0).max(200), weightKg: z.number().min(0).max(1000), notes: z.string().max(500).nullish() }))
    .max(SERIES_LIMITS.setsPerDay)
    .optional(),
  estimated: z.boolean().optional(),
});
export const historyImportSchema = z.object({ rows: z.array(historyRowSchema).min(1).max(HISTORY_LIMITS.importRows) });

export type RowStatus = "new" | "duplicate" | "duplicate_in_file";

/** Sesión que se guarda por cada fila (siempre COMPLETED; `source` null: es dato propio, no de Strava). */
export function rowToSession(row: HistoryRow, exerciseIds: Map<string, string> = new Map()) {
  const tags = ["importado", ...(row.typeText ? [row.typeText.trim().toLowerCase().slice(0, 30)] : [])].filter((t, i, a) => t && a.indexOf(t) === i);
  const common = {
    date: row.date,
    status: "COMPLETED" as const,
    title: row.title,
    durationSec: row.durationSec ?? null,
    sessionRpe: row.rpe ?? null,
    manualTss: row.manualTss ?? null,
    notes: row.notes ?? null,
    tags,
    clientId: `hist-${createHash("sha256").update(dedupeKey(row)).digest("hex").slice(0, 40)}`,
  };
  const track = (modality: NonNullable<HistoryRow["modality"]>) => ({
    modality,
    distanceM: row.distanceM ?? null,
    movingTimeSec: row.distanceM ? (row.durationSec ?? null) : null,
  });
  const sets = (row.sets ?? []).flatMap((s) => {
    const exerciseId = exerciseIds.get(norm(s.exercise));
    return exerciseId ? [{ exerciseId, reps: s.reps, weightKg: s.weightKg, notes: s.notes ?? null }] : [];
  });
  if (row.kind === "STRENGTH") return createSessionSchema.parse({ ...common, type: "STRENGTH", strength: { sets } });
  if (row.kind === "TRACK") return createSessionSchema.parse({ ...common, type: "TRACK", track: track(row.modality ?? "OTHER") });
  return createSessionSchema.parse({ ...common, type: "MIXED", track: row.distanceM ? track("OTHER") : null, strength: sets.length ? { sets } : null });
}

/** Ejercicios por nombre (sin tildes ni mayúsculas): primero los tuyos, luego los de la biblioteca; el que no existe se crea como tuyo. */
async function resolveExercises(userId: string, rows: HistoryRow[]): Promise<Map<string, string>> {
  const wanted = new Map<string, string>();
  for (const r of rows) for (const s of r.sets ?? []) wanted.set(norm(s.exercise), s.exercise.trim());
  const ids = new Map<string, string>();
  if (!wanted.size) return ids;
  const existing = await prisma.exercise.findMany({ where: { OR: [{ userId }, { userId: null }] }, select: { id: true, name: true, userId: true } });
  // Los propios pisan a los globales con el mismo nombre
  for (const e of [...existing].sort((a, b) => Number(a.userId !== null) - Number(b.userId !== null))) ids.set(norm(e.name), e.id);
  for (const [key, name] of wanted) {
    if (ids.has(key)) continue;
    const loadType = /mancuerna|dumbbell/.test(key) ? "DUMBBELL" : /balon|medicinal/.test(key) ? "MEDBALL" : /goma|banda/.test(key) ? "BAND" : "BARBELL";
    const created = await prisma.exercise.create({ data: { userId, name, loadType } });
    ids.set(key, created.id);
  }
  return ids;
}

/** Marca cada fila: nueva, ya guardada (mismo día, título y duración) o repetida dentro del propio fichero. */
async function statuses(userId: string, rows: HistoryRow[]): Promise<RowStatus[]> {
  const dates = rows.map((r) => r.date).sort();
  const existing = await prisma.trainingSession.findMany({
    where: { userId, date: { gte: dateOnly(dates[0]), lte: dateOnly(dates[dates.length - 1]) } },
    select: { date: true, title: true, durationSec: true },
  });
  const have = new Set(existing.map((s) => dedupeKey({ date: toIsoDay(s.date), title: s.title, durationSec: s.durationSec })));
  const seen = new Set<string>();
  return rows.map((r) => {
    const key = dedupeKey(r);
    if (have.has(key)) return "duplicate";
    if (seen.has(key)) return "duplicate_in_file";
    seen.add(key);
    return "new";
  });
}

const summarize = (rows: HistoryRow[], st: RowStatus[]) => {
  const fresh = rows.filter((_, i) => st[i] === "new");
  return {
    new: fresh.length,
    duplicate: st.filter((s) => s === "duplicate").length,
    duplicateInFile: st.filter((s) => s === "duplicate_in_file").length,
    sets: fresh.reduce((n, r) => n + (r.sets?.length ?? 0), 0),
    noLoad: fresh.filter((r) => !contributesLoad(r)).length,
    from: fresh.map((r) => r.date).sort()[0] ?? null,
    to: fresh.map((r) => r.date).sort().at(-1) ?? null,
  };
};

export async function previewHistory(userId: string, rows: HistoryRow[]) {
  const st = await statuses(userId, rows);
  return { items: rows.map((r, i) => ({ line: r.line, status: st[i] })), counts: summarize(rows, st) };
}

/** Guarda las filas nuevas sin recalcular día a día y rehace CTL/ATL/TSB **una sola vez** al final. */
export async function importHistory(userId: string, rows: HistoryRow[]) {
  const st = await statuses(userId, rows);
  const exerciseIds = await resolveExercises(userId, rows.filter((_, i) => st[i] === "new"));
  let created = 0;
  let duplicates = st.filter((s) => s !== "new").length;
  let earliest: Date | null = null;
  try {
    for (let i = 0; i < rows.length; i++) {
      if (st[i] !== "new") continue;
      const s = await createTrainingSession(userId, null, rowToSession(rows[i], exerciseIds), { skipLoads: true });
      if ("duplicate" in s && s.duplicate) {
        duplicates++;
        continue;
      }
      created++;
      if (!earliest || s.date < earliest) earliest = s.date;
    }
  } finally {
    // También si algo falla a mitad: lo ya creado cuenta en la carga.
    if (earliest) await recomputeDailyLoads(userId, earliest);
  }
  return { created, duplicates, earliest: earliest ? toIsoDay(earliest) : null };
}
