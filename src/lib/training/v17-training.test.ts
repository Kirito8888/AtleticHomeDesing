import { describe, expect, it } from "vitest";

import { ageCategory, attemptSchedule, combinedWarmups, compareSessions, newCompetitions, parseCompetitionCsv, parseIcsEvents, seasonRecords, throwsByImplementWeek } from "./v17-training";

describe("entreno v1.7", () => {
  it("lanzamientos por implemento y semana ISO", () => {
    const r = throwsByImplementWeek([
      { date: "2026-10-05", implementWeightG: 800, throws: 20 },
      { date: "2026-10-07", implementWeightG: 600, throws: 15 },
      { date: "2026-10-09", implementWeightG: 800, throws: 10 },
      { date: "2026-10-12", implementWeightG: 700, throws: 12 },
    ]);
    expect(r.implements).toEqual(["800 g", "700 g", "600 g"]);
    expect(r.weeks[1]).toEqual({ week: "2026-10-05", byImplement: { "800 g": 30, "600 g": 15 }, total: 45 });
  });

  it("categoría RFEA por la edad que se cumple en el año y récords por temporada", () => {
    expect(ageCategory("2004-05-10", 2026)).toBe("Sub-23");
    expect(ageCategory("2009-12-31", 2026)).toBe("Sub-18");
    expect(ageCategory("1985-01-01", 2026)).toBe("Máster M40");
    const r = seasonRecords(
      [
        { date: "2025-06-01", event: "JAVELIN", implementWeightG: 800, markM: 55, isCompetition: true },
        { date: "2025-07-01", event: "JAVELIN", implementWeightG: 800, markM: 57.2, isCompetition: false },
        { date: "2026-05-01", event: "JAVELIN", implementWeightG: 800, markM: 56, isCompetition: true },
      ],
      "2004-05-10",
    );
    expect(r.map((x) => [x.season, x.markM, x.category])).toEqual([
      [2026, 56, "Sub-23"],
      [2025, 57.2, "Sub-23"],
    ]);
  });

  it("simulador: 12 atletas, puesto 5, 60 s por intento; mejora con 8", () => {
    const s = attemptSchedule({ athletes: 12, position: 5, secondsPerAttempt: 60 });
    expect(s.attempts.map((a) => a.atMin)).toEqual([4, 16, 28, 39, 47, 55]);
    expect(s.attempts[1].restMin).toBe(12);
    expect(s.totalMin).toBe(60);
  });

  it("combinadas: calentamiento hacia atrás y aviso de hueco corto", () => {
    const w = combinedWarmups(
      [
        { name: "Jabalina", startMin: 11 * 60, durationMin: 60 },
        { name: "100 m vallas", startMin: 9 * 60, durationMin: 20 },
        { name: "Altura", startMin: 9 * 60 + 40, durationMin: 80 },
      ],
      30,
    );
    expect(w.map((x) => x.name)).toEqual(["100 m vallas", "Altura", "Jabalina"]);
    expect(w[1].gapMin).toBe(20);
    expect(w[1].advice).toMatch(/corto \(15 min\)/);
    expect(w[2].gapMin).toBe(0);
    expect(w[2].advice).toMatch(/activación breve/);
  });

  it("comparador de dos sesiones", () => {
    const base = { date: "2026-10-01", title: null, type: "TECHNICAL", durationSec: 3600, sessionRpe: 6, tss: 60, bestMarkM: 52, validThrows: 10, strengthVolumeKg: 0 };
    const rows = compareSessions(base, { ...base, bestMarkM: 54.5, sessionRpe: 7 });
    expect(rows.find((r) => r.label === "Mejor marca")).toMatchObject({ diff: 2.5, better: "b" });
    expect(rows.find((r) => r.label === "RPE de la sesión")).toMatchObject({ better: "a" });
  });

  it("importa .ics (plegado y escapes) y CSV, y quita duplicados", () => {
    const ics = "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20261108\r\nSUMMARY:Control de lanzamientos\\, Burgos\r\nLOCATION:Pista \r\n de San Amaro\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nDTSTART:20261212T100000Z\r\nSUMMARY:Autonómico\r\nEND:VEVENT\r\nEND:VCALENDAR";
    expect(parseIcsEvents(ics)).toEqual([
      { title: "Control de lanzamientos, Burgos", date: "2026-11-08", location: "Pista de San Amaro" },
      { title: "Autonómico", date: "2026-12-12", location: null },
    ]);
    const csv = "fecha;competición;lugar\n15/11/2026;Liga de clubes;León\n2026-11-08;Control de lanzamientos, Burgos;";
    const found = parseCompetitionCsv(csv);
    expect(found).toHaveLength(2);
    expect(newCompetitions([...found, ...parseIcsEvents(ics)], [{ title: "autonómico", date: "2026-12-12" }], "2026-10-10").map((e) => e.title)).toEqual(["Liga de clubes", "Control de lanzamientos, Burgos"]);
  });
});
