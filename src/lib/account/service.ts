import "server-only";
import { rm } from "node:fs/promises";
import path from "node:path";

import { ApiError, enforceRateLimit } from "@/lib/api";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { env } from "@/lib/env";
import { getCycle } from "@/lib/health/cycle-service";
import { prisma } from "@/lib/prisma";
import { dataKeyConfigured } from "@/lib/security/data-key";
import { type AuditContext, recordEvent } from "@/lib/security/audit";

/** Re-autenticación para operaciones sensibles. Limitada para no servir de oráculo de fuerza bruta. */
export async function verifyCurrentPassword(userId: string, password: string): Promise<void> {
  enforceRateLimit("passwordCheck", userId);
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  if (!user?.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
    throw new ApiError(403, "La contraseña actual no es correcta");
  }
}

/** Cambia la contraseña e invalida todas las sesiones abiertas (incluida la actual). */
export async function changePassword(userId: string, currentPassword: string, newPassword: string, ctx: AuditContext = {}) {
  await verifyCurrentPassword(userId, currentPassword);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(newPassword), sessionVersion: { increment: 1 }, failedLogins: 0, lockedUntil: null },
  });
  await recordEvent(userId, "PASSWORD_CHANGED", ctx);
}

export async function changeEmail(userId: string, currentPassword: string, email: string, ctx: AuditContext = {}) {
  await verifyCurrentPassword(userId, currentPassword);
  const taken = await prisma.user.findFirst({ where: { email, NOT: { id: userId } }, select: { id: true } });
  if (taken) throw new ApiError(409, "Ese email no está disponible");
  const before = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
  await prisma.user.update({ where: { id: userId }, data: { email, sessionVersion: { increment: 1 } } });
  await recordEvent(userId, "EMAIL_CHANGED", ctx, `${before.email} → ${email}`);
}

/** "Cerrar sesión en todos los dispositivos": los JWT emitidos dejan de valer. */
export async function revokeAllSessions(userId: string, ctx: AuditContext = {}) {
  await prisma.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
  await recordEvent(userId, "SESSIONS_REVOKED", ctx);
}

export async function setAiConsent(userId: string, enabled: boolean, ctx: AuditContext = {}) {
  const { aiConsentAt } = await prisma.user.update({
    where: { id: userId },
    data: { aiConsentAt: enabled ? new Date() : null },
    select: { aiConsentAt: true },
  });
  await recordEvent(userId, "AI_CONSENT_CHANGED", ctx, enabled ? "activado" : "desactivado");
  return { enabled: aiConsentAt != null, aiConsentAt };
}

/**
 * Exportación completa (derecho de acceso/portabilidad). Sin hash de
 * contraseña ni rutas internas del servidor; los fragmentos vectorizados se
 * omiten porque son derivados de los apuntes (que se pueden volver a subir).
 */
