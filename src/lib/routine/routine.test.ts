import { describe, expect, it } from "vitest";

import { allowedEquipment, spacesLabel, spacesOf } from "@/lib/ai-plan/options";
import { buildPlanPrompt } from "@/lib/ai-plan/prompt";
import { validateAiPlan } from "@/lib/ai-plan/validate";
import { expandAiPlan } from "@/lib/ai-plan/expand";
import { type AiExerciseWithBasis, aiPlanSchema } from "@/lib/ai-plan/schema";
import { CITATIONS } from "@/lib/training/prescription";

import { generateRoutine } from "./generator";
import { buildProfile, frequencyFactor, project, testBand } from "./profile";
import { routineAnswersSchema, routineSpaces } from "./questionnaire";

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
  locations: ["casa"],
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
  it("en el gimnasio usa máquinas o pesas y el avanzado lleva 3-6 repeticiones con descanso largo", () => {
    const { plan } = generateRoutine({ ...base, locations: ["gimnasio"], shortGoal: "fuerza" }, "avanzado");
    const ex = plan.phases[0].days[0].exercises;
    expect(ex.some((e) => e.equipment.some((q) => q !== "peso_corporal"))).toBe(true);
    const first = ex.find((e) => !e.reps.endsWith("min") && !e.reps.endsWith("s"))!;
    expect(first).toMatchObject({ reps: "3-6", rest: "3 min", intensity: "RIR 1-2" });
  });
});

describe("multiespacio", () => {
  it("validador: el `location` antiguo pasa a `locations`; rechaza vacío, repetidos y ajustes incoherentes", () => {
    expect(routineAnswersSchema.parse({ ...base, locations: undefined, location: "casa" }).locations).toEqual(["casa"]);
    expect(routineAnswersSchema.safeParse({ ...base, locations: [] }).success).toBe(false);
    expect(routineAnswersSchema.safeParse({ ...base, locations: ["pista", "pista"] }).success).toBe(false);
    expect(routineAnswersSchema.safeParse({ ...base, locations: ["pista", "gimnasio"], dayLocations: [["pista"]] }).success).toBe(false);
    expect(routineAnswersSchema.safeParse({ ...base, locations: ["pista"], dayLocations: [["pista"], ["piscina"], ["pista"]] }).success).toBe(false);
    expect(routineAnswersSchema.safeParse({ ...base, locations: ["pista", "gimnasio"], dayLocations: [["pista"], ["gimnasio"], ["pista", "gimnasio"]] }).success).toBe(true);
  });
  it("ensamblador: une el material de los espacios de cada día y lee respuestas antiguas", () => {
    const eq = allowedEquipment(["pista", "gimnasio"], []);
    expect(eq.has("pista") && eq.has("maquinas") && eq.has("barra_discos")).toBe(true);
    expect(allowedEquipment(["piscina"], []).has("maquinas")).toBe(false);
    expect(routineSpaces({ weekdays: [1, 3], location: "casa" })).toEqual([["casa"], ["casa"]]);
    const { request } = generateRoutine({ ...base, locations: ["pista", "gimnasio"], dayLocations: [["pista", "gimnasio"], ["gimnasio"], ["pista", "gimnasio"]] }, "principiante");
    expect(spacesOf(request, 3)).toEqual(["gimnasio"]);
    expect(spacesLabel(spacesOf(request, 1)!)).toBe("Pista de atletismo + Gimnasio");
    expect(spacesOf({ weekdays: [2], dayLocations: ["casa"] }, 2)).toEqual(["casa"]);
  });
  it("el prompt de la IA lista los espacios y su material", () => {
    const { request } = generateRoutine({ ...base, locations: ["pista", "piscina"] }, "principiante");
    const prompt = buildPlanPrompt(request);
    expect(prompt).toContain("Pista de atletismo + Piscina");
    expect(prompt).toContain("piscina (Piscina)");
  });
  it("generador: cada día solo lleva ejercicios factibles en sus espacios", () => {
    const a = { ...base, shortGoal: "fuerza" as const, equipment: [], locations: ["gimnasio" as const, "piscina" as const], dayLocations: [["piscina" as const], ["gimnasio" as const, "piscina" as const], ["piscina" as const]] };
    const { plan, request } = generateRoutine(a, "intermedio");
    expect(validateAiPlan(plan, request)).toEqual([]);
    expect(plan.phases[0].days[0].exercises.every((e) => e.equipment.every((q) => q === "peso_corporal" || q === "piscina"))).toBe(true);
    expect(plan.phases[0].days[1].exercises.some((e) => e.equipment.some((q) => q === "maquinas" || q === "barra_discos" || q === "mancuernas" || q === "kettlebell"))).toBe(true);
  });
});

