import { z } from "zod";

import { clip, sentences } from "@/lib/study/adhd-format";

/**
 * Fraccionador de temarios (v2.5 · Estudio B13): un texto largo pasa a 4–6 micro-pasos de 5–15 min.
 * Los límites se imponen aquí, no solo en el prompt: lo que devuelva el modelo se normaliza siempre.
 */
export const STEP_LIMITS = { minSteps: 1, maxSteps: 6, minMinutes: 5, maxMinutes: 15, action: 90, check: 80 } as const;

export const stepsSchema = z.object({
  title: z.string().trim().min(1).max(4000),
  steps: z
    .array(
      z.object({
        action: z.string().trim().min(1).max(4000),
        minutes: z.coerce.number().min(0).max(600),
        check: z.string().trim().max(4000).optional(),
      }),
    )
    .min(1)
    .max(30),
});
export type StepsDoc = z.infer<typeof stepsSchema>;

export interface MicroStep {
  n: number;
  action: string;
  minutes: number;
  check?: string;
}
export interface MicroSteps {
  title: string;
  steps: MicroStep[];
}

/** Sin negritas ni marcas de lista/markdown: en la vista enfocada solo va texto llano. */
const plain = (s: string) =>
  s
    .replace(/\*\*|__|`/g, "")
    .replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "")
    .replace(/\s+/g, " ")
    .trim();

export function normalizeSteps(raw: StepsDoc): MicroSteps {
  const seen = new Set<string>();
  const steps: MicroStep[] = [];
  for (const s of raw.steps) {
    const action = clip(plain(s.action), STEP_LIMITS.action);
    const key = action.toLowerCase();
    if (!action || seen.has(key)) continue;
    seen.add(key);
    const check = s.check ? clip(plain(s.check), STEP_LIMITS.check) : "";
    const minutes = Math.min(STEP_LIMITS.maxMinutes, Math.max(STEP_LIMITS.minMinutes, Math.round(s.minutes) || STEP_LIMITS.minMinutes));
    steps.push({ n: steps.length + 1, action, minutes, ...(check ? { check } : {}) });
    if (steps.length === STEP_LIMITS.maxSteps) break;
  }
  return { title: clip(plain(raw.title), 60) || "Pasos de estudio", steps };
}

/** Pasos simulados (LIFEOS_FAKE_AI=1): 4–6 a partir de las frases del texto. */
export function fakeSteps(source: string): StepsDoc {
  const sens = sentences(source).filter((s) => s.length > 3);
  const base = sens.length ? sens : ["Apuntes"];
  const steps: StepsDoc["steps"] = [{ action: "Ten a mano el material y lee el título del tema", minutes: 5 }];
  for (const s of base.slice(0, 3)) steps.push({ action: `Lee y subraya la idea clave: ${s}`, minutes: 10, check: "Dila con tus palabras" });
  steps.push({ action: "Escribe de memoria 3 ideas que recuerdes", minutes: 5 });
  return { title: clip(base[0], 60), steps };
}
