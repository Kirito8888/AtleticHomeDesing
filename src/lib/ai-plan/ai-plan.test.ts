import { describe, expect, it } from "vitest";

import { adjustBlocks, chooseAlternative, swapForEquipment } from "./adjust";
import { expandAiPlan, progress } from "./expand";
import { fakeAiPlan } from "./fake";
import { allowedEquipment, planRequestSchema, type PlanRequest } from "./options";
import { buildPlanPrompt } from "./prompt";
import { aiPlanSchema } from "./schema";
import { validateAiPlan } from "./validate";

const base = (over: Partial<PlanRequest> = {}): PlanRequest =>
  planRequestSchema.parse({
    goal: "fuerza",
    discipline: "general",
    level: "intermedio",
    ageBand: "18-29",
    weekdays: [1, 3, 5],
    minutes: 60,
    weeks: 8,
    startDate: "2026-10-07", // miércoles: la primera semana empieza a mitad
    dayLocations: ["gimnasio", "casa", "parque"],
    equipment: ["gomas"],
    intensity: "media",
    style: "series",
    ...over,
  });

describe("cuestionario", () => {
  it("valida días repetidos, sitios por día y competición fuera del plan", () => {
    const bad = (o: object) => planRequestSchema.safeParse({ ...base(), ...o }).success;
    expect(bad({ weekdays: [1, 1, 3] })).toBe(false);
    expect(bad({ dayLocations: ["casa"] })).toBe(false);
    expect(bad({ competitionWeek: 9 })).toBe(false);
    expect(bad({ minutes: 50 })).toBe(false);
    expect(bad({ notes: "texto libre" })).toBe(true); // se ignora: no hay campos de texto libre
  });

  it("material disponible por sitio: lo marcado + lo del sitio + peso corporal", () => {
    expect([...allowedEquipment("casa", ["gomas"])].sort()).toEqual(["gomas", "peso_corporal"]);
    expect(allowedEquipment("gimnasio", []).has("barra_discos")).toBe(true);
    expect(allowedEquipment("pista", []).has("pista")).toBe(true);
  });

  it("el prompt no lleva fechas exactas ni datos personales", () => {
    const p = buildPlanPrompt(base({ competitionWeek: 6 }));
    expect(p).not.toMatch(/2026|regla|ciclo|menstru/i);
    expect(p).toMatch(/weekday 3 \(Miércoles\): Casa\. Material permitido: peso_corporal \(Peso corporal\), gomas \(Gomas elásticas\)/);
    expect(p).toMatch(/Competición objetivo al final de la semana 6/);
  });
});

describe("validación de lo que devuelve la IA", () => {
  it("el plan simulado cumple el esquema y todas las reglas", () => {
    for (const r of [base(), base({ weeks: 4 }), base({ weeks: 12, avoid: ["impacto"], areas: ["KNEE"] }), base({ dayLocations: ["casa", "casa", "casa"], equipment: [] })]) {
      const plan = aiPlanSchema.parse(fakeAiPlan(r));
      expect(validateAiPlan(plan, r)).toEqual([]);
    }
  });

  it("detecta material no disponible, patrones a evitar, zonas con molestias, días y duración", () => {
    const r = base({ avoid: ["saltos"], areas: ["KNEE"] });
    const plan = structuredClone(fakeAiPlan(base()));
    const casa = plan.phases[0].days.find((d) => d.weekday === 3)!;
    casa.exercises[0] = { ...casa.exercises[0], name: "Sentadilla con barra", equipment: ["barra_discos"], areas: ["KNEE"], patterns: [] };
    casa.exercises[1] = { ...casa.exercises[1], name: "Saltos", patterns: ["saltos"] };
    casa.durationMin = 90;
    plan.phases[1].days.pop();
    const errors = validateAiPlan(plan, r).join("\n");
    expect(errors).toMatch(/«Sentadilla con barra»: usa material no disponible \(Barra y discos\)/);
    expect(errors).toMatch(/«Sentadilla con barra».*carga una zona con molestias \(KNEE\)/);
    expect(errors).toMatch(/«Saltos»: incluye saltos/);
    expect(errors).toMatch(/dura 90 min \(máximo 60\)/);
    expect(errors).toMatch(/los días deben ser exactamente weekday 1,3,5/);
  });

  it("exige semanas totales y descarga cada 4 semanas en planes de 6 o más", () => {
    const r = base({ weeks: 8 });
    const plan = fakeAiPlan(r);
    plan.phases = [{ ...plan.phases[0], weeks: 8, deload: false }];
    expect(validateAiPlan(plan, r)).toContain("Falta una semana de descarga (deload) como mucho cada 4 semanas.");
    plan.phases[0].weeks = 7;
    expect(validateAiPlan(plan, r)).toContain("Las fases suman 7 semanas y se pidieron 8.");
  });
});

