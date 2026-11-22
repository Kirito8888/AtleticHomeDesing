import "server-only";

import { healthPayloadSchema } from "@/lib/recovery/health-sync";

import { recordDelivery, type Channel } from "./delivery-service";
import { mapActivity, normalizeWorkout } from "./normalize";
import { payloadSchema } from "./payload";

/** Payloads sintéticos fijos (nada real): unidades mezcladas y horas límite de Madrid. */
const FITNESS = { type: "Fuerza tradicional", start: "2026-01-14T23:50:00", duration: "1 h 5 min", distance: "7,2 km", energyKj: "2008 kJ", hrAvg: "148 lpm", hrMax: 171 };
const HEALTH = { sleepStart: "2026-01-14T23:40:00", sleepEnd: "2026-01-15T07:10:00", restingHr: "52 lpm", weightKg: "62,347 kg", hrvSdnnMs: "48,26 ms" };

export interface TestOutcome {
  ok: boolean;
  checks: { label: string; ok: boolean }[];
}

function fitnessCheck(): TestOutcome {
  const parsed = payloadSchema.safeParse(FITNESS);
  if (!parsed.success) return { ok: false, checks: [{ label: "El formato del envío se entiende", ok: false }] };
  const n = normalizeWorkout(parsed.data[0]);
  const checks = [
    { label: "El formato del envío se entiende", ok: true },
    { label: "Fecha de Madrid cerca de medianoche (23:50 → mismo día)", ok: n.date === "2026-01-14" },
    { label: "Unidades: «1 h 5 min», «7,2 km», «2008 kJ» → 65 min, 7200 m, 480 kcal", ok: n.durationSec === 3900 && n.distanceM === 7200 && n.kcal === 480 },
    { label: "Deporte: «Fuerza tradicional» → sesión de fuerza", ok: mapActivity(n.activityType).sessionType === "STRENGTH" },
  ];
  return { ok: checks.every((c) => c.ok), checks };
}

function healthCheck(): TestOutcome {
  const parsed = healthPayloadSchema.safeParse(HEALTH);
  if (!parsed.success) return { ok: false, checks: [{ label: "El formato del envío se entiende", ok: false }] };
  const d = parsed.data[0];
  const checks = [
    { label: "El formato del envío se entiende", ok: true },
    { label: "Sueño que cruza medianoche → día del despertar (15/01)", ok: parsed.data.length === 1 && d.date === "2026-01-15" },
    { label: "Sueño 23:40 → 07:10 = 7,5 h", ok: d.sleepHours === 7.5 },
    { label: "Unidades: «62,347 kg», «52 lpm», «48,26 ms» → 62,35 · 52 · 48,3", ok: d.bodyWeightKg === 62.35 && d.restingHr === 52 && d.hrvSdnnMs === 48.3 },
  ];
  return { ok: checks.every((c) => c.ok), checks };
}

/** Ejecuta la prueba de las dos vías y anota el resultado (solo `test*`). No guarda entrenos ni métricas. */
export async function runConnectionTest(userId: string): Promise<{ ok: boolean; fitness: TestOutcome; health: TestOutcome }> {
  const out: Record<Channel, TestOutcome> = { FITNESS: fitnessCheck(), HEALTH: healthCheck() };
  for (const c of ["FITNESS", "HEALTH"] as const) {
    const o = out[c];
    await recordDelivery(userId, c, "test", o.ok ? 200 : 500, o.ok ? { counts: { checks: o.checks.length } } : { reason: "prueba_incoherente" });
  }
  return { ok: out.FITNESS.ok && out.HEALTH.ok, fitness: out.FITNESS, health: out.HEALTH };
}
