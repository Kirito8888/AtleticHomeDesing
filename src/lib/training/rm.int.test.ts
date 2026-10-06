// Integración con BD real: tabla de RM desde el anexo del plan, historial, alias y «Mis reglas».
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL);

describe.skipIf(!HAS_DB)("tabla de RM (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let svc: typeof import("./rm-service");
  let prefs: typeof import("@/lib/rules/prefs-service");
  let userId: string;

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    svc = await import("./rm-service");
    prefs = await import("@/lib/rules/prefs-service");
    userId = (await prisma.user.create({ data: { email: `rm-${Date.now()}@test.dev` } })).id;
    // Bloque importado ficticio con su anexo de RM y un día con %RM.
    const meso = await prisma.planMeso.create({
      data: {
        userId,
        code: "M1",
        name: "Bloque",
        startDate: new Date("2026-10-05"),
        endDate: new Date("2026-10-11"),
        intro: [],
        weeks: [],
        variants: [],
        annexes: [
          { title: "Anexo A · Cálculos", text: "Sentadilla falsa 999 Sí" },
          { title: "Anexo B · Mi tabla de RM (kg)", text: "Ejercicio RM ¿Lo uso? Sentadilla frontal 100 Sí Remo Pendlay 80 Sí Prensa 200 No" },
          { title: "Anexo C · Referencias", text: "Otra cosa 50 Sí" },
        ],
      },
    });
    const s = await prisma.trainingSession.create({ data: { userId, date: new Date("2026-10-05"), type: "STRENGTH", status: "PLANNED" } });
    await prisma.planDay.create({
      data: {
        userId,
        mesoId: meso.id,
        key: "M1|-|2026-10-05|1",
        code: "S1",
        date: new Date("2026-10-05"),
        title: "Fuerza",
        type: "STRENGTH",
        sessionId: s.id,
        content: [{ kind: "table", rows: [{ exercise: "Remo con barra raro", sets: "3 × 5", load: "80 %", rir: "2", rest: "", how: "", ramp: false }] }],
      },
    });
  });
  afterAll(async () => {
    if (userId) await prisma.user.delete({ where: { id: userId } });
  });

  it("lee solo el anexo de la tabla de RM e importa lo elegido", async () => {
    const found = await svc.rmsFromPlan(userId);
    expect(found.map((f) => [f.name, f.kg, f.used, f.current])).toEqual([
      ["Sentadilla frontal", 100, true, null],
      ["Remo Pendlay", 80, true, null],
      ["Prensa", 200, false, null],
    ]);
    await svc.importRms(userId, found.filter((f) => f.used));
    expect((await svc.currentRms(userId)).map((r) => [r.name, r.kg, r.source])).toEqual([
      ["Remo Pendlay", 80, "PLAN"],
      ["Sentadilla frontal", 100, "PLAN"],
    ]);
  });

  it("una RM nueva manda sobre la anterior y queda el historial", async () => {
    await svc.addRm(userId, { name: "Sentadilla frontal", kg: 105, source: "TEST", effectiveFrom: "2026-10-20" });
    expect((await svc.currentRms(userId)).find((r) => r.key === "sentadilla frontal")?.kg).toBe(105);
    expect((await svc.rmHistory(userId)).filter((r) => r.nameKey === "sentadilla frontal")).toHaveLength(2);
  });

  it("ejercicios del plan sin RM ni catálogo, y alias que se recuerdan", async () => {
    let u = await svc.unlinkedPlanExercises(userId);
    expect(u.noRm).toEqual(["Remo con barra raro"]);
    expect(u.noCatalog).toEqual(["Remo con barra raro"]);
    const ex = await prisma.exercise.create({ data: { userId, name: "Remo con barra (propio)" } });
    await svc.setAlias(userId, "Remo con barra raro", { rmKey: "remo pendlay" });
    await svc.setAlias(userId, "Remo con barra raro", { exerciseId: ex.id });
    u = await svc.unlinkedPlanExercises(userId);
    expect(u).toEqual({ noRm: [], noCatalog: [] });
    const ctx = await svc.rmContext(userId);
    expect(ctx.aliases.get("remo con barra raro")).toBe("remo pendlay");
    expect(ctx.exerciseAliases.get("remo con barra raro")).toBe(ex.id);
  });

  it("mis reglas: por defecto y actualización parcial validada", async () => {
    expect((await prefs.getPrefs(userId)).kgStep).toBe(2.5);
    expect(await prefs.updatePrefs(userId, { kgStep: 1.25, weightMinKg: 70 })).toMatchObject({ kgStep: 1.25, weightMinKg: 70, squeezeMax: 3 });
    await expect(prefs.updatePrefs(userId, { kgStep: 7 })).rejects.toThrow();
    expect((await svc.rmContext(userId)).step).toBe(1.25);
  });
});
