import "server-only";

import { ApiError } from "@/lib/api";
import { addDays, dateOnly, toIsoDay } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { pickPatch } from "@/lib/rules/prefs";
import { dataKeyConfigured, openJson, sealJson } from "@/lib/security/data-key";

import { getCycle } from "./cycle-service";
import {
  energyAvailability,
  exerciseKcal,
  type HealthAlert,
  type HealthLogEntry,
  healthLogSchema,
  keySessionClashes,
  labAlerts,
  labSeries,
  pelvicAlert,
  periodAlerts,
  postpartumStatus,
  predictedDays,
  readWomenSettings,
  screenResult,
  type WomenSettings,
  womenSettingsSchema,
} from "./women";

/**
 * Salud de la mujer: todo cifrado, solo para su dueña (sin acceso del coach),
 * nunca se envía a la IA ni sale en el .ics o en el informe compartido.
 */
export async function getWomen(userId: string) {
  const [profile, rows] = await Promise.all([
    prisma.womenHealth.findUnique({ where: { userId } }),
    prisma.healthLog.findMany({ where: { userId }, orderBy: { date: "asc" } }),
  ]);
  const logs: Array<HealthLogEntry & { id: string }> = [];
  for (const r of rows) {
    const parsed = healthLogSchema.safeParse(openJson(r.data));
    if (parsed.success) logs.push({ ...parsed.data, id: r.id });
  }
  return { settings: readWomenSettings(profile ? openJson(profile.data) : null), configured: Boolean(profile), logs };
}

export async function saveWomenSettings(userId: string, patch: unknown): Promise<WomenSettings> {
  const cur = (await getWomen(userId)).settings;
  const next = womenSettingsSchema.parse({ ...cur, ...pickPatch(womenSettingsSchema.partial(), patch) });
  const data = sealJson(next);
  await prisma.womenHealth.upsert({ where: { userId }, create: { userId, data }, update: { data } });
  return next;
}

export async function addHealthLog(userId: string, entry: unknown) {
  const e = healthLogSchema.parse(entry);
  return prisma.healthLog.create({ data: { userId, date: dateOnly(e.date), data: sealJson(e) }, select: { id: true } });
}

export async function deleteHealthLog(userId: string, id: string) {
  const { count } = await prisma.healthLog.deleteMany({ where: { id, userId } });
  if (!count) throw new ApiError(404, "Registro no encontrado");
}

export async function deleteWomenData(userId: string) {
  await prisma.$transaction([prisma.healthLog.deleteMany({ where: { userId } }), prisma.womenHealth.deleteMany({ where: { userId } })]);
}

/** ¿Se muestra la sección? Perfil de mujer o ya hay datos, y el servidor puede cifrar. */
export async function womenEnabled(userId: string): Promise<boolean> {
  if (!dataKeyConfigured()) return false;
  const [p, has] = await Promise.all([
    prisma.athleteProfile.findUnique({ where: { userId }, select: { sex: true } }),
    prisma.womenHealth.count({ where: { userId } }),
  ]);
  return p?.sex === "FEMALE" || has > 0;
}

