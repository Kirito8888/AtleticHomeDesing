import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api";
import { dateOnly } from "@/lib/dates";
import { cycleLogSchema, cycleSettingsSchema } from "@/lib/health/cycle";
import { logCycleDay, saveCycleSettings } from "@/lib/health/cycle-service";
import { addHealthLog, saveWomenSettings } from "@/lib/health/women-service";
import { prisma } from "@/lib/prisma";
import { dataKeyConfigured } from "@/lib/security/data-key";
import { createSessionSchema } from "@/lib/training/schemas";
import { createTrainingSession, recomputeDailyLoads } from "@/lib/training/service";

/**
 * Restaurar una exportación (lifeos-export/2) en una cuenta VACÍA (v1.6).
 * Entra: entrenos (sesiones con sus series, intentos e intervalos), umbrales, RM, tests, material,
 * mínimas, semanas tipo y prehabilitación; recuperación, molestias, antropometría, suplementos y citas;
 * ciclo y salud de la mujer (se vuelven a cifrar con la clave de este servidor); calendario y tareas;
 * comidas, agua, objetivos, recetas y lista de la compra; horario, estudio, plan de estudio, notas y
 * hábitos; plazos.
 * No entra: finanzas (asientos con cuentas) ni viajes, apuntes, chats y flashcards (los ficheros no van
 * en la exportación), planes importados o con IA, vínculos con el coach o de «entreno sola» ni enlaces
 * compartidos.
 */
type Row = Record<string, unknown>;
const arr = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const get = (o: unknown, ...path: string[]): unknown => path.reduce<unknown>((a, k) => (a && typeof a === "object" ? (a as Row)[k] : undefined), o);
/** Copia solo las columnas que existen en la tabla, sin id ni userId (de otra instalación). */
function pick(row: Row, fields: Record<string, string>, drop: string[] = []): Row {
  const out: Row = {};
  for (const k of Object.keys(fields)) if (!["id", "userId", "createdAt", "updatedAt", ...drop].includes(k) && row[k] != null) out[k] = row[k]; // los null se quedan en su valor por defecto (y los Json no admiten null)
  return out;
}
const day = (v: unknown) => (typeof v === "string" ? v.slice(0, 10) : null);

export async function isEmptyAccount(userId: string) {
  const [s, r, m, t] = await Promise.all([
    prisma.trainingSession.count({ where: { userId } }),
    prisma.recoveryMetrics.count({ where: { userId } }),
    prisma.macros.count({ where: { userId } }),
    prisma.financialTransaction.count({ where: { userId } }),
  ]);
  return s + r + m + t === 0;
}

