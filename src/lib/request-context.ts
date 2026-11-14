import "server-only";
import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";

/** Petición de /api en curso (la fija `route()`): permite que `requireUser` sepa si es una escritura y memorice la consulta de condiciones. */
export interface RequestContext {
  method: string;
  path: string;
  /** Id de la petición (el `x-request-id` entrante si es sensato, si no uno aleatorio). */
  reqId: string;
  termsOk?: boolean;
  /** v3.0 D · resultado memorizado de la puerta de 2FA para ADMIN/COACH. */
  staffBlocked?: boolean;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

export const isMutation = (method: string) => ["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase());

/** Escrituras que no exigen condiciones aceptadas: aceptarlas y ejercer derechos (exportar, borrar, privacidad, cerrar sesiones, contraseña). */
const TERMS_EXEMPT = ["/api/account/terms", "/api/account/export", "/api/account/privacy", "/api/account/sessions", "/api/account/password"];

export const termsExempt = (path: string) => path === "/api/account" || TERMS_EXEMPT.some((p) => path === p || path.startsWith(`${p}/`));

/** Id de petición: se acepta el de fuera solo si tiene forma de id (evita inyectar texto en el log). */
export const makeRequestId = (incoming?: string | null): string => (incoming && /^[A-Za-z0-9-]{8,64}$/.test(incoming) ? incoming : randomUUID());

/** v3.0 D · Rutas que una cuenta ADMIN/COACH bloqueada por falta de 2FA sí puede usar: configurarla y ejercer derechos. */
const SECOND_FACTOR_EXEMPT = ["/api/account/2fa", "/api/account/passkeys", "/api/passkeys"];

export const secondFactorExempt = (path: string) => termsExempt(path) || SECOND_FACTOR_EXEMPT.some((p) => path === p || path.startsWith(`${p}/`));
