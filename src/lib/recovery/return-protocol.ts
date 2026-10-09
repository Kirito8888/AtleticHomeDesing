import { z } from "zod";

/** Vuelta tras lesión por fases: plantilla genérica editable (puro). */
export const protocolPhasesSchema = z
  .array(
    z.object({
      name: z.string().min(1).max(80),
      maxPain: z.number().int().min(0).max(10),
      criteria: z.array(z.object({ text: z.string().min(1).max(160), done: z.boolean() })).max(10),
    }),
  )
  .min(1)
  .max(8);
export type ProtocolPhases = z.infer<typeof protocolPhasesSchema>;

const c = (...texts: string[]) => texts.map((text) => ({ text, done: false }));
export function defaultProtocol(limitsThrowing: boolean): ProtocolPhases {
  return [
    { name: "1 · Calmar", maxPain: 2, criteria: c("Sin dolor en reposo ni en el día a día", "Movilidad completa sin dolor") },
    { name: "2 · Fuerza sin dolor", maxPain: 2, criteria: c("Fuerza de la zona sin dolor (ejercicios básicos)", "Comparada con el otro lado, sin diferencia clara") },
    { name: "3 · Carrera e impacto", maxPain: 2, criteria: c("Trote 10 min sin dolor", "Saltos a dos y a una pierna sin dolor", "Al día siguiente, sin más dolor") },
    {
      name: limitsThrowing ? "4 · Lanzamientos progresivos" : "4 · Entrenamiento específico",
      maxPain: 1,
      criteria: limitsThrowing ? c("Lanzamientos desde parado, implemento ligero, sin dolor", "Carrera corta sin dolor", "Carrera completa sin dolor") : c("Sesión normal a media intensidad sin dolor"),
    },
    { name: "5 · Vuelta completa", maxPain: 1, criteria: c("Una semana de entreno normal sin dolor", "Visto bueno de tu fisio o médica") },
  ];
}

/** Fase actual: la primera con criterios sin cumplir (o la última). */
export function currentPhase(phases: ProtocolPhases): number {
  const i = phases.findIndex((p) => p.criteria.some((x) => !x.done));
  return i === -1 ? phases.length - 1 : i;
}

/** ¿El dolor de hoy permite seguir en la fase? */
export function painAllows(phases: ProtocolPhases, phase: number, pain: number): boolean {
  return pain <= phases[phase].maxPain;
}