describe("del plan a días con fecha", () => {
  it("empieza el día elegido, numera semanas y guarda la versión suave", () => {
    const r = base();
    const e = expandAiPlan(fakeAiPlan(r), r, "IA1");
    expect(e.start).toBe("2026-10-07");
    expect(e.days[0]).toMatchObject({ date: "2026-10-07", week: 1, weekday: 3, location: "casa", key: "IA1|-|2026-10-07|1" });
    expect(e.days.filter((d) => d.week === 1).map((d) => d.date)).toEqual(["2026-10-07", "2026-10-09"]); // el lunes 5 ya pasó
    expect(e.days.at(-1)!.date).toBe("2026-11-27"); // viernes de la semana 8
    expect(e.weeks).toHaveLength(8);
    expect(e.days[0].light.blocks.some((b) => b.kind === "table")).toBe(true);
    const row = e.days[0].blocks.find((b) => b.kind === "table")!;
    expect(row.kind === "table" && row.rows[0].equipment).toBeTruthy();
  });

  it("progresión ≈10 % semanal, con tope de 6 series y bajada con −1", () => {
    const ex = (sets: number) => ({ ...fakeAiPlan(base()).phases[0].days[0].exercises[0], sets });
    const four = [ex(3), ex(3), ex(3), ex(3)]; // 12 series
    const total = (l: { sets: number }[]) => l.reduce((a, e) => a + e.sets, 0);
    expect([0, 1, 2, 3].map((i) => total(progress(four, 1, i)))).toEqual([12, 13, 14, 15]);
    expect(total(progress(four, -1, 2))).toBe(10);
    expect(progress([ex(6)], 1, 3)[0].sets).toBe(6);
  });
});

describe("ajustes sin IA", () => {
  const blocks = () => expandAiPlan(fakeAiPlan(base()), base(), "IA1").days[0].blocks;

  it("semana dura → una serie menos; fácil → una más; bien → igual", () => {
    const sets = (b: ReturnType<typeof blocks>) => b.flatMap((x) => (x.kind === "table" ? x.rows.map((r) => r.sets) : []));
    expect(sets(adjustBlocks(blocks(), "HARD").blocks)[0]).toMatch(/^2 ×/);
    expect(sets(adjustBlocks(blocks(), "EASY").blocks)[0]).toMatch(/^4 ×/);
    expect(adjustBlocks(blocks(), "OK").changed).toBe(false);
  });

  it("cambiar de sitio: usa alternativas compatibles y deja las imposibles para la IA", () => {
    const r = base();
    const gym = expandAiPlan(fakeAiPlan(r), r, "IA1").days.find((d) => d.location === "gimnasio")!;
    const { blocks: out, unresolved, swapped } = swapForEquipment(gym.blocks, allowedEquipment("casa", []));
    const rows = out.flatMap((b) => (b.kind === "table" ? b.rows : []));
    for (const row of rows.filter((x) => !unresolved.some((u) => u.item.exercise === x.exercise))) {
      expect(row.equipment!.every((q) => q === "peso_corporal")).toBe(true);
    }
    expect(swapped + unresolved.length).toBeGreaterThan(0);
    const names = rows.map((x) => x.exercise);
    expect(new Set(names).size).toBe(names.length); // sin ejercicios repetidos
    const changed = rows.find((x) => x.original);
    if (changed) expect(changed.alternatives![0].name).toBe(changed.original);
  });

  it("elegir una alternativa concreta guarda el original como opción", () => {
    const b = blocks();
    const ti = b.findIndex((x) => x.kind === "table");
    const before = b[ti].kind === "table" ? b[ti].rows[0] : null;
    const after = chooseAlternative(b, ti, 0, 0)[ti];
    expect(after.kind === "table" && after.rows[0].exercise).toBe(before!.alternatives![0].name);
    expect(after.kind === "table" && after.rows[0].alternatives![0].name).toBe(before!.exercise);
  });
});
