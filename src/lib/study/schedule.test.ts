import { describe, expect, it } from "vitest";

import { classMinutes, classSlotSchema, examClashes, fromMin, habitStreak, type Slot, slotsOnDay, studyWeek, toMin, weekdayOf } from "./schedule";

const slot = (p: Partial<Slot>): Slot => ({
  id: "x",
  subject: "Física",
  kind: "CLASS",
  weekday: null,
  date: null,
  startMin: 540,
  endMin: 660,
  validFrom: null,
  validTo: null,
  location: null,
  ...p,
});

describe("horario", () => {
  it("convierte horas", () => {
    expect(toMin("09:30")).toBe(570);
    expect(fromMin(570)).toBe("09:30");
  });

  it("el 2026-10-05 es lunes", () => {
    expect(weekdayOf("2026-10-05")).toBe(0);
    expect(weekdayOf("2026-10-11")).toBe(6);
  });

  it("valida que el fin sea posterior al inicio", () => {
    expect(classSlotSchema.safeParse({ kind: "CLASS", weekday: 0, subject: "A", start: "10:00", end: "09:00" }).success).toBe(false);
    expect(classSlotSchema.safeParse({ kind: "EXAM", date: "2026-10-20", subject: "A", start: "10:00", end: "12:00" }).success).toBe(true);
  });

  it("clases del día respetan el periodo de validez y los exámenes su fecha", () => {
    const slots = [
      slot({ id: "a", weekday: 0, startMin: 600 }),
      slot({ id: "b", weekday: 0, startMin: 480, validTo: "2026-09-30" }),
      slot({ id: "c", kind: "EXAM", date: "2026-10-05", startMin: 500 }),
      slot({ id: "d", weekday: 1 }),
    ];
    expect(slotsOnDay(slots, "2026-10-05").map((s) => s.id)).toEqual(["c", "a"]);
    expect(classMinutes(slots, "2026-10-05")).toBe(60);
  });

  it("avisa de sesiones el día del examen o la víspera", () => {
    const slots = [slot({ kind: "EXAM", date: "2026-10-20", subject: "Cálculo" })];
    const c = examClashes(slots, [
      { id: "s1", date: "2026-10-20", title: "Test RM" },
      { id: "s2", date: "2026-10-19", title: "Lanzamientos" },
      { id: "s3", date: "2026-10-18", title: "Fuerza" },
    ]);
    expect(c.map((x) => [x.id, x.kind])).toEqual([
      ["s2", "EVE"],
      ["s1", "EXAM"],
    ]);
    expect(c[0].subject).toBe("Cálculo");
  });
});

describe("horas de estudio", () => {
  it("suma por día y asignatura dentro de la semana", () => {
    const w = studyWeek(
      [
        { subject: "Física", date: "2026-10-05", minutes: 25 },
        { subject: "Física", date: "2026-10-05", minutes: 25 },
        { subject: "Cálculo", date: "2026-10-07", minutes: 50 },
        { subject: "Cálculo", date: "2026-10-12", minutes: 99 },
      ],
      "2026-10-05",
    );
    expect(w.total).toBe(100);
    expect(w.days[0].minutes).toBe(50);
    expect(w.days[2].minutes).toBe(50);
    expect(w.subjects).toEqual([
      { subject: "Física", minutes: 50 },
      { subject: "Cálculo", minutes: 50 },
    ]);
  });
});

describe("rachas de hábitos", () => {
  it("cuenta la racha hasta hoy y mantiene viva la de ayer", () => {
    const dates = ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-06", "2026-10-07", "2026-10-08"];
    expect(habitStreak(dates, "2026-10-08")).toMatchObject({ current: 3, best: 3, doneToday: true });
    expect(habitStreak(dates, "2026-10-09")).toMatchObject({ current: 3, doneToday: false });
    expect(habitStreak(dates, "2026-10-10").current).toBe(0);
    expect(habitStreak([...dates, "2026-10-04", "2026-10-05"], "2026-10-08").best).toBe(8);
    expect(habitStreak(dates, "2026-10-08").last7.map((d) => d.done)).toEqual([true, true, false, false, true, true, true]);
  });
});
