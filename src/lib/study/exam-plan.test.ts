import { describe, expect, it } from "vitest";

import { blocksToTick, dayCapacity, gradeAverage, madridToUtc, planStudy, studyIcsEvents } from "./exam-plan";

describe("plan de estudio hasta el examen", () => {
  it("capacidad: tope menos media clase y recorte por entreno", () => {
    expect(dayCapacity({ dailyMin: 180, classMin: 120, training: true, trainingCutMin: 60 })).toBe(60);
    expect(dayCapacity({ dailyMin: 60, classMin: 300, training: true, trainingCutMin: 60 })).toBe(0);
  });

  it("reparte por urgencia, la víspera solo esa asignatura y avisa de lo que no cabe", () => {
    const r = planStudy({
      today: "2026-10-01",
      capacity: () => 60,
      exams: [
        { id: "a", subject: "Anatomía", date: "2026-10-04", minutes: 120 },
        { id: "b", subject: "Biomecánica", date: "2026-10-10", minutes: 600 },
      ],
    });
    const eve = r.blocks.filter((b) => b.date === "2026-10-03");
    expect(eve.every((b) => b.examId === "a")).toBe(true);
    expect(r.blocks.filter((b) => b.examId === "a").reduce((x, b) => x + b.minutes, 0)).toBe(120);
    expect(r.blocks.every((b) => b.date < "2026-10-10")).toBe(true);
    // 9 días × 60 = 540 < 720 pedidos: faltan 180 de Biomecánica
    expect(r.shortfall).toEqual([{ examId: "b", subject: "Biomecánica", minutes: 180 }]);
  });

  it("ignora exámenes pasados o de hoy", () => {
    expect(planStudy({ today: "2026-10-05", capacity: () => 60, exams: [{ id: "x", subject: "X", date: "2026-10-05", minutes: 60 }] })).toEqual({ blocks: [], shortfall: [] });
  });

  it("el pomodoro tacha bloques en orden con los minutos estudiados", () => {
    const blocks = [
      { id: "1", minutes: 30, done: true },
      { id: "2", minutes: 30, done: false },
      { id: "3", minutes: 60, done: false },
    ];
    expect(blocksToTick(blocks, 50)).toEqual([]);
    expect(blocksToTick(blocks, 60)).toEqual(["2"]);
    expect(blocksToTick(blocks, 120)).toEqual(["2", "3"]);
  });
});

describe("notas", () => {
  it("media ponderada por créditos y créditos aprobados", () => {
    expect(gradeAverage([{ grade: 8, credits: 6 }, { grade: 4, credits: 3 }, { grade: null, credits: 6 }])).toEqual({ average: 6.67, gradedCredits: 9, passedCredits: 6, pendingCredits: 6 });
    expect(gradeAverage([]).average).toBeNull();
  });
});

describe("clases en el .ics", () => {
  it("hora de Madrid a UTC con horario de verano e invierno", () => {
    expect(madridToUtc("2026-07-01", 9 * 60).toISOString()).toBe("2026-07-01T07:00:00.000Z");
    expect(madridToUtc("2026-12-01", 9 * 60).toISOString()).toBe("2026-12-01T08:00:00.000Z");
  });

  it("expande las clases semanales y los exámenes, solo con la asignatura", () => {
    const base = { validFrom: null, validTo: null, location: "Aula 3" };
    const ev = studyIcsEvents(
      [
        { id: "c", subject: "Anatomía", kind: "CLASS", weekday: 0, date: null, startMin: 600, endMin: 720, ...base },
        { id: "e", subject: "Física", kind: "EXAM", weekday: null, date: "2026-10-14", startMin: 540, endMin: 660, ...base },
      ],
      "2026-10-05",
      13,
    );
    expect(ev.map((e) => e.title)).toEqual(["Clase: Anatomía", "Clase: Anatomía", "Examen: Física"]);
    expect(JSON.stringify(ev)).not.toContain("Aula");
  });
});
