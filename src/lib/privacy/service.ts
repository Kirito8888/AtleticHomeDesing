import "server-only";

import { z } from "zod";

import { ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { recordEvent, type AuditContext } from "@/lib/security/audit";

/**
 * v1.7 · Privacidad (RGPD y LOPDGDD): historial de consentimientos, ejercicio de derechos y
 * limitación del tratamiento. Los textos informativos tienen versión: si cambian, se sube la versión
 * y el historial muestra qué texto aceptó cada persona.
 */
export const CONSENT_TEXT = {
  AI: {
    version: "2026-11",
    label: "Atlenza IA (el proveedor que elijas)",
    text: "Envío al proveedor de IA que configures en Ajustes → IA (Google, OpenAI o compatible, Anthropic o un modelo local de este servidor; si no configuras ninguno y el servidor tiene clave, Google Gemini) de tus apuntes, un resumen numérico de tus entrenos sin nombre ni datos de salud y tus preguntas, para responderte. Los proveedores externos pueden tratarlos fuera del Espacio Económico Europeo según sus propias condiciones; un modelo local no saca nada del servidor. Al cambiar de proveedor se vuelve a pedir este consentimiento. Puedes retirarlo cuando quieras; no afecta a lo ya enviado.",
  },
  HEALTH: {
    version: "2026-10",
    label: "Datos de salud (ciclo, salud de la mujer)",
    text: "Guardar datos de salud (categoría especial, art. 9 RGPD) cifrados en este servidor para darte avisos y patrones. Nunca van a la IA ni los ve tu entrenador/a. Puedes borrarlos cuando quieras.",
  },
  COACH: {
    version: "2026-10",
    label: "Acceso de tu entrenador/a",
    text: "Tu entrenador/a ve solo lo que marques (carga, sesiones, recuperación, planificación o informes). Nunca salud ni finanzas.",
  },
  SAFETY: {
    version: "2026-10",
    label: "Contacto de «Entreno sola»",
    text: "Tu contacto recibe un aviso con tu nombre y, si la compartes, tu ubicación, solo si no marcas «llegué» a tiempo.",
  },
} as const;
export type ConsentPurpose = keyof typeof CONSENT_TEXT;

/** Anota un cambio de consentimiento (nunca se borra; la exportación lo incluye). */
export async function recordConsent(userId: string, purpose: ConsentPurpose, granted: boolean, ctx: AuditContext = {}, detail?: string) {
  await prisma.consent.create({ data: { userId, purpose, version: CONSENT_TEXT[purpose].version, granted } });
  await recordEvent(userId, "CONSENT_CHANGED", ctx, `${CONSENT_TEXT[purpose].label}: ${granted ? "concedido" : "retirado"}${detail ? ` (${detail})` : ""}`);
}

/**
 * Datos de salud (art. 9.2.a): guardarlos es un acto explícito (activar «Mi ciclo» o «Salud de la mujer»).
 * La primera vez queda anotado el consentimiento con la versión del texto; retirarlo = borrar esos datos.
 */
export async function ensureHealthConsent(userId: string) {
  const last = await prisma.consent.findFirst({ where: { userId, purpose: "HEALTH" }, orderBy: { createdAt: "desc" }, select: { granted: true } });
  if (!last?.granted) await recordConsent(userId, "HEALTH", true);
}

/** Último estado de cada finalidad e historial completo. */
export async function consentOverview(userId: string) {
  const rows = await prisma.consent.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 200 });
  const current = Object.fromEntries((Object.keys(CONSENT_TEXT) as ConsentPurpose[]).map((p) => [p, rows.find((r) => r.purpose === p) ?? null]));
  return { current, history: rows };
}

export const RIGHTS = {
  ACCESS: "Acceso (art. 15)",
  RECTIFICATION: "Rectificación (art. 16)",
  ERASURE: "Supresión (art. 17)",
  RESTRICTION: "Limitación del tratamiento (art. 18)",
  PORTABILITY: "Portabilidad (art. 20)",
  OBJECTION: "Oposición (art. 21)",
} as const;
export const privacyRequestSchema = z.object({ right: z.enum(Object.keys(RIGHTS) as [keyof typeof RIGHTS, ...(keyof typeof RIGHTS)[]]), detail: z.string().trim().max(500).nullish() });

/** Deja constancia de un derecho ejercido. Los que la app atiende sola se cierran en el momento. */
export async function logPrivacyRequest(userId: string, right: keyof typeof RIGHTS, detail: string | null, resolved: boolean, ctx: AuditContext = {}) {
  const r = await prisma.privacyRequest.create({ data: { userId, right, detail, resolvedAt: resolved ? new Date() : null }, select: { id: true } });
  await recordEvent(userId, "PRIVACY_REQUEST", ctx, RIGHTS[right]);
  return r;
}

/**
 * Limitación del tratamiento (art. 18): mientras esté activa, nada sale de la cuenta (IA, entrenador,
 * enlaces compartidos, calendario). Los datos se conservan y la persona sigue usando la app.
 */
export async function setRestriction(userId: string, on: boolean, ctx: AuditContext = {}) {
  await prisma.user.update({ where: { id: userId }, data: { processingRestrictedAt: on ? new Date() : null } });
  await logPrivacyRequest(userId, "RESTRICTION", on ? "activada" : "levantada", true, ctx);
}

export async function isRestricted(userId: string) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { processingRestrictedAt: true } });
  return Boolean(u?.processingRestrictedAt);
}

/** Para los que comparten datos: 403 si la persona ha limitado el tratamiento. */
export async function assertNotRestricted(userId: string, what = "compartir datos") {
  if (await isRestricted(userId)) throw new ApiError(403, `Has limitado el tratamiento de tus datos (Ajustes → Privacidad): no se puede ${what}.`, { code: "restricted" });
}
