import "server-only";

import { ApiError } from "@/lib/api";
import { env } from "@/lib/env";
import { openAny, seal } from "@/lib/security/secret-box";

/** Clave para datos de salud cifrados: DATA_ENCRYPTION_KEY o, si no está, TOTP_ENCRYPTION_KEY. */
export function dataKey(): string {
  const key = env().DATA_ENCRYPTION_KEY ?? env().TOTP_ENCRYPTION_KEY;
  if (!key) throw new ApiError(503, "Falta la clave de cifrado del servidor (DATA_ENCRYPTION_KEY o TOTP_ENCRYPTION_KEY)", { code: "no_data_key" });
  return key;
}

export const dataKeyConfigured = () => Boolean(env().DATA_ENCRYPTION_KEY ?? env().TOTP_ENCRYPTION_KEY);

export const sealJson = (value: unknown) => seal(JSON.stringify(value), dataKey());
/** Abre con la clave actual o, durante una rotación, con la anterior (DATA_ENCRYPTION_KEY_PREVIOUS). */
export const openJson = <T>(sealed: string): T => JSON.parse(openAny(sealed, [dataKey(), previousDataKey()]).plaintext) as T;

/** Clave anterior: la que tenía el servidor antes de cambiar DATA_ENCRYPTION_KEY (o la de TOTP si no había). */
export const previousDataKey = () => env().DATA_ENCRYPTION_KEY_PREVIOUS;
