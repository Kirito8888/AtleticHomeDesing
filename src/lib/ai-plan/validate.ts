import { allowedEquipment, EQUIPMENT, locationOf, type PlanRequest } from "./options";
import type { AiExercise, AiPlan } from "./schema";

/**
 * Comprueba que lo que devuelve la IA respeta lo pedido. Devuelve una lista de
 * incumplimientos en español (vacía = válido). Se usa para reintentar con esos
 * errores y, si persisten, mostrarlos como avisos en la vista previa.
 */
export function validateAiPlan(plan: AiPlan, r: PlanRequest): string[] {
  const errors: string[] = [];
  const totalWeeks = plan.phases.reduce((a, p) => a + p.weeks, 0);
  if (totalWeeks !== r.weeks) errors.push(`Las fases suman ${totalWeeks} semanas y se pidieron ${r.weeks}.`);

  const wanted = [...r.weekdays].sort().join(",");
  for (const phase of plan.phases) {
    const got = phase.days.map((d) => d.weekday).sort().join(",");
    if (got !== wanted) errors.push(`Fase «${phase.name}»: los días deben ser exactamente weekday ${wanted} (hay ${got || "ninguno"}).`);
    for (const day of phase.days) {
      const where = `Fase «${phase.name}», weekday ${day.weekday}`;
      if (day.durationMin > Math.round(r.minutes * 1.15)) errors.push(`${where}: dura ${day.durationMin} min (máximo ${r.minutes}).`);
      if (day.warmup.trim().length < 5) errors.push(`${where}: falta el calentamiento.`);
      const location = locationOf(r, day.weekday);
      if (!location) continue;
      const allowed = allowedEquipment(location, r.equipment);
      for (const [label, list] of [
        ["", day.exercises],
        [" (versión suave)", day.light.exercises],
      ] as const) {
        for (const ex of list) errors.push(...exerciseIssues(ex, allowed, r).map((e) => `${where}${label}, «${ex.name}»: ${e}`));
      }
      if (day.light.durationMin > day.durationMin) errors.push(`${where}: la versión suave dura más que la normal.`);
    }
  }
  if (r.weeks >= 6 && !hasDeloadEvery4Weeks(plan)) errors.push("Falta una semana de descarga (deload) como mucho cada 4 semanas.");
  return [...new Set(errors)];
}

export function exerciseIssues(ex: Pick<AiExercise, "equipment" | "patterns" | "areas">, allowed: Set<string>, r: Pick<PlanRequest, "areas" | "avoid">): string[] {
  const out: string[] = [];
  const missing = ex.equipment.filter((e) => !allowed.has(e));
  if (missing.length) out.push(`usa material no disponible (${missing.map((m) => EQUIPMENT[m]).join(", ")})`);
  const avoided = ex.patterns.filter((p) => r.avoid.includes(p) || (r.avoid.includes("impacto") && (p === "saltos" || p === "carrera")));
  if (avoided.length) out.push(`incluye ${avoided.join(", ")}, que se pidió evitar`);
  const hurt = ex.areas.filter((a) => r.areas.includes(a));
  if (hurt.length) out.push(`carga una zona con molestias (${hurt.join(", ")})`);
  return out;
}

/** ¿Hay una fase de descarga, como mucho, cada 4 semanas? */
function hasDeloadEvery4Weeks(plan: AiPlan): boolean {
  let sinceDeload = 0;
  for (const p of plan.phases) {
    if (p.deload) sinceDeload = 0;
    else {
      sinceDeload += p.weeks;
      if (sinceDeload > 4) return false;
    }
  }
  return true;
}