describe("prescripción científica en el generador", () => {
  const strength = (plan: ReturnType<typeof generateRoutine>["plan"]) => plan.phases[0].days.flatMap((d) => d.exercises).filter((e) => !e.reps.endsWith("min") && !e.reps.endsWith("s"));

  it("cada ejercicio de la rutina lleva justificación con citas que existen y DOI", () => {
    const ids = new Set(CITATIONS.map((c) => c.id));
    for (const goal of ["empezar", "fuerza", "resistencia", "correr_5k", "perder_grasa", "movilidad", "salud"] as const) {
      const { plan } = generateRoutine({ ...base, shortGoal: goal }, "intermedio");
      for (const e of plan.phases[0].days.flatMap((d) => d.exercises)) {
        const b = (e as AiExerciseWithBasis).basis;
        expect(b, `${goal}: ${e.name}`).toBeDefined();
        expect(b!.why.length).toBeGreaterThan(20);
        expect(b!.refs.length).toBeGreaterThan(0);
        for (const r of b!.refs) expect(ids.has(r)).toBe(true);
      }
    }
  });
  it("fuerza e hipertrofia (salud) dan dosis distintas, con la pauta citada", () => {
    const f = strength(generateRoutine({ ...base, shortGoal: "fuerza", equipment: ["mancuernas", "banco", "gomas"] }, "intermedio").plan)[0];
    const h = strength(generateRoutine({ ...base, shortGoal: "salud", equipment: ["mancuernas", "banco", "gomas"] }, "intermedio").plan)[0];
    expect(f).toMatchObject({ reps: "6-8", rest: "2,5 min" });
    expect(h).toMatchObject({ reps: "6-12", rest: "2 min" });
    expect((f as AiExerciseWithBasis).basis!.refs).toContain("grgic2018");
    expect((h as AiExerciseWithBasis).basis!.refs).toContain("schoenfeld2017");
  });
  it("las series reparten el volumen semanal y, si el día no cabe, se deja el mínimo y se dice", () => {
    const rich = { ...base, shortGoal: "fuerza" as const, equipment: ["mancuernas" as const, "banco" as const, "gomas" as const] };
    const normal = generateRoutine({ ...rich, minutes: 90 }, "avanzado").plan;
    expect(strength(normal).every((e) => e.sets >= 2 && e.sets <= 5)).toBe(true);
    const short = generateRoutine({ ...rich, minutes: 20 }, "avanzado").plan;
    expect(strength(short).every((e) => e.sets === 2)).toBe(true);
    expect((strength(short)[0] as AiExerciseWithBasis).basis!.why).toContain("tiempo");
  });
  it("sigue siendo un plan válido: la versión suave y la descarga no arrastran la justificación", () => {
    const { plan, request } = generateRoutine({ ...base, shortGoal: "fuerza", shortWeeks: 6 }, "principiante");
    expect(validateAiPlan(plan, request)).toEqual([]);
    expect(plan.why.length).toBeLessThanOrEqual(700);
    const deload = plan.phases.find((p) => p.deload)!;
    expect(deload.days.flatMap((d) => d.exercises).every((e) => !(e as AiExerciseWithBasis).basis)).toBe(true);
    expect(plan.phases[0].days[0].light.exercises.every((e) => !(e as AiExerciseWithBasis).basis)).toBe(true);
  });
  it("al expandir, la fila lleva `basis` y la introducción lista las referencias con DOI", () => {
    const { plan, request } = generateRoutine({ ...base, shortGoal: "fuerza" }, "principiante");
    const e = expandAiPlan(plan, request, "RT1");
    const rows = e.days[0].blocks.flatMap((b) => (b.kind === "table" ? b.rows : []));
    expect(rows.some((r) => r.basis?.refs.length)).toBe(true);
    const refs = e.intro.find((s) => s.title === "Referencias")!;
    expect(refs.text).toMatch(/doi:10\.\d{4,9}\//);
    // la versión suave no lleva justificación
    expect(e.days[0].light.blocks.flatMap((b) => (b.kind === "table" ? b.rows : [])).every((r) => !r.basis)).toBe(true);
  });
});
