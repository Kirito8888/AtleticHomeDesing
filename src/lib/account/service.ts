import "server-only";
import { LIMITS } from "@/lib/rate-limit";
import { rateLimitPersistent } from "@/lib/rate-limit-db";
import { rm } from "node:fs/promises";
import path from "node:path";

import { ApiError } from "@/lib/api";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { env } from "@/lib/env";
import { getCycle } from "@/lib/health/cycle-service";
import { prisma } from "@/lib/prisma";
import { dataKeyConfigured, openJson } from "@/lib/security/data-key";
import { type AuditContext, recordEvent } from "@/lib/security/audit";
import { getWomen } from "@/lib/health/women-service";
import { recordConsent } from "@/lib/privacy/service";
import { toIsoDay } from "@/lib/dates";
import { listWellbeing } from "@/lib/recovery/wellbeing-service";

/** Re-autenticación para operaciones sensibles. Limitada para no servir de oráculo de fuerza bruta. */
export async function verifyCurrentPassword(userId: string, password: string): Promise<void> {
  if (!(await rateLimitPersistent(`passwordCheck:${userId}`, LIMITS.passwordCheck.limit, LIMITS.passwordCheck.windowMs)).ok) throw new ApiError(429, "Demasiados intentos. Espera unos minutos.");
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
  await recordConsent(userId, "AI", enabled, ctx);
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
  const [securityEvents, injuries, sessionTemplates, mealTemplates, planMesos, cycle, oneRepMaxes, exerciseAliases, sharedReports, calendarFeeds, women] = await Promise.all([
    prisma.securityEvent.findMany({ where, orderBy: { createdAt: "desc" }, omit: { userId: true } }),
    prisma.injury.findMany({ where, orderBy: { startedOn: "asc" } }),
    prisma.sessionTemplate.findMany({ where }),
    prisma.mealTemplate.findMany({ where, include: { items: true } }),
    prisma.planMeso.findMany({ where, orderBy: { startDate: "asc" }, include: { days: { orderBy: { key: "asc" } }, feedback: true } }),
    // Datos del ciclo descifrados para su dueña (si el servidor tiene la clave).
    dataKeyConfigured() ? getCycle(userId, 36500) : Promise.resolve(null),
    prisma.oneRepMax.findMany({ where, orderBy: [{ nameKey: "asc" }, { effectiveFrom: "asc" }] }),
    prisma.exerciseAlias.findMany({ where }),
    // Enlaces compartidos: solo metadatos (el hash del token no sirve a nadie).
    prisma.sharedReport.findMany({ where, omit: { tokenHash: true } }),
    prisma.calendarFeed.findMany({ where, omit: { tokenHash: true } }),
    // Salud de la mujer descifrada para su dueña (si el servidor tiene la clave).
    dataKeyConfigured() ? getWomen(userId) : Promise.resolve(null),
  ]);
  // v1.5: tests físicos, vuelta por fases, agua, horario, estudio, hábitos, material y comentarios
  const [testResults, returnProtocols, hydration, classSlots, studySessions, habits, equipment, sessionComments] = await Promise.all([
    prisma.testResult.findMany({ where, orderBy: { date: "asc" } }),
    prisma.returnProtocol.findMany({ where }),
    prisma.hydrationLog.findMany({ where, orderBy: { date: "asc" } }),
    prisma.classSlot.findMany({ where }),
    prisma.studySession.findMany({ where, orderBy: { date: "asc" } }),
    prisma.habit.findMany({ where, include: { logs: { select: { date: true }, orderBy: { date: "asc" } } } }),
    prisma.equipment.findMany({ where }),
    // Los de sus sesiones (de quien sea) y los que escribió en sesiones de sus atletas
    prisma.sessionComment.findMany({ where: { OR: [{ athleteId: userId }, { authorId: userId }] }, orderBy: { createdAt: "asc" }, include: { author: { select: { name: true, email: true } } } }),
  ]);
  // v1.6: jabalina, prehab, antropometría, salud (suplementos, citas, enlaces, «entreno sola»), cocina, estudio, viajes y plazos
  const [minimums, weekTemplates, prehabRoutines, bodyMeasures, supplements, appointments, healthReports, safetyContacts, safetyTrips, recipes, shopping, studyPlanBlocks, grades, trips, deadlines] = await Promise.all([
    prisma.minimum.findMany({ where }),
    prisma.weekTemplate.findMany({ where }),
    prisma.prehabRoutine.findMany({ where, include: { logs: { select: { date: true }, orderBy: { date: "asc" } } } }),
    prisma.bodyMeasure.findMany({ where, orderBy: { date: "asc" } }),
    prisma.supplement.findMany({ where }),
    prisma.appointment.findMany({ where, orderBy: { at: "asc" } }),
    prisma.healthReport.findMany({ where, omit: { tokenHash: true } }),
    prisma.safetyContact.findMany({
      where: { OR: [{ userId }, { contactId: userId }] },
      select: { status: true, createdAt: true, userId: true, owner: { select: { name: true, email: true } }, contact: { select: { name: true, email: true } } },
    }),
    prisma.safetyTrip.findMany({ where, orderBy: { startedAt: "asc" } }),
    prisma.recipe.findMany({ where }),
    prisma.shoppingItem.findMany({ where }),
    prisma.studyPlanBlock.findMany({ where, orderBy: { date: "asc" } }),
    prisma.grade.findMany({ where }),
    prisma.trip.findMany({ where }),
    prisma.deadline.findMany({ where, orderBy: { dueOn: "asc" } }),
  ]);
  // v1.7: llaves de acceso (solo nombre y fechas), consentimientos, derechos, rutinas, bienestar (descifrado),
  // fotos y justificantes (solo metadatos: los ficheros cifrados no van en el JSON), plan de comidas,
  // tomas de suplementos, sudoración, trabajos, presupuesto de temporada y cambios de precio
  const [passkeys, consents, privacyRequests, routines, wellbeing, injuryPhotos, mealPlan, supplementLogs, sweatTests, assignments, seasonBudgets, receipts, priceChanges] = await Promise.all([
    prisma.passkey.findMany({ where, select: { name: true, createdAt: true, lastUsedAt: true, backedUp: true } }),
    prisma.consent.findMany({ where, orderBy: { createdAt: "asc" }, omit: { userId: true } }),
    prisma.privacyRequest.findMany({ where, orderBy: { createdAt: "asc" }, omit: { userId: true } }),
    prisma.routineProfile.findMany({ where, include: { tests: { orderBy: { date: "asc" } } } }),
    dataKeyConfigured() ? listWellbeing(userId, toIsoDay(new Date()), 36500) : Promise.resolve(null),
    prisma.injuryPhoto.findMany({ where, select: { id: true, injuryId: true, mime: true, takenOn: true, createdAt: true } }),
    prisma.mealPlanEntry.findMany({ where, orderBy: { date: "asc" }, include: { recipe: { select: { name: true } } } }),
    prisma.supplementLog.findMany({ where, orderBy: { date: "asc" }, select: { supplementId: true, date: true, supplement: { select: { name: true } } } }),
    prisma.sweatTest.findMany({ where, orderBy: { date: "asc" } }),
    prisma.assignment.findMany({ where, orderBy: { dueOn: "asc" } }),
    prisma.seasonBudget.findMany({ where }),
    prisma.receipt.findMany({ where, select: { id: true, transactionId: true, mime: true, createdAt: true } }),
    prisma.subscriptionPriceChange.findMany({ where: { subscription: { userId } }, orderBy: { on: "asc" } }),
  ]);
  // v1.9: proveedor de IA elegido, sin la clave (ni cifrada): al restaurar hay que volver a ponerla
  // v1.10: Telegram vinculado (el chat es tuyo; los códigos de vinculación no se exportan)
  const ownFoods = await prisma.foodProduct.findMany({ where: { ownerId: userId }, omit: { raw: true, ownerId: true } });
  const telegram = await prisma.telegramLink.findUnique({ where: { userId }, select: { chatId: true, enabled: true, linkedAt: true } });
  const aiProvider = await prisma.aiCredential.findUnique({ where: { userId }, select: { provider: true, baseUrl: true, model: true, embeddingModel: true, verifiedAt: true } });
  // v1.8: revisiones, objetivos, reglas de categoría, bandeja de avisos, uso local y papelera
  const [weeklyReviews, goals, categoryRules, inbox, pageUsage, trash] = await Promise.all([
    prisma.weeklyReview.findMany({ where, orderBy: { weekStart: "asc" }, omit: { userId: true } }),
    prisma.goal.findMany({ where, orderBy: { createdAt: "asc" }, omit: { userId: true } }),
    prisma.categoryRule.findMany({ where, select: { pattern: true, createdAt: true, category: { select: { name: true } } } }),
    prisma.notificationLog.findMany({ where: { userId, title: { not: null } }, orderBy: { sentAt: "asc" }, select: { title: true, body: true, url: true, sentAt: true, readAt: true } }),
    prisma.pageUsage.findMany({ where, orderBy: [{ week: "asc" }, { path: "asc" }], select: { path: true, week: true, count: true } }),
    prisma.trashItem.findMany({ where, orderBy: { deletedAt: "asc" }, select: { kind: true, label: true, data: true, deletedAt: true } }),
  ]);
  // Lo cifrado (nota y ubicación de «entreno sola») se entrega descifrado a su dueña, o se omite sin clave
  const safetyTripsOut = safetyTrips.map(({ data, ...t }) => ({ ...t, details: data && dataKeyConfigured() ? openJson(data) : null }));
  const safetyContactsOut = safetyContacts.map((c) => ({ status: c.status, createdAt: c.createdAt, role: c.userId === userId ? "MY_CONTACT" : "I_AM_CONTACT", person: c.userId === userId ? c.contact : c.owner }));
  return {
    exportedAt: new Date().toISOString(),
    format: "lifeos-export/2",
    user,
    training: {
      thresholds,
      sessions: trainingSessions,
      personalRecords,
      dailyLoads,
      customExercises,
      cycles: trainingCycles,
      templates: sessionTemplates,
      oneRepMaxes,
      exerciseAliases,
      physicalTests: testResults,
      equipment,
      comments: sessionComments,
      minimums,
      weekTemplates,
      prehabRoutines,
      routines,
    },
    recovery: { metrics: recoveryMetrics, injuries, returnProtocols, menstrualCycle: cycle, womenHealth: women ? { settings: women.settings, logs: women.logs } : null,
      bodyMeasures,
      supplements,
      appointments,
      healthReports,
      safety: { contacts: safetyContactsOut, trips: safetyTripsOut },
      wellbeing,
      injuryPhotos,
      supplementLogs: supplementLogs.map((l) => ({ supplementId: l.supplementId, supplement: l.supplement.name, date: l.date })),
    },
    planning: { calendarEvents, tasks, importedPlan: planMesos },
    finance: {
      accounts: financialAccounts,
      categories: financialCategories,
      transactions,
      budgets,
      subscriptions,
      trips,
      deadlines,
      seasonBudgets,
      receipts,
      priceChanges,
      categoryRules: categoryRules.map((r) => ({ pattern: r.pattern, category: r.category.name, createdAt: r.createdAt })),
    },
    nutrition: { ownFoods, entries: macros, goals: nutritionGoals, favorites: mealTemplates, hydration, recipes, shopping, mealPlan: mealPlan.map(({ recipe, ...m }) => ({ ...m, recipeName: recipe.name })), sweatTests },
    study: { documents: studyDocuments, chatThreads, flashcardDecks, classSlots, sessions: studySessions, habits, planBlocks: studyPlanBlocks, grades, assignments },
    coach: { reports: coachReports, links: coachLinks, sharedReports },
    calendarFeeds,
    security: { events: securityEvents, passkeys },
    privacy: { consents, requests: privacyRequests, aiProvider, telegram },
    goals: { goals, weeklyReviews },
    app: { notifications: inbox, pageUsage, trash },
  };
}

/**
 * Borrado definitivo (derecho de supresión). El orden importa: varias FK son
 * RESTRICT (Posting→cuenta, Subscription→cuenta, StrengthSet→ejercicio) y la
 * cascada desde User no garantiza el orden entre tablas hermanas.
 */
export async function deleteAccount(userId: string, password: string) {
  await verifyCurrentPassword(userId, password);
  await purgeUser(userId);
}

/** Borra la cuenta y sus ficheros sin pedir contraseña (cuentas demo caducadas o borradas por administración). */
export async function purgeUser(userId: string) {
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
