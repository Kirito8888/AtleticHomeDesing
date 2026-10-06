// Línea de log de un inicio de sesión fallido. Formato estable: la lee fail2ban
// (deploy/fail2ban/filter.d/lifeos-auth.conf). Si cambias el texto, cambia el filtro
// y su test (auth-log.test.ts).

export type AuthFailReason = "credentials" | "locked" | "rate_limited" | "totp";

export function authFailureLine(ip: string, reason: AuthFailReason): string {
  // La IP viene de X-Forwarded-For: se limpia para que no pueda inyectar texto en el log.
  const safeIp = /^[0-9a-fA-F:.]{2,45}$/.test(ip) ? ip : "unknown";
  return `[auth] login fallido ip=${safeIp} motivo=${reason}`;
}
