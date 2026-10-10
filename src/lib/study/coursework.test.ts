import { describe, expect, it } from "vitest";

import { assignmentAlert, focusBySlot, parseCardLines, subjectAverages } from "./coursework";

describe("estudio v1.7", () => {
  it("tarjetas pegadas como «pregunta | respuesta» o con tabulador", () => {
    expect(parseCardLines("¿Capital de Francia? | París\nmal\nH2O\tAgua\n | vacía")).toEqual([
      { front: "¿Capital de Francia?", back: "París" },
      { front: "H2O", back: "Agua" },
    ]);
  });

  it("avisos de entregas", () => {
    expect(assignmentAlert({ dueOn: "2026-10-08", status: "DOING" }, "2026-10-10")).toMatchObject({ level: "red", days: -2 });
    expect(assignmentAlert({ dueOn: "2026-10-12", status: "TODO" }, "2026-10-10")).toMatchObject({ level: "red", text: "En 2 d y sin empezar" });
    expect(assignmentAlert({ dueOn: "2026-10-12", status: "DOING" }, "2026-10-10").level).toBe("amber");
    expect(assignmentAlert({ dueOn: "2026-10-30", status: "TODO" }, "2026-10-10").level).toBe("ok");
    expect(assignmentAlert({ dueOn: "2026-10-01", status: "DONE" }, "2026-10-10").level).toBe("ok");
  });

  it("media ponderada por asignatura", () => {
    const a = subjectAverages([
      { subject: "Física", weightPct: 30, grade: 8 },
      { subject: "Física", weightPct: 20, grade: 5 },
      { subject: "Física", weightPct: 50, grade: null },
      { subject: "Lengua", weightPct: null, grade: 7 },
    ]);
    expect(a).toEqual([
      { subject: "Física", average: 6.8, gradedPct: 50 },
      { subject: "Lengua", average: 7, gradedPct: 0 },
    ]);
  });

  it("concentración por franja (hora de Madrid, inicio = guardado − minutos)", () => {
    // 2026-10-12 es lunes; en octubre Madrid = UTC+2
    const at = (iso: string, minutes: number) => ({ createdAt: new Date(iso), minutes });
    const r = focusBySlot([at("2026-10-12T08:50:00Z", 50), at("2026-10-13T08:30:00Z", 30), at("2026-10-14T08:40:00Z", 40), at("2026-10-12T21:30:00Z", 25), at("2026-10-12T23:10:00Z", 20)]);
    expect(r.slots.find((s) => s.key === "manana")).toMatchObject({ minutes: 120, sessions: 3, avg: 40 });
    expect(r.slots.find((s) => s.key === "noche")).toMatchObject({ minutes: 45, sessions: 2 }); // 23:05 y 00:50
    expect(r.best?.key).toBe("manana");
    expect(r.week[0]).toBe(50 + 25); // lunes (la de las 00:50 ya es martes)
  });
});
