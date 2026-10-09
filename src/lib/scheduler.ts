import "server-only";

import { generateWeeklyCoachReport } from "@/lib/ai/coach";
import { addDays, dateOnly, localDay, startOfIsoWeek, today, toIsoDay } from "@/lib/dates";
import { formatEur } from "@/lib/format";
import { env } from "@/lib/env";
import { runDueSubscriptions } from "@/lib/finance/service";
import { prisma } from "@/lib/prisma";
import { dueReminders, publicTitle } from "@/lib/push/reminders";
import { deadlineState } from "@/lib/finance/trips";
import { notifyOnce } from "@/lib/push/service";
import { readPrefs } from "@/lib/rules/prefs";
import { daysAgo, retentionDays } from "@/lib/privacy/retention";
import { periodStarts } from "@/lib/health/cycle";
import { getCycle } from "@/lib/health/cycle-service";
import { runSafetyJob } from "@/lib/health/safety-service";
import { readWomenSettings } from "@/lib/health/women";
import { dataKeyConfigured, openJson } from "@/lib/security/data-key";

const HOUR_MS = 60 * 60_000;

/** Cobra las suscripciones vencidas de todos los usuarios (idempotente: avanza nextChargeDate). */
export async function runSubscriptionsJob(): Promise<number> {
  const users = await prisma.subscription.findMany({
    where: { isActive: true, autoPost: true, nextChargeDate: { lte: today() } },
    distinct: ["userId"],
    select: { userId: true },
  });
  let posted = 0;
  for (const { userId } of users) {
    try {
      posted += (await runDueSubscriptions(userId)).length;
    } catch (err) {
      console.error(`[scheduler] suscripciones de ${userId}:`, err);
    }
  }
  return posted;
}

/**
 * Informe del coach IA de la semana anterior para quien lo autorizó y entrenó
 * esa semana. Idempotente: salta a quien ya tiene informe de esa semana, así
 * que si el contenedor estaba apagado el lunes, se genera al arrancar.
 */
export async function runWeeklyCoachJob(): Promise<number> {
  if (!env().GEMINI_API_KEY) return 0;
  const weekStart = startOfIsoWeek(addDays(today(), -7));
  const weekEnd = addDays(weekStart, 6);
  const users = await prisma.user.findMany({
    where: {
      aiConsentAt: { not: null },
      trainingSessions: { some: { status: "COMPLETED", date: { gte: weekStart, lte: weekEnd } } },
      coachReports: { none: { weekStart } },
    },
    select: { id: true },
  });
  let generated = 0;
  for (const { id } of users) {
    try {
      await generateWeeklyCoachReport(id, weekStart);
      generated++;
      await notifyOnce(id, `coach:${toIsoDay(weekStart)}`, {
        title: "Informe semanal del coach",
        body: "Ya tienes el análisis de tu semana y las recomendaciones para la siguiente.",
        url: "/study?tab=coach",
        tag: "coach",
      });
    } catch (err) {
      console.error(`[scheduler] coach semanal de ${id}:`, err);
    }
  }
  return generated;
}

/**
 * Minimización de datos (v1.7: plazos de conservación configurables, src/lib/privacy/retention.ts).
 * Se ejecuta en cada pasada; borrar lo ya borrado no cuesta nada.
 */
export async function pruneAuditJob(now = new Date()): Promise<number> {
  const d = retentionDays(process.env);
  const { count } = await prisma.securityEvent.deleteMany({ where: { createdAt: { lt: daysAgo(now, d.AUDIT) } } });
  await prisma.notificationLog.deleteMany({ where: { sentAt: { lt: daysAgo(now, d.NOTIFICATIONS) } } });
  await prisma.sharedReport.deleteMany({ where: { expiresAt: { lt: daysAgo(now, d.EXPIRED_LINKS) } } });
  await prisma.healthReport.deleteMany({ where: { OR: [{ expiresAt: { lt: daysAgo(now, d.EXPIRED_LINKS) } }, { revokedAt: { lt: daysAgo(now, d.EXPIRED_LINKS) } }] } });
  await prisma.safetyTrip.deleteMany({ where: { endedAt: { lt: daysAgo(now, d.SAFETY_TRIPS) } } });
  await prisma.privacyRequest.deleteMany({ where: { resolvedAt: { lt: daysAgo(now, d.PRIVACY_REQUESTS) } } });
  await prisma.webAuthnChallenge.deleteMany({ where: { expiresAt: { lt: now } } });
  return count;
}

/** Hora local de Madrid (0–23). */
const madridHour = () => Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", hour: "2-digit", hourCycle: "h23" }).format(new Date()));

/**
 * Resumen diario por push (desde las 7:00, una vez al día): sesiones planificadas
 * para hoy y suscripciones que se cobran mañana. Solo a quien tenga dispositivos
 * suscritos y algo que contar.
 */
