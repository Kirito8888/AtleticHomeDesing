import "server-only";

import { generateWeeklyCoachReport } from "@/lib/ai/coach";
import { addDays, startOfIsoWeek, today, toIsoDay } from "@/lib/dates";
import { formatEur } from "@/lib/format";
import { env } from "@/lib/env";
import { runDueSubscriptions } from "@/lib/finance/service";
import { prisma } from "@/lib/prisma";
import { dueReminders, publicTitle } from "@/lib/push/reminders";
import { notifyOnce } from "@/lib/push/service";
import { readPrefs } from "@/lib/rules/prefs";
import { AUDIT_RETENTION_DAYS } from "@/lib/security/audit";

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

/** Minimización de datos: el registro de auditoría se conserva AUDIT_RETENTION_DAYS días. */
export async function pruneAuditJob(): Promise<number> {
  const { count } = await prisma.securityEvent.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - AUDIT_RETENTION_DAYS * 24 * 60 * 60_000) } },
  });
  await prisma.notificationLog.deleteMany({ where: { sentAt: { lt: new Date(Date.now() - 60 * 24 * 60 * 60_000) } } });
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

async function tick() {
  try {
    await pruneAuditJob();
    await runDailyDigestJob();
    await runRemindersJob();
    const posted = await runSubscriptionsJob();
    const reports = await runWeeklyCoachJob();
    if (posted || reports) console.info(`[scheduler] ${posted} cobro(s) de suscripciones, ${reports} informe(s) del coach`);
  } catch (err) {
    console.error("[scheduler]", err);
  }
}

const g = globalThis as unknown as { __lifeosScheduler?: NodeJS.Timeout };

/** Una pasada al arrancar (con 1 min de margen) y después cada hora. */
export function startScheduler() {
  if (g.__lifeosScheduler || !env().SCHEDULER_ENABLED) return;
  setTimeout(tick, 60_000).unref();
  g.__lifeosScheduler = setInterval(tick, HOUR_MS).unref();
  console.info("[scheduler] activo: suscripciones diarias y coach semanal");
}
