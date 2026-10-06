import "server-only";

import { ApiError } from "@/lib/api";
import { env } from "@/lib/env";
import { open, seal } from "@/lib/security/secret-box";

/** Clave para datos de salud cifrados: DATA_ENCRYPTION_KEY o, si no está, TOTP_ENCRYPTION_KEY. */
export function dataKey(): string {
  const key = env().DATA_ENCRYPTION_KEY ?? env().TOTP_ENCRYPTION_KEY;
  if (!key) throw new ApiError(503, "Falta la clave de cifrado del servidor (DATA_ENCRYPTION_KEY o TOTP_ENCRYPTION_KEY)", { code: "no_data_key" });
  return key;
}

export const dataKeyConfigured = () => Boolean(env().DATA_ENCRYPTION_KEY ?? env().TOTP_ENCRYPTION_KEY);

export const sealJson = (value: unknown) => seal(JSON.stringify(value), dataKey());
export const openJson = <T>(sealed: string): T => JSON.parse(open(sealed, dataKey())) as T;
