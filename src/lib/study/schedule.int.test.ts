// Integración con BD real: horario con choques de exámenes y hábitos con racha.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL);

describe.skipIf(!HAS_DB)("horario y hábitos (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let svc: typeof import("./schedule-service");
  let userId: string;
  let otherId: string;

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    svc = await import("./schedule-service");
    userId = (await prisma.user.create({ data: { email: `sch-${Date.now()}@test.dev` } })).id;
    otherId = (await prisma.user.create({ data: { email: `sch2-${Date.now()}@test.dev` } })).id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherId] } } });
  });

  it("avisa de una sesión planificada el día de un examen y la víspera", async () => {
    await svc.createSlot(userId, { kind: "EXAM", subject: "Cálculo", date: "2026-10-20", start: "09:00", end: "11:00" });
    await svc.createSlot(userId, { kind: "CLASS", subject: "Física", weekday: 0, start: "10:00", end: "12:00" });
    await prisma.trainingSession.createMany({
      data: [
        { userId, date: new Date("2026-10-19"), type: "TECHNICAL", status: "PLANNED", title: "Lanzamientos" },
        { userId, date: new Date("2026-10-20"), type: "STRENGTH", status: "PLANNED", title: "Test RM" },
        { userId, date: new Date("2026-10-20"), type: "STRENGTH", status: "COMPLETED", title: "Ya hecha" },
      ],
    });
    const r = await svc.upcomingExamClashes(userId, "2026-10-15");
    expect(r.clashes.map((c) => [c.title, c.kind])).toEqual([
      ["Lanzamientos", "EVE"],
      ["Test RM", "EXAM"],
    ]);
    expect(r.nextExam?.subject).toBe("Cálculo");
    expect(await svc.knownSubjects(userId)).toEqual(["Cálculo", "Física"]);
  });

  it("no deja borrar clases de otra persona", async () => {
    const [slot] = await svc.listSlots(userId);
    await expect(svc.deleteSlot(otherId, slot.id)).rejects.toThrow(/no encontrad/);
  });

  it("un toque marca y otro desmarca; la racha cuenta días seguidos", async () => {
    const h = await prisma.habit.create({ data: { userId, name: "Estiramientos" } });
    expect(await svc.toggleHabit(userId, h.id, "2026-10-07")).toBe(true);
    expect(await svc.toggleHabit(userId, h.id, "2026-10-08")).toBe(true);
    let [view] = await svc.habitsToday(userId, "2026-10-08");
    expect(view).toMatchObject({ current: 2, doneToday: true });
    expect(await svc.toggleHabit(userId, h.id, "2026-10-08")).toBe(false);
    [view] = await svc.habitsToday(userId, "2026-10-08");
    expect(view).toMatchObject({ current: 1, doneToday: false });
    await expect(svc.toggleHabit(otherId, h.id, "2026-10-08")).rejects.toThrow(/no encontrado/);
  });
});