export async function restoreExport(userId: string, data: unknown) {
  if (get(data, "format") !== "lifeos-export/2") throw new ApiError(400, "No es una exportación de LifeOS (formato lifeos-export/2)");
  if (!(await isEmptyAccount(userId))) throw new ApiError(409, "Solo se restaura en una cuenta vacía (sin sesiones, recuperación, comidas ni movimientos)");
  const counts: Record<string, number> = {};
  const skipped: string[] = [];
  const add = (k: string, n = 1) => (counts[k] = (counts[k] ?? 0) + n);

  // Ejercicios propios: se recrean y se mapean por nombre; los del catálogo, por nombre también
  const exMap = new Map<string, string>();
  const catalog = await prisma.exercise.findMany({ where: { userId: null }, select: { id: true, name: true } });
  const byName = new Map(catalog.map((e) => [e.name.toLowerCase(), e.id]));
  for (const e of arr(get(data, "training", "customExercises"))) {
    const created = await prisma.exercise.create({ data: { ...pick(e, Prisma.ExerciseScalarFieldEnum), userId } as Prisma.ExerciseUncheckedCreateInput, select: { id: true } }).catch(() => null);
    if (created) {
      exMap.set(String(e.id), created.id);
      add("ejercicios propios");
    }
  }

  // Umbrales (antes de las sesiones: el TSS de cada fecha los usa)
  for (const t of arr(get(data, "training", "thresholds"))) {
    await prisma.thresholdHistory.create({ data: { ...pick(t, Prisma.ThresholdHistoryScalarFieldEnum), userId } as Prisma.ThresholdHistoryUncheckedCreateInput });
    add("umbrales");
  }

  // Sesiones: se vuelven a validar y a crear (recalcula TSS y marcas)
  for (const s of arr(get(data, "training", "sessions"))) {
    const track = s.track as Row | null;
    const tech = s.technical as Row | null;
    const str = s.strength as Row | null;
    const sets = arr(get(str, "sets")).flatMap((x) => {
      const id = exMap.get(String(x.exerciseId)) ?? byName.get(String(get(x, "exercise", "name") ?? "").toLowerCase()) ?? (catalog.some((c) => c.id === x.exerciseId) ? String(x.exerciseId) : null);
      return id ? [{ exerciseId: id, reps: x.reps, weightKg: x.weightKg, rpe: x.rpe, rir: x.rir, isWarmup: x.isWarmup, velocityMs: x.velocityMs, suggestedKg: x.suggestedKg }] : [];
    });
    const input = {
      date: day(s.date),
      type: s.type,
      status: s.status,
      title: s.title,
      durationSec: s.durationSec,
      sessionRpe: s.sessionRpe,
      notes: s.notes,
      feelings: s.feelings ?? null,
      zoneFatigue: s.zoneFatigue ?? null,
      ...(track ? { track: { ...pick(track, Prisma.TrackSessionScalarFieldEnum, ["sessionId"]), intervals: arr(track.intervals).map((i) => pick(i, Prisma.TrackIntervalScalarFieldEnum, ["trackSessionId"])) } } : {}),
      ...(tech ? { technical: { ...pick(tech, Prisma.TechnicalSessionScalarFieldEnum, ["sessionId", "bestMarkM", "conditions"]), attempts: arr(tech.attempts).map((a) => pick(a, Prisma.TechnicalAttemptScalarFieldEnum, ["technicalSessionId", "order"])) } } : {}),
      ...(str ? { strength: { bodyWeightKg: str.bodyWeightKg ?? null, sets } } : {}),
    };
    const parsed = createSessionSchema.safeParse(JSON.parse(JSON.stringify(input, (_k, v) => (v === null ? undefined : v))));
    if (!parsed.success) {
      skipped.push(`sesión del ${input.date}`);
      continue;
    }
    await createTrainingSession(userId, null, parsed.data);
    add("sesiones");
  }

  // Tablas simples: copia directa de columnas
  const simple: Array<[string, unknown, Record<string, string>, (d: Row) => Promise<unknown>, string[]?]> = [
    ["RM", get(data, "training", "oneRepMaxes"), Prisma.OneRepMaxScalarFieldEnum, (d) => prisma.oneRepMax.create({ data: d as never })],
    ["tests físicos", get(data, "training", "physicalTests"), Prisma.TestResultScalarFieldEnum, (d) => prisma.testResult.create({ data: d as never })],
    ["material", get(data, "training", "equipment"), Prisma.EquipmentScalarFieldEnum, (d) => prisma.equipment.create({ data: { ...d, transactionId: null } as never })],
    ["días de recuperación", get(data, "recovery", "metrics"), Prisma.RecoveryMetricsScalarFieldEnum, (d) => prisma.recoveryMetrics.create({ data: d as never })],
    ["molestias", get(data, "recovery", "injuries"), Prisma.InjuryScalarFieldEnum, (d) => prisma.injury.create({ data: d as never })],
    ["eventos", get(data, "planning", "calendarEvents"), Prisma.CalendarEventScalarFieldEnum, (d) => prisma.calendarEvent.create({ data: { ...d, cycleId: null } as never })],
    ["tareas", get(data, "planning", "tasks"), Prisma.TaskScalarFieldEnum, (d) => prisma.task.create({ data: d as never })],
    ["comidas", get(data, "nutrition", "entries"), Prisma.MacrosScalarFieldEnum, (d) => prisma.macros.create({ data: { ...d, foodProductId: null, customName: (d.customName as string | null) ?? "Alimento (restaurado)" } as never })],
    ["objetivos de nutrición", get(data, "nutrition", "goals"), Prisma.NutritionGoalScalarFieldEnum, (d) => prisma.nutritionGoal.create({ data: d as never })],
    ["agua", get(data, "nutrition", "hydration"), Prisma.HydrationLogScalarFieldEnum, (d) => prisma.hydrationLog.create({ data: d as never })],
    ["bloques de estudio", get(data, "study", "sessions"), Prisma.StudySessionScalarFieldEnum, (d) => prisma.studySession.create({ data: d as never })],
    // v1.6
    ["mínimas", get(data, "training", "minimums"), Prisma.MinimumScalarFieldEnum, (d) => prisma.minimum.create({ data: d as never })],
    ["semanas tipo", get(data, "training", "weekTemplates"), Prisma.WeekTemplateScalarFieldEnum, (d) => prisma.weekTemplate.create({ data: d as never })],
    ["antropometría", get(data, "recovery", "bodyMeasures"), Prisma.BodyMeasureScalarFieldEnum, (d) => prisma.bodyMeasure.create({ data: d as never })],
    ["suplementos", get(data, "recovery", "supplements"), Prisma.SupplementScalarFieldEnum, (d) => prisma.supplement.create({ data: d as never })],
    ["citas", get(data, "recovery", "appointments"), Prisma.AppointmentScalarFieldEnum, (d) => prisma.appointment.create({ data: d as never })],
    ["recetas", get(data, "nutrition", "recipes"), Prisma.RecipeScalarFieldEnum, (d) => prisma.recipe.create({ data: d as never })],
    ["lista de la compra", get(data, "nutrition", "shopping"), Prisma.ShoppingItemScalarFieldEnum, (d) => prisma.shoppingItem.create({ data: d as never })],
    ["notas", get(data, "study", "grades"), Prisma.GradeScalarFieldEnum, (d) => prisma.grade.create({ data: d as never })],
    ["plazos", get(data, "finance", "deadlines"), Prisma.DeadlineScalarFieldEnum, (d) => prisma.deadline.create({ data: d as never })],
  ];
  // Clases y exámenes: se guardan los ids nuevos para enlazar los bloques del plan de estudio
  const slotMap = new Map<string, string>();
  for (const r of arr(get(data, "study", "classSlots"))) {
    const created = await prisma.classSlot.create({ data: { ...pick(r, Prisma.ClassSlotScalarFieldEnum), userId } as never, select: { id: true } }).catch(() => null);
    if (created) {
      slotMap.set(String(r.id), created.id);
      add("clases y exámenes");
    } else skipped.push("clases y exámenes");
  }
  for (const r of arr(get(data, "study", "planBlocks"))) {
    await prisma.studyPlanBlock
      .create({ data: { ...pick(r, Prisma.StudyPlanBlockScalarFieldEnum, ["examId"]), examId: slotMap.get(String(r.examId)) ?? null, userId } as never })
      .then(() => add("plan de estudio"), () => skipped.push("plan de estudio"));
  }
  // Rutinas de prehabilitación con sus días
  for (const r of arr(get(data, "training", "prehabRoutines"))) {
    const routine = await prisma.prehabRoutine.create({ data: { ...pick(r, Prisma.PrehabRoutineScalarFieldEnum), userId } as never, select: { id: true } }).catch(() => null);
    if (!routine) {
      skipped.push("prehabilitación");
      continue;
    }
    const dates = arr(r.logs).flatMap((l) => (day(l.date) ? [dateOnly(day(l.date)!)] : []));
    if (dates.length) await prisma.prehabLog.createMany({ data: dates.map((date) => ({ userId, routineId: routine.id, date })), skipDuplicates: true });
    add("prehabilitación");
  }
  for (const [label, rows, fields, create] of simple) {
    for (const r of arr(rows)) {
      try {
        await create({ ...pick(r, fields), userId });
        add(label);
      } catch {
        skipped.push(label);
      }
    }
  }
  // Hábitos con sus días
  for (const h of arr(get(data, "study", "habits"))) {
    const habit = await prisma.habit.create({ data: { userId, name: String(h.name), archived: Boolean(h.archived) } });
    const dates = arr(h.logs).flatMap((l) => (day(l.date) ? [dateOnly(day(l.date)!)] : []));
    if (dates.length) await prisma.habitLog.createMany({ data: dates.map((date) => ({ userId, habitId: habit.id, date })), skipDuplicates: true });
    add("hábitos");
  }

  // Ciclo y salud de la mujer: venían descifrados; se cifran con la clave de este servidor
  if (dataKeyConfigured()) {
    const cyc = get(data, "recovery", "menstrualCycle");
    const cs = cycleSettingsSchema.safeParse(get(cyc, "settings"));
    if (cs.success) await saveCycleSettings(userId, cs.data);
    for (const l of arr(get(cyc, "logs"))) {
      const p = cycleLogSchema.safeParse(l);
      if (p.success) {
        await logCycleDay(userId, p.data);
        add("días del ciclo");
      }
    }
    const wh = get(data, "recovery", "womenHealth");
    if (get(wh, "settings")) await saveWomenSettings(userId, get(wh, "settings")).catch(() => skipped.push("ajustes de salud de la mujer"));
    for (const l of arr(get(wh, "logs"))) {
      const { id: _id, ...entry } = l;
      void _id;
      await addHealthLog(userId, entry).then(
        () => add("registros de salud de la mujer"),
        () => skipped.push("registro de salud de la mujer"),
      );
    }
  }

  const first = await prisma.trainingSession.findFirst({ where: { userId }, orderBy: { date: "asc" }, select: { date: true } });
  if (first) await recomputeDailyLoads(userId, first.date);
  return { counts, skipped: skipped.length, skippedSample: [...new Set(skipped)].slice(0, 10) };
}
