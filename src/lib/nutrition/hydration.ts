import type { Prefs } from "@/lib/rules/prefs";

/** Objetivo de agua del día (ml): ml/kg + extra con sesión + extra con calor. Redondeado a 50 ml. */
export function waterTarget(p: Pick<Prefs, "waterMlPerKg" | "waterSessionExtraMl" | "waterHotExtraMl" | "hotTempC">, weightKg: number | null, hasSession: boolean, maxTempC: number | null) {
  const base = (weightKg ?? 65) * p.waterMlPerKg;
  const hot = maxTempC != null && maxTempC >= p.hotTempC;
  const ml = base + (hasSession ? p.waterSessionExtraMl : 0) + (hot ? p.waterHotExtraMl : 0);
  return { ml: Math.round(ml / 50) * 50, hot, hasSession, estimatedWeight: weightKg == null };
}