export async function exportAccount(userId: string) {
  const where = { userId };
  const [
    user,
    thresholds,
    trainingSessions,
    personalRecords,
    dailyLoads,
    recoveryMetrics,
    customExercises,
    trainingCycles,
    calendarEvents,
    tasks,
    financialAccounts,
    financialCategories,
    transactions,
    budgets,
    subscriptions,
    macros,
    nutritionGoals,
    studyDocuments,
    chatThreads,
    flashcardDecks,
    coachReports,
    coachLinks,
  ] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true, timezone: true, aiConsentAt: true, createdAt: true, athleteProfile: true },
    }),
    prisma.thresholdHistory.findMany({ where, orderBy: { effectiveFrom: "asc" } }),
    prisma.trainingSession.findMany({
      where,
      orderBy: { date: "asc" },
      include: {
        track: { include: { intervals: true } },
        technical: { include: { attempts: true } },
        strength: { include: { sets: { include: { exercise: { select: { name: true } } } } } },
      },
    }),
    prisma.personalRecord.findMany({ where }),
    prisma.dailyLoad.findMany({ where, orderBy: { date: "asc" } }),
    prisma.recoveryMetrics.findMany({ where, orderBy: { date: "asc" } }),
    prisma.exercise.findMany({ where }),
    prisma.trainingCycle.findMany({ where }),
    prisma.calendarEvent.findMany({ where }),
    prisma.task.findMany({ where }),
    prisma.financialAccount.findMany({ where }),
    prisma.financialCategory.findMany({ where }),
    prisma.financialTransaction.findMany({ where, orderBy: { date: "asc" }, include: { postings: true } }),
    prisma.budget.findMany({ where }),
    prisma.subscription.findMany({ where }),
    prisma.macros.findMany({ where, orderBy: { date: "asc" } }),
    prisma.nutritionGoal.findMany({ where }),
    prisma.studyDocument.findMany({ where, omit: { storagePath: true } }),
    prisma.chatThread.findMany({ where, include: { messages: { orderBy: { createdAt: "asc" } } } }),
    prisma.flashcardDeck.findMany({ where, include: { cards: true } }),
    prisma.coachReport.findMany({ where }),
    prisma.coachAthlete.findMany({
      where: { OR: [{ coachId: userId }, { athleteId: userId }] },
      include: { coach: { select: { name: true, email: true } }, athlete: { select: { name: true, email: true } } },
    }),
  ]);
  const [securityEvents, injuries, sessionTemplates, mealTemplates, planMesos, cycle] = await Promise.all([
    prisma.securityEvent.findMany({ where, orderBy: { createdAt: "desc" }, omit: { userId: true } }),
    prisma.injury.findMany({ where, orderBy: { startedOn: "asc" } }),
    prisma.sessionTemplate.findMany({ where }),
    prisma.mealTemplate.findMany({ where, include: { items: true } }),
    prisma.planMeso.findMany({ where, orderBy: { startDate: "asc" }, include: { days: { orderBy: { key: "asc" } }, feedback: true } }),
    // Datos del ciclo descifrados para su dueña (si el servidor tiene la clave).
    dataKeyConfigured() ? getCycle(userId, 36500) : Promise.resolve(null),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    format: "lifeos-export/2",
    user,
    training: { thresholds, sessions: trainingSessions, personalRecords, dailyLoads, customExercises, cycles: trainingCycles, templates: sessionTemplates },
    recovery: { metrics: recoveryMetrics, injuries, menstrualCycle: cycle },
    planning: { calendarEvents, tasks, importedPlan: planMesos },
    finance: { accounts: financialAccounts, categories: financialCategories, transactions, budgets, subscriptions },
    nutrition: { entries: macros, goals: nutritionGoals, favorites: mealTemplates },
    study: { documents: studyDocuments, chatThreads, flashcardDecks },
    coach: { reports: coachReports, links: coachLinks },
    security: { events: securityEvents },
  };
}

/**
 * Borrado definitivo (derecho de supresión). El orden importa: varias FK son
 * RESTRICT (Posting→cuenta, Subscription→cuenta, StrengthSet→ejercicio) y la
 * cascada desde User no garantiza el orden entre tablas hermanas.
 */
export async function deleteAccount(userId: string, password: string) {
  await verifyCurrentPassword(userId, password);
  await prisma.$transaction(async (tx) => {
    // Ejercicios propios usados en sesiones de otros atletas (planificadas por
    // este coach): pasan al catálogo global para no romper datos ajenos.
    await tx.exercise.updateMany({
      where: { userId, sets: { some: { strengthSession: { session: { userId: { not: userId } } } } } },
      data: { userId: null },
    });
    await tx.financialTransaction.deleteMany({ where: { userId } }); // postings en cascada
    await tx.subscription.deleteMany({ where: { userId } });
    await tx.trainingSession.deleteMany({ where: { userId } }); // series de fuerza en cascada
    await tx.user.delete({ where: { id: userId } });
  });
  await rm(path.resolve(env().UPLOAD_DIR, userId), { recursive: true, force: true });
}
