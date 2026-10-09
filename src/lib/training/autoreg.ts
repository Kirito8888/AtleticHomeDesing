// Kg del día autorregulados (v1.6). Puro. NUNCA cambia el plan ni la tabla de RM:
// solo propone kg para las series que quedan; se aplican con «Usar».
import { roundTo } from "./rm";
import { estimateOneRm } from "./strength";

/** Inversa de estimateOneRm: kg para hacer `toFailure` repeticiones hasta el fallo con esa 1RM. */
export function kgForReps(e1rm: number, toFailure: number): number | null {
  if (e1rm <= 0 || toFailure < 1) return null;
  if (toFailure === 1) return e1rm;
  if (toFailure <= 10) return (e1rm * (37 - toFailure)) / 36;
  if (toFailure <= 15) return e1rm / (1 + toFailure / 30);
  return null;
}

export type Plan = { kg: number; reps: number; rir: number };
export type DoneSet = { kg: number; reps: number; rir: number | null; velocityMs: number | null };
export type Profile = { slope: number; intercept: number };
export type Suggestion = { kg: number; e1rmToday: number; capped: boolean; source: "rir" | "velocity"; text: string };

/**
 * Con la primera serie efectiva: 1RM del día por RIR (o por la velocidad, desplazando tu
 * perfil carga-velocidad a la serie de hoy) → kg para las reps y el RIR que pide el plan,
 * limitado a ±maxPct % de los kg planificados y redondeado al paso de discos.
 */
export function suggestKg(plan: Plan, first: DoneSet, opts: { maxPct: number; step: number; mvt: number; profile?: Profile | null }): Suggestion | null {
  if (!(plan.kg > 0) || !(first.kg > 0) || !(first.reps > 0)) return null;
  let e1rm: number | null = null;
  let source: Suggestion["source"] = "rir";
  if (first.velocityMs && opts.profile && opts.profile.slope < 0) {
    // Misma pendiente que tu perfil, pasando por la serie de hoy
    const intercept = first.velocityMs - opts.profile.slope * first.kg;
    e1rm = (opts.mvt - intercept) / opts.profile.slope;
    source = "velocity";
  } else if (first.rir != null) {
    e1rm = estimateOneRm(first.kg, first.reps, first.rir);
  }
  if (!e1rm || e1rm <= 0) return null;
  const raw = kgForReps(e1rm, plan.reps + plan.rir);
  if (!raw) return null;
  const lo = plan.kg * (1 - opts.maxPct / 100);
  const hi = plan.kg * (1 + opts.maxPct / 100);
  const capped = raw < lo || raw > hi;
  // Redondea al paso sin salirse del tope (redondear 76 a 75 rompería el −5 %)
  let kg = roundTo(Math.min(hi, Math.max(lo, raw)), opts.step);
  if (kg < lo) kg = Math.ceil(lo / opts.step) * opts.step;
  if (kg > hi) kg = Math.floor(hi / opts.step) * opts.step;
  const diff = kg - plan.kg;
  const why = source === "velocity" ? `${first.velocityMs!.toString().replace(".", ",")} m/s en la 1.ª serie` : `RIR ${first.rir} en la 1.ª serie; pedías ${plan.rir}`;
  const text = diff === 0 ? `Vas como pedía el plan (${why}).` : `${diff > 0 ? "Hoy vas mejor" : "Hoy vas peor"} (${why})${capped ? `; limitado a ±${opts.maxPct} %` : ""}.`;
  return { kg, e1rmToday: Math.round(e1rm * 10) / 10, capped, source, text };
}