export async function runDailyDigestJob(hour = madridHour()): Promise<number> {
  if (hour < 7) return 0;
  const day = today();
  const tomorrow = addDays(day, 1);
  const users = await prisma.user.findMany({
    where: { pushSubscriptions: { some: {} }, notificationLogs: { none: { key: `digest:${toIsoDay(day)}` } } },
    select: {
      id: true,
      trainingSessions: { where: { date: day, status: "PLANNED" }, select: { title: true, type: true } },
      subscriptions: { where: { isActive: true, nextChargeDate: tomorrow }, select: { name: true, amountCents: true } },
    },
  });
  let sent = 0;
  for (const u of users) {
    const parts: string[] = [];
    if (u.trainingSessions.length) {
      const names = u.trainingSessions.map((s) => s.title).filter(Boolean).join(", ");
      parts.push(`${u.trainingSessions.length} sesión${u.trainingSessions.length > 1 ? "es" : ""} planificada${u.trainingSessions.length > 1 ? "s" : ""}${names ? ` (${names})` : ""}`);
    }
    if (u.subscriptions.length) {
      parts.push(`mañana se cobra ${u.subscriptions.map((s) => `${s.name} ${formatEur(s.amountCents)}`).join(", ")}`);
    }
    if (!parts.length) continue;
    const ok = await notifyOnce(u.id, `digest:${toIsoDay(day)}`, {
      title: "Tu día en LifeOS",
      body: parts.join(" · ").replace(/^./, (c) => c.toUpperCase()),
      url: u.trainingSessions.length ? "/training" : "/finance",
      tag: "digest",
    });
    if (ok) sent++;
  }
  return sent;
}

/** Día de la semana en Madrid: 0 = lunes … 6 = domingo. */
const madridWeekday = () => ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", weekday: "short" }).format(new Date()));

/**
 * Recordatorios de «Mis reglas» (cada hora, una vez al día cada uno):
 * «mañana toca…», control rápido del lunes y pesarse L-X-V.
 */
export async function runRemindersJob(hour = madridHour(), weekday = madridWeekday()): Promise<number> {
  const day = today();
  const key = toIsoDay(day);
  const users = await prisma.user.findMany({
    where: { pushSubscriptions: { some: {} } },
    select: {
      id: true,
      athleteProfile: { select: { prefs: true } },
      trainingSessions: { where: { date: addDays(day, 1), status: "PLANNED" }, select: { title: true, type: true } },
      recoveryMetrics: { where: { date: day }, select: { squeezePain: true, heelPain: true, jumpCm: true, bodyWeightKg: true } },
    },
  });
  let sent = 0;
  for (const u of users) {
    const prefs = readPrefs(u.athleteProfile?.prefs);
    const m = u.recoveryMetrics[0];
    const due = dueReminders(prefs, { hour, weekday }, {
      plannedTomorrow: u.trainingSessions.length,
      checkedToday: Boolean(m && (m.squeezePain != null || m.heelPain != null || m.jumpCm != null)),
      weighedToday: m?.bodyWeightKg != null,
    });
    for (const kind of due) {
      const msg =
        kind === "tomorrow"
          ? {
              title: "Mañana toca",
              body: u.trainingSessions.map((s) => publicTitle(s.title ?? "Entreno")).join(" · "),
              url: "/training",
              tag: "tomorrow",
            }
          : kind === "monday-check"
            ? { title: "Control rápido del lunes", body: "Squeeze, talón y salto: 1 minuto en Recuperación.", url: "/recovery", tag: "monday-check" }
            : { title: "Pesarse", body: "En ayunas, después del baño. Apúntalo en Recuperación.", url: "/recovery", tag: "weigh" };
      if (await notifyOnce(u.id, `${kind}:${key}`, msg)) sent++;
    }
  }
  return sent;
}

/**
 * Recordatorio de «Salud de la mujer» (opcional, domingos desde las 19:00): si
 * lleva más de un ciclo sin registrar la regla. Texto neutro: la notificación
 * se ve en la pantalla bloqueada.
 */
export async function runPeriodReminderJob(hour = madridHour(), weekday = madridWeekday()): Promise<number> {
  if (weekday !== 6 || hour < 19 || !dataKeyConfigured()) return 0;
  const day = toIsoDay(today());
  const users = await prisma.user.findMany({ where: { pushSubscriptions: { some: {} }, womenHealth: { isNot: null } }, select: { id: true, womenHealth: { select: { data: true } } } });
  let sent = 0;
  for (const u of users) {
    try {
      const ws = readWomenSettings(openJson(u.womenHealth!.data));
      // v1.6 · salud ósea: pocas sesiones con impacto esta semana
      if (ws.remindImpact && ws.boneImpactMin > 0) {
        const impact = await prisma.trainingSession.count({ where: { userId: u.id, status: "COMPLETED", type: { in: ["TRACK", "TECHNICAL", "MIXED"] }, date: { gte: addDays(today(), -6) } } });
        if (impact < ws.boneImpactMin && (await notifyOnce(u.id, `impact:${toIsoDay(startOfIsoWeek(today()))}`, { title: "LifeOS", body: "Esta semana ha habido poco trabajo con impacto (saltos o carrera).", url: "/recovery/women#hueso", tag: "impact" }))) sent++;
      }
      if (!ws.remindPeriod) continue;
      const { settings, logs } = await getCycle(u.id, 120);
      if (!settings || settings.hormonal === "si") continue;
      const last = periodStarts(settings, logs).at(-1);
      if (last && (Date.parse(day) - Date.parse(last)) / 864e5 <= settings.avgLength + 7) continue;
      if (await notifyOnce(u.id, `period:${toIsoDay(startOfIsoWeek(today()))}`, { title: "LifeOS", body: "Tienes un registro pendiente de actualizar en Recuperación.", url: "/recovery", tag: "period" })) sent++;
    } catch (err) {
      console.error(`[scheduler] recordatorio de ${u.id}:`, err);
    }
  }
  return sent;
}

