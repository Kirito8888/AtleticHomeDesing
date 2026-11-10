// Integración con BD real: borrador de la ruta en bloques (no escribe), aceptar (escribe solo lo suyo)
// y convivencia con el plan de exámenes y los entrenos.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL);
const TODAY = "2031-03-10";

describe.skipIf(!HAS_DB)("ruta → bloques del día (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let svc: typeof import("./route-plan-service");
  let userId: string;
  let otherId: string;
  let moduleId: string;
  let topics: Record<string, string>;

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    svc = await import("./route-plan-service");
    userId = (await prisma.user.create({ data: { email: `rp-${Date.now()}@test.dev` } })).id;
    otherId = (await prisma.user.create({ data: { email: `rp2-${Date.now()}@test.dev` } })).id;
    const m = await prisma.studyModule.create({ data: { userId, name: "Bioquímica", examDate: new Date("2031-03-14") } });
    moduleId = m.id;
    const rows = await Promise.all(
      [
        { name: "Krebs", tag: "red", minutes: 120, position: 0 },
        { name: "Glucólisis", tag: "yellow", minutes: 60, position: 1 },
        { name: "Hecho", tag: "red", minutes: 60, position: 2, done: true },
      ].map((t) => prisma.studyTopic.create({ data: { userId, moduleId, ...t } })),
    );
    topics = Object.fromEntries(rows.map((r) => [r.name, r.id]));
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherId] } } });
  });

  it("el borrador no escribe y descuenta entrenos y bloques que ya están", async () => {
    const session = await prisma.trainingSession.create({ data: { userId, date: new Date(`${TODAY}T00:00:00Z`), type: "STRENGTH", status: "PLANNED", title: "Fuerza" } });
    await prisma.studyPlanBlock.create({ data: { userId, subject: "Cálculo", date: new Date(`${TODAY}T00:00:00Z`), minutes: 100 } });
    const d = await svc.routeDraft(userId, moduleId, TODAY);
    expect(await prisma.studyPlanBlock.count({ where: { userId, moduleId } })).toBe(0);
    expect(d.days.map((x) => x.date)).toEqual(["2031-03-10", "2031-03-11", "2031-03-12", "2031-03-13"]);
    // 180 − 60 (entreno) − 100 (Cálculo) = 20 libres → menos que el tramo de 30: Krebs empieza el 11
    expect(d.days[0]).toMatchObject({ free: 20, training: ["Fuerza"] });
    expect(d.blocks.map((b) => [b.topic, b.date, b.minutes])).toEqual([
      ["Krebs", "2031-03-11", 120],
      ["Glucólisis", "2031-03-11", 60],
    ]);
    expect(d.unscheduled).toEqual([]);
    expect(d.topics.map((t) => t.name)).not.toContain("Hecho");
    await prisma.trainingSession.delete({ where: { id: session.id } });
  });

  it("aceptar crea los bloques retocados; el plan de exámenes no los borra; reaceptar solo sustituye los suyos", async () => {
    const r = await svc.acceptRoutePlan(userId, moduleId, TODAY, {
      blocks: [
        { topicId: topics.Krebs, date: "2031-03-11", minutes: 90 },
        { topicId: topics.Glucólisis, date: "2031-03-12", minutes: 45 },
      ],
    });
    expect(r).toEqual({ created: 2, replaced: 0 });
    const mine = await prisma.studyPlanBlock.findMany({ where: { userId, moduleId }, orderBy: { date: "asc" } });
    expect(mine.map((b) => [b.subject, b.topicId, b.minutes, b.examId])).toEqual([
      ["Bioquímica", topics.Krebs, 90, null],
      ["Bioquímica", topics.Glucólisis, 45, null],
    ]);

    // El planificador de exámenes regenera los suyos sin tocar los de la ruta
    const { createSlot } = await import("./schedule-service");
    const exam = await createSlot(userId, { kind: "EXAM", subject: "Física", date: "2031-03-13", start: "09:00", end: "11:00" });
    const { generateExamPlan } = await import("./exam-plan-service");
    await generateExamPlan(userId, TODAY, { [exam.id]: 2 });
    expect(await prisma.studyPlanBlock.count({ where: { userId, moduleId } })).toBe(2);
    const physics = await prisma.studyPlanBlock.findMany({ where: { userId, examId: exam.id } });
    expect(physics.reduce((a, b) => a + b.minutes, 0)).toBe(120);

    // Reaceptar: sustituye los 2 pendientes de la asignatura; Física y Cálculo siguen
    await prisma.studyPlanBlock.update({ where: { id: mine[0].id }, data: { done: true } });
    const again = await svc.acceptRoutePlan(userId, moduleId, TODAY, { blocks: [{ topicId: topics.Glucólisis, date: "2031-03-13", minutes: 30 }] });
    expect(again).toEqual({ created: 1, replaced: 1 });
    expect(await prisma.studyPlanBlock.count({ where: { userId, moduleId } })).toBe(2); // el hecho se queda
    expect(await prisma.studyPlanBlock.count({ where: { userId, examId: exam.id } })).toBe(physics.length);
    // «Cálculo» (sin asignatura) era un bloque del planificador de exámenes: ese sí lo regenera él, como siempre
    expect(await prisma.studyPlanBlock.count({ where: { userId, subject: "Cálculo" } })).toBe(0);
  });

  it("valida plazo, tema y propiedad", async () => {
    await expect(svc.acceptRoutePlan(userId, moduleId, TODAY, { blocks: [{ topicId: topics.Krebs, date: "2031-03-09", minutes: 30 }] })).rejects.toMatchObject({ status: 400 });
    await expect(svc.acceptRoutePlan(userId, moduleId, TODAY, { blocks: [{ topicId: topics.Krebs, date: "2031-03-14", minutes: 30 }] })).rejects.toMatchObject({ status: 400 });
    await expect(svc.acceptRoutePlan(userId, moduleId, TODAY, { blocks: [{ topicId: "otro", date: "2031-03-11", minutes: 30 }] })).rejects.toMatchObject({ status: 400 });
    await expect(svc.routeDraft(otherId, moduleId, TODAY)).rejects.toMatchObject({ status: 404 });
    await expect(svc.acceptRoutePlan(otherId, moduleId, TODAY, { blocks: [{ topicId: topics.Krebs, date: "2031-03-11", minutes: 30 }] })).rejects.toMatchObject({ status: 404 });
  });
});
