import { describe, expect, it } from "vitest";

import { agendaForDay, tasksDuePerDay } from "./agenda";

const d = (s: string) => new Date(s);

describe("agenda del día", () => {
  const input = {
    sessions: [
      { id: "s1", date: d("2026-10-06T00:00:00Z"), title: "Fuerza", type: "STRENGTH", status: "COMPLETED", tss: 80 },
      { id: "s2", date: d("2026-10-07T00:00:00Z"), title: null, type: "TRACK", status: "PLANNED", tss: null },
    ],
    events: [
      // Competición de varios días (todo el día)
      { id: "e1", type: "COMPETITION", title: "Campeonato", startAt: d("2026-10-05T00:00:00Z"), endAt: d("2026-10-06T00:00:00Z"), allDay: true },
      // Examen a las 00:30 hora de Madrid del día 7 = 22:30 UTC del día 6
      { id: "e2", type: "EXAM", title: "Examen", startAt: d("2026-10-06T22:30:00Z"), endAt: null, allDay: false },
    ],
    tasks: [
      { id: "t1", title: "Licencia", dueDate: d("2026-10-06T00:00:00Z"), status: "TODO", priority: "HIGH" },
      { id: "t2", title: "Hecha", dueDate: d("2026-10-06T00:00:00Z"), status: "DONE", priority: "LOW" },
      { id: "t3", title: "Sin fecha", dueDate: null, status: "TODO", priority: "LOW" },
    ],
    cycles: [{ id: "c1", name: "Meso 1", level: "MESO", startDate: d("2026-10-01T00:00:00Z"), endDate: d("2026-10-31T00:00:00Z") }],
  };

  it("reúne lo del día 6", () => {
    const a = agendaForDay("2026-10-06", input);
    expect(a.sessions.map((s) => s.id)).toEqual(["s1"]);
    expect(a.events.map((e) => e.id)).toEqual(["e1"]);
    expect(a.tasks.map((t) => t.id)).toEqual(["t1"]);
    expect(a.cycles.map((c) => c.id)).toEqual(["c1"]);
  });

  it("un evento con hora cae en su día de Madrid, no en el de UTC", () => {
    expect(agendaForDay("2026-10-07", input).events.map((e) => e.id)).toEqual(["e2"]);
  });

  it("cuenta tareas pendientes por día", () => {
    expect([...tasksDuePerDay(input.tasks)]).toEqual([["2026-10-06", 1]]);
  });
});
