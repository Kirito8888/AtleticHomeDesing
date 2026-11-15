import { describe, expect, it } from "vitest";

import { mealForHour, todayActions, type TodayInput } from "./actions";

const base: TodayInput = {
  sessions: [],
  dueCards: 0,
  mealsLogged: [],
  hour: 9,
  weekday: 3,
  reviewed: false,
  light: { level: "green", label: "ok", reasons: [] },
  hidden: [],
};

describe("todayActions", () => {
  it("entre semana: sesión planificada manda sobre toma y repasos", () => {
    const r = todayActions({ ...base, sessions: [{ id: "s1", title: "Fuerza", status: "PLANNED", durationSec: 3600 }], dueCards: 4 });
    expect(r.main).toMatchObject({ id: "session", href: "/training/s1" });
    expect(r.rest.map((a) => a.id)).toEqual(["meal", "cards"]);
  });
  it("fin de semana sin revisar: aparece la revisión; entre semana no", () => {
    expect(todayActions({ ...base, weekday: 6 }).rest.concat(todayActions({ ...base, weekday: 6 }).main ?? []).map((a) => a.id)).toContain("review");
    const wk = todayActions({ ...base, weekday: 2 });
    expect([wk.main, ...wk.rest].map((a) => a?.id)).not.toContain("review");
  });
  it("semáforo ámbar o rojo va primero; con recuperación oculta no se muestra ni sus motivos", () => {
    const light = { level: "red" as const, label: "descanso", reasons: ["dolor 7/10"] };
    expect(todayActions({ ...base, light }).main?.id).toBe("recovery");
    const hidden = todayActions({ ...base, light, hidden: ["recovery"] });
    expect(JSON.stringify(hidden)).not.toMatch(/dolor|descanso/);
  });
  it("módulos ocultos y toma ya registrada no generan acción", () => {
    const r = todayActions({ ...base, dueCards: 3, mealsLogged: ["BREAKFAST"], hidden: ["study"] });
    expect(r.main).toBeNull();
  });
  it("toma según la hora", () => {
    expect([8, 12, 14, 18, 21].map(mealForHour)).toEqual(["BREAKFAST", "MID_MORNING", "LUNCH", "SNACK", "DINNER"]);
  });
});
