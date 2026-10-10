import { describe, expect, it } from "vitest";

import { validateAiPlan } from "@/lib/ai-plan/validate";
import { aiPlanSchema } from "@/lib/ai-plan/schema";

import { generateRoutine } from "./generator";
import { buildProfile, frequencyFactor, project, testBand } from "./profile";
import { routineAnswersSchema } from "./questionnaire";

const base = routineAnswersSchema.parse({
  sex: "F",
  age: 34,
  experience: "nunca",
  activity: "ligera",
  tests: { pushups: 4, squats60: 22, plankSec: 25 },
  shortGoal: "empezar",
  shortWeeks: 8,
  longGoal: "constancia",
  horizonMonths: 6,
  weekdays: [1, 3, 5],
  minutes: 45,
  location: "casa",
  equipment: ["gomas"],
  startDate: "2026-10-12",
});

describe("perfil", () => {
  it("bandas por test ajustadas por sexo y edad", () => {
    expect(testBand("pushups", 8, { sex: "F", age: 30 })).toBe("medio"); // 10 × 0,6 = 6
    expect(testBand("pushups", 8, { sex: "M", age: 30 })).toBe("bajo");
    expect(testBand("km1Sec", 300, { sex: "M", age: 25 })).toBe("alto");
    expect(testBand("sitStand30", 10, { sex: "F", age: 72 })).toBe("bajo");
  });
  it("principiante desde cero; con tests altos sube a intermedio; el PAR-Q bloquea", () => {
    expect(buildProfile(base)).toMatchObject({ level: "principiante", archetype: "Empieza desde cero", blocked: [] });
    const strong = buildProfile({ ...base, experience: "menos1", tests: { pushups: 30, squats60: 50, plankSec: 120 } });
    expect(strong.level).toBe("intermedio");
    expect(buildProfile({ ...base, parq: ["dolor_pecho"] }).blocked).toHaveLength(1);
  });
});

describe("proyección", () => {
  it("crece con rendimientos decrecientes, con banda, y más despacio con menos días", () => {
    const p = project("pushups", 10, "principiante", 3, 24);
    expect(p[0]).toMatchObject({ week: 0, expected: 10 });
    const last = p[p.length - 1];
    expect(last.week).toBe(24);
    expect(last.low).toBeLessThan(last.expected);
    expect(last.high).toBeGreaterThan(last.expected);
    // ganancia de las primeras 12 semanas > de las 12 siguientes
    const at = (w: number) => p.find((x) => x.week === w)!.expected;
    expect(at(12) - at(0)).toBeGreaterThan(at(24) - at(12));
    expect(project("pushups", 10, "principiante", 1, 24).at(-1)!.expected).toBeLessThan(last.expected);
    expect(frequencyFactor(3)).toBe(1);
  });
  it("en tiempos (menos es mejor) baja, con un tope realista", () => {
    const p = project("km1Sec", 420, "principiante", 4, 52);
    expect(p.at(-1)!.expected).toBeLessThan(420);
    expect(p.at(-1)!.high).toBeGreaterThanOrEqual(420 * 0.6);
  });
  it("un avanzado mejora poco", () => {
    expect(project("squats60", 50, "avanzado", 3, 24).at(-1)!.expected).toBeLessThan(54);
  });
});

describe("generador de rutinas", () => {
  it("plan válido: días, semanas, descarga, material de casa y sin zonas con molestias", () => {
    for (const goal of ["empezar", "fuerza", "resistencia", "correr_5k", "perder_grasa", "movilidad", "salud"] as const) {
      const a = { ...base, shortGoal: goal, areas: ["KNEE" as const], avoid: ["impacto" as const] };
      const { plan, request } = generateRoutine(a, "principiante");
      expect(aiPlanSchema.safeParse(plan).success).toBe(true);
      expect(validateAiPlan(plan, request)).toEqual([]);
    }
  });
  it("en el gimnasio usa máquinas o pesas y el avanzado lleva más series", () => {
    const { plan } = generateRoutine({ ...base, location: "gimnasio", shortGoal: "fuerza" }, "avanzado");
    const ex = plan.phases[0].days[0].exercises;
    expect(ex.some((e) => e.equipment.some((q) => q !== "peso_corporal"))).toBe(true);
    expect(ex.find((e) => !e.reps.endsWith("min") && !e.reps.endsWith("s"))!.sets).toBe(4);
  });
});
