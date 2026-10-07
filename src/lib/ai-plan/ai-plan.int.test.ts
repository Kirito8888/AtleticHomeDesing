// Integración con BD real del plan con IA, con Gemini simulado (la CI no tiene clave).
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { fakeAiPlan } from "./fake";
import { planRequestSchema } from "./options";
import { aiPlanSchema } from "./schema";

const HAS_DB = Boolean(process.env.DATABASE_URL);

const request = planRequestSchema.parse({
  goal: "fuerza",
  discipline: "general",
  level: "intermedio",
  ageBand: "18-29",
  weekdays: [1, 3, 5],
  minutes: 60,
  weeks: 4,
  startDate: "2027-03-01",
  dayLocations: ["gimnasio", "casa", "casa"],
  equipment: ["gomas"],
  intensity: "media",
  style: "series",
});

describe.skipIf(!HAS_DB)("plan con IA (BD real, Gemini simulado)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let svc: typeof import("./service");
  let cycle: typeof import("@/lib/health/cycle-service");
  let userId: string;
  const prompts: string[] = [];
  let calls = 0;
  const deps = {
    assertAllowed: async () => {},
    // 1.ª respuesta incumple (material de gimnasio en casa); la 2.ª es correcta: debe reintentar.
    generate: (async (_schema: unknown, params: { prompt: unknown }) => {
      prompts.push(String(params.prompt));
      if (String(params.prompt).startsWith("Sustituye")) {
        // Cambio de material: un ejercicio con peso corporal por cada uno pedido.
        const n = String(params.prompt).split("\n").filter((l) => l.startsWith("- ")).length;
        const ex = { ...fakeAiPlan(request).phases[0].days[1].exercises[0], name: "Sentadilla a una pierna asistida", equipment: ["peso_corporal"] };
        return { data: { exercises: Array.from({ length: n }, () => ex) }, model: "gemini-falso" };
      }
      calls++;
      const plan = fakeAiPlan(request);
      if (calls === 1) plan.phases[0].days[1].exercises[0].equipment = ["barra_discos"];
      return { data: aiPlanSchema.parse(plan), model: "gemini-falso" };
    }) as never,
  };

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    svc = await import("./service");
    cycle = await import("@/lib/health/cycle-service");
    userId = (await prisma.user.create({ data: { email: `aiplan-${Date.now()}@test.dev` } })).id;
    // Datos del ciclo guardados ANTES de generar: no deben llegar al prompt.
    await cycle.saveCycleSettings(userId, { avgLength: 29, periodDays: 5, lastStart: "2027-02-20", hormonal: "no", symptoms: ["dolor"], symptomParts: ["regla"] });
  });
  afterAll(async () => {
    if (userId) await prisma.user.delete({ where: { id: userId } });
  });

  it("no genera si hay una respuesta de seguridad marcada", async () => {
    await expect(svc.generateAiPlan(userId, { ...request, safety: ["dolor_pecho"] }, deps)).rejects.toMatchObject({ status: 422 });
    expect(calls).toBe(0);
  });

  it("genera un borrador validado (reintenta si incumple) sin crear sesiones; el prompt no lleva el ciclo", async () => {
    const r = await svc.generateAiPlan(userId, request, deps);
    expect(calls).toBe(2);
    expect(prompts[1]).toMatch(/no cumplía estas reglas[\s\S]*usa material no disponible \(Barra y discos\)/);
    expect(r).toMatchObject({ code: "IA1", warnings: [], days: 12 });
    for (const p of prompts) expect(p).not.toMatch(/\bregla\b|ciclo|menstru|2027-02-20|29 días|\bdolor\b/i);
    const meso = await prisma.planMeso.findUniqueOrThrow({ where: { userId_code: { userId, code: "IA1" } } });
    expect(meso).toMatchObject({ source: "AI", status: "DRAFT" });
    expect(await prisma.trainingSession.count({ where: { userId } })).toBe(0);
    // Guardado cifrado: en la BD no se lee nada del ciclo.
    const raw = await prisma.cycleProfile.findUniqueOrThrow({ where: { userId } });
    expect(raw.data).toMatch(/^v1:/);
    expect(raw.data).not.toMatch(/regla|dolor|2027/);
  });

  it("activar crea las sesiones; versión suave, cambio de sitio y valoración semanal", async () => {
    const act = await svc.activateAiPlan(userId, "IA1");
    expect(act.sessionsCreated).toBe(12);
    const day = await prisma.planDay.findFirstOrThrow({ where: { userId, date: new Date("2027-03-01") } });

    await svc.setDayMode(userId, day.id, "LIGHT");
    const s = await prisma.trainingSession.findUniqueOrThrow({ where: { id: day.sessionId! } });
    expect(s.title).toMatch(/versión suave/);
    await svc.setDayMode(userId, day.id, null);

    // El lunes era en el gimnasio: hoy en casa sin material.
    const sw = await svc.swapDayLocation(userId, day.id, "casa", [], deps);
    const after = await prisma.planDay.findUniqueOrThrow({ where: { id: day.id } });
    const rows = (after.content as Array<{ kind: string; rows?: Array<{ equipment?: string[] }> }>).flatMap((b) => b.rows ?? []);
    expect(sw.pending).toBe(0);
    expect(rows.every((r) => r.equipment!.every((e) => e === "peso_corporal"))).toBe(true);

    const fb = await svc.submitWeekFeedback(userId, "IA1", 1, "HARD", 5);
    expect(fb.adjusted).toBe(3);
    const wk2 = await prisma.planDay.findMany({ where: { userId, week: 2 } });
    expect(wk2.every((d) => d.mode === "LIGHT")).toBe(true);
  });

  it("los datos del ciclo: fase de hoy, versión suave por síntomas y borrado", async () => {
    expect((await cycle.cycleToday(userId, "2027-02-21"))?.suggestion).toMatch(/durante la regla/);
    await cycle.logCycleDay(userId, { date: "2027-03-10", period: false, symptoms: ["fatiga"] });
    expect((await cycle.cycleToday(userId, "2027-03-10"))?.suggestion).toMatch(/síntomas/);
    await cycle.deleteCycleData(userId);
    expect(await cycle.cycleToday(userId, "2027-03-10")).toBeNull();
  });
});