/** v1.6 · Citas de fisio o médico: aviso la tarde anterior (una vez). */
export async function runAppointmentReminders(now = new Date()): Promise<number> {
  if (madridHour() < 19) return 0;
  const from = new Date(now.getTime());
  const to = new Date(now.getTime() + 30 * 3600e3);
  const appts = await prisma.appointment.findMany({ where: { at: { gt: from, lte: to }, user: { pushSubscriptions: { some: {} } } }, select: { id: true, userId: true, at: true, kind: true, place: true } });
  let sent = 0;
  for (const a of appts) {
    const hour = new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }).format(a.at);
    const what = a.kind === "PHYSIO" ? "Fisio" : a.kind === "DOCTOR" ? "Médico/a" : "Cita";
    if (await notifyOnce(a.userId, `appt:${a.id}`, { title: "LifeOS", body: `Mañana: ${what} a las ${hour}${a.place ? ` (${a.place})` : ""}.`, url: "/recovery/health", tag: `appt-${a.id}` })) sent++;
  }
  return sent;
}

/** v1.6 · Plazos (inscripciones, licencia, becas): un aviso desde N días antes (una vez por plazo y fecha). */
export async function runDeadlineReminders(now = new Date()): Promise<number> {
  if (madridHour() < 9) return 0;
  const day = localDay(now);
  const rows = await prisma.deadline.findMany({
    where: { done: false, dueOn: { gte: dateOnly(day), lte: addDays(dateOnly(day), 60) }, user: { pushSubscriptions: { some: {} } } },
    select: { id: true, userId: true, title: true, dueOn: true, remindDays: true, done: true },
  });
  let sent = 0;
  for (const d of rows) {
    const st = deadlineState({ dueOn: toIsoDay(d.dueOn), remindDays: d.remindDays, done: d.done }, day);
    if (!st.remindNow) continue;
    const when = st.daysLeft === 0 ? "hoy" : st.daysLeft === 1 ? "mañana" : `en ${st.daysLeft} días`;
    if (await notifyOnce(d.userId, `deadline:${d.id}:${toIsoDay(d.dueOn)}`, { title: "LifeOS · plazo", body: `${d.title}: vence ${when}.`, url: "/finance/trips", tag: `deadline-${d.id}` })) sent++;
  }
  return sent;
}

async function tick() {
  g.__lifeosSchedulerLastTick = new Date();
  try {
    await pruneAuditJob();
    await runDailyDigestJob();
    await runRemindersJob();
    await runPeriodReminderJob();
    await runAppointmentReminders();
    await runDeadlineReminders();
    const posted = await runSubscriptionsJob();
    const reports = await runWeeklyCoachJob();
    if (posted || reports) console.info(`[scheduler] ${posted} cobro(s) de suscripciones, ${reports} informe(s) del coach`);
  } catch (err) {
    console.error("[scheduler]", err);
  }
}

const g = globalThis as unknown as { __lifeosScheduler?: NodeJS.Timeout; __lifeosSafety?: NodeJS.Timeout; __lifeosSchedulerLastTick?: Date };

/** «Entreno sola, con aviso»: cada 5 min (aparte del horario de las demás tareas). */
async function safetyTick() {
  try {
    const n = await runSafetyJob();
    if (n) console.info(`[scheduler] ${n} aviso(s) de «entreno sola»`);
  } catch (err) {
    console.error("[scheduler] entreno sola:", err);
  }
}

/** Para «Estado del servidor»: ¿está activo y cuándo pasó por última vez? */
export function schedulerStatus() {
  return { enabled: env().SCHEDULER_ENABLED, running: Boolean(g.__lifeosScheduler), lastTick: g.__lifeosSchedulerLastTick?.toISOString() ?? null };
}

/** Una pasada al arrancar (con 1 min de margen) y después cada hora. */
export function startScheduler() {
  if (g.__lifeosScheduler || !env().SCHEDULER_ENABLED) return;
  setTimeout(tick, 60_000).unref();
  g.__lifeosScheduler = setInterval(tick, HOUR_MS).unref();
  g.__lifeosSafety = setInterval(safetyTick, 5 * 60_000).unref();
  console.info("[scheduler] activo: suscripciones diarias y coach semanal");
}
