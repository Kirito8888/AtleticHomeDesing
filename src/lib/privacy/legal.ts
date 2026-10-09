import "server-only";

import { env } from "@/lib/env";

/** Responsable del tratamiento, desde variables de entorno (nunca en el repositorio). */
export function controller() {
  const e = env();
  return { name: e.LEGAL_NAME ?? null, email: e.LEGAL_EMAIL ?? null, nif: e.LEGAL_NIF ?? null, address: e.LEGAL_ADDRESS ?? null, url: e.AUTH_URL ?? null };
}
