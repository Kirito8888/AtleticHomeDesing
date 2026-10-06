import "server-only";

import { generateWeeklyCoachReport } from "@/lib/ai/coach";
import { addDays, startOfIsoWeek, today } from "@/lib/dates";
import { env } from "@/lib/env";
import { runDueSubscriptions } from "@/lib/finance/service";
import { prisma } from "@/lib/prisma";
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
  return count;
}

async function tick() {
  try {
    await pruneAuditJob();
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
