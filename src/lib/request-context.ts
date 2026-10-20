import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

/** Petición de /api en curso (la fija `route()`): permite que `requireUser` sepa si es una escritura y memorice la consulta de condiciones. */
export interface RequestContext {
  method: string;
  path: string;
  termsOk?: boolean;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

export const isMutation = (method: string) => ["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase());

/** Escrituras que no exigen condiciones aceptadas: aceptarlas y ejercer derechos (exportar, borrar, privacidad, cerrar sesiones, contraseña). */
const TERMS_EXEMPT = ["/api/account/terms", "/api/account/export", "/api/account/privacy", "/api/account/sessions", "/api/account/password"];

export const termsExempt = (path: string) => path === "/api/account" || TERMS_EXEMPT.some((p) => path === p || path.startsWith(`${p}/`));