/** Todo lo que necesitan la página y los avisos de Inicio. */
export async function womenOverview(userId: string, today: string) {
  const day = dateOnly(today);
  const from = addDays(day, -6);
  const [{ settings, configured, logs }, cycle, macros, sessions, body, events, upcoming] = await Promise.all([
    getWomen(userId),
    getCycle(userId, 400),
    prisma.macros.groupBy({ by: ["date"], where: { userId, date: { gte: from, lte: day } }, _sum: { kcal: true } }),
    prisma.trainingSession.findMany({ where: { userId, status: "COMPLETED", date: { gte: from, lte: day } }, select: { date: true, durationSec: true, sessionRpe: true, type: true } }),
    Promise.all([
      prisma.recoveryMetrics.findFirst({ where: { userId, bodyWeightKg: { not: null }, date: { lte: day } }, orderBy: { date: "desc" }, select: { bodyWeightKg: true } }),
      prisma.recoveryMetrics.findFirst({ where: { userId, bodyFatPct: { not: null }, date: { lte: day } }, orderBy: { date: "desc" }, select: { bodyFatPct: true } }),
      prisma.athleteProfile.findUnique({ where: { userId }, select: { bodyWeightKg: true } }),
    ]),
    prisma.calendarEvent.findMany({ where: { userId, startAt: { gte: day, lte: addDays(day, 21) } }, select: { id: true, title: true, startAt: true, type: true } }),
    prisma.trainingSession.findMany({ where: { userId, status: "PLANNED", date: { gte: day, lte: addDays(day, 21) } }, select: { id: true, title: true, date: true } }),
  ]);
  const weight = body[0]?.bodyWeightKg ?? body[2]?.bodyWeightKg ?? null;
  const fat = body[1]?.bodyFatPct ?? null;
  const intake = new Map(macros.map((m) => [toIsoDay(m.date), m._sum.kcal ?? 0]));
  const eaDays = Array.from({ length: 7 }, (_, i) => {
    const d = toIsoDay(addDays(from, i));
    return {
      date: d,
      intakeKcal: intake.get(d) ?? null,
      exerciseKcal: sessions.filter((s) => toIsoDay(s.date) === d).reduce((a, s) => a + exerciseKcal(s, weight ?? 60), 0),
    };
  });
  const ea = energyAvailability(eaDays, weight, fat, settings.eaMin);
  const screens = logs.filter((l): l is Extract<HealthLogEntry, { kind: "SCREEN" }> & { id: string } => l.kind === "SCREEN");
  const lastScreen = screens.at(-1) ?? null;
  const screen = lastScreen ? { date: lastScreen.date, ...screenResult(lastScreen.answers) } : null;
  const labs = logs.filter((l): l is Extract<HealthLogEntry, { kind: "LAB" }> & { id: string } => l.kind === "LAB");
  const pelvic = logs.filter((l): l is Extract<HealthLogEntry, { kind: "PELVIC" }> & { id: string } => l.kind === "PELVIC");
  const pp = settings.mode === "POSTPARTUM" ? postpartumStatus(settings, today) : null;
  const predicted = predictedDays(cycle.settings, cycle.logs, today, toIsoDay(addDays(day, 21)));
  const clashes = keySessionClashes(predicted, [
    ...upcoming.map((s) => ({ id: s.id, date: toIsoDay(s.date), title: s.title ?? "", kind: "session" as const })),
    ...events.map((e) => ({ id: e.id, date: toIsoDay(e.startAt), title: e.title, kind: "event" as const, eventType: e.type })),
  ]);

  const alerts: HealthAlert[] = [];
  if (ea.ok && ea.low) {
    alerts.push({
      id: "ea-low",
      level: "warn",
      title: `Disponibilidad energética baja: ${ea.mean} kcal/kg MLG`,
      message: `Media de tus días registrados esta semana, por debajo de ${settings.eaMin}. Comer poco para lo que entrenas, mantenido en el tiempo, afecta a la regla, a los huesos y al rendimiento (RED-S). Sube la comida de los días de entreno y coméntalo con una nutricionista deportiva.`,
    });
  }
  if (screen?.level === "red") alerts.push({ id: "screen-red", level: "warn", title: "Cribado de RED-S: señal de alarma", message: "Alguna respuesta del último cribado pide una valoración médica. No es un diagnóstico, pero no lo dejes pasar." });
  else if (screen?.level === "amber") alerts.push({ id: "screen-amber", level: "info", title: "Cribado de RED-S: vigilar", message: "Varias respuestas del último cribado apuntan a que podrías estar comiendo poco para lo que entrenas. Revisa la disponibilidad energética y coméntalo con una nutricionista." });
  if (!lastScreen || addDays(dateOnly(lastScreen.date), 90) <= day) alerts.push({ id: "screen-due", level: "info", title: "Toca el cribado de RED-S", message: "8 preguntas, 1 minuto. Se repite cada 3 meses." });
  alerts.push(...periodAlerts(cycle.settings, cycle.logs, today));
  alerts.push(...labAlerts(labs, settings, today));
  const pa = pelvicAlert(pelvic, today);
  if (pa) alerts.push(pa);
  for (const c of clashes) {
    alerts.push({
      id: `clash-${c.id}`,
      level: "info",
      title: `«${c.title}» cae en un día con síntomas previstos`,
      message: `El ${c.date}. Si sueles encontrarte peor esos días, valora moverlo. Puedes ignorarlo.`,
    });
  }

  return {
    configured,
    settings,
    ea,
    screen,
    labs: labSeries(labs),
    labEntries: labs,
    pelvic: pelvic.slice(-10).reverse(),
    pillBreaks: logs.filter((l) => l.kind === "PILL_BREAK").slice(-6).reverse(),
    postpartum: pp,
    predicted,
    clashes,
    alerts,
  };
}

/** Avisos de Inicio (vacío si la sección no aplica o el servidor no puede descifrar). */
export async function womenAlertsToday(userId: string, today: string): Promise<{ alerts: HealthAlert[]; mode: WomenSettings["mode"] } | null> {
  if (!(await womenEnabled(userId))) return null;
  const o = await womenOverview(userId, today);
  // En Inicio solo lo importante: los avisos fuertes y los recordatorios de cribado o analítica
  return { alerts: o.alerts.filter((a) => a.level === "warn" || ["screen-due", "lab-due"].includes(a.id) || a.id.startsWith("clash-")), mode: o.settings.mode };
}

/** Modo embarazo o posparto (para bloquear la IA y ocultar avisos que no aplican). */
export async function womenMode(userId: string): Promise<WomenSettings["mode"]> {
  if (!dataKeyConfigured()) return "NONE";
  const p = await prisma.womenHealth.findUnique({ where: { userId } });
  return p ? readWomenSettings(openJson(p.data)).mode : "NONE";
}
