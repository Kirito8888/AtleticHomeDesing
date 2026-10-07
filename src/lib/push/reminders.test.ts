import { describe, expect, it } from "vitest";

import { readPrefs } from "@/lib/rules/prefs";

import { dueReminders, publicTitle } from "./reminders";

const p = readPrefs({ remindTomorrowHour: 20, remindMondayCheck: true, remindWeigh: true });
const none = { plannedTomorrow: 0, checkedToday: false, weighedToday: false };

describe("recordatorios push", () => {
  it("mañana toca: a partir de la hora elegida y solo si hay sesión", () => {
    expect(dueReminders(p, { hour: 19, weekday: 3 }, { ...none, plannedTomorrow: 1 })).toEqual([]);
    expect(dueReminders(p, { hour: 20, weekday: 3 }, { ...none, plannedTomorrow: 1 })).toEqual(["tomorrow"]);
    expect(dueReminders(readPrefs({ remindTomorrowHour: null }), { hour: 22, weekday: 3 }, { ...none, plannedTomorrow: 1 })).toEqual([]);
  });

  it("control del lunes y pesarse L-X-V por la mañana, si no está hecho", () => {
    expect(dueReminders(p, { hour: 9, weekday: 0 }, none)).toEqual(["monday-check", "weigh"]);
    expect(dueReminders(p, { hour: 9, weekday: 0 }, { ...none, checkedToday: true, weighedToday: true })).toEqual([]);
    expect(dueReminders(p, { hour: 9, weekday: 1 }, none)).toEqual([]);
    expect(dueReminders(p, { hour: 13, weekday: 2 }, none)).toEqual([]);
  });

  it("título sin «versión suave»", () => {
    expect(publicTitle("Fuerza A (versión suave)")).toBe("Fuerza A");
  });
});
