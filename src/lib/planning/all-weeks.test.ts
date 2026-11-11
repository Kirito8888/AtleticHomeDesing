import { describe, expect, it } from "vitest";

import { applyChange, planAllWeeks, rowChange } from "./all-weeks";
import type { PlanRow } from "./plan-import/types";

const row = (sets: string, extra: Partial<PlanRow> = {}): PlanRow => ({ exercise: "Sentadilla", sets, load: "", rir: "RIR 2", rest: "2 min", how: "", ramp: false, ...extra });
const basis = { why: "Se orienta a 10-20 series; se empieza con 3 series por ejercicio (x). Se ha dejado el mínimo de series para que quepa en el tiempo que indicaste. Más.", refs: ["acsm2009"] };
const day = (id: string, date: string, week: number, r: PlanRow[]) => ({ id, week, date: new Date(`${date}T00:00:00Z`), content: [{ kind: "table", rows: r }] });

describe("N7 todas las semanas", () => {
  it("rowChange: series como diferencia, resto como valor", () => {
    expect(rowChange(row("3 × 8"), row("4 × 8"))).toEqual({ setsDelta: 1 });
    expect(rowChange(row("3 × 8"), { ...row("3 × 6"), rest: "3 min" })).toEqual({ reps: "6", rest: "3 min" });
    expect(rowChange(row("3 × 8"), row("3 × 8"))).toBeNull();
  });
  it("applyChange conserva la progresión, mínimo 1 y reescribe el porqué sin tocar las citas", () => {
    const r = applyChange(row("4 × 8", { basis }), { setsDelta: -1 });
    expect(r.sets).toBe("3 × 8");
    expect(r.basis?.why).toContain("se empieza con 3 series");
    expect(r.basis?.refs).toEqual(["acsm2009"]);
    expect(applyChange(row("1 × 8"), { setsDelta: -2 }).sets).toBe("1 × 8");
    expect(applyChange(row("2 × 8", { basis }), { setsDelta: 1, reps: "10" }).sets).toBe("3 × 10");
  });
  it("sin basis sigue sin basis", () => expect(applyChange(row("3 × 8"), { setsDelta: 1 }).basis).toBeUndefined());
  it("solo mismo día de la semana, otras semanas y mismo ejercicio", () => {
    const src = day("a", "2027-01-04", 1, []);
    const days = [src, day("b", "2027-01-11", 2, [row("4 × 8"), row("3 × 8", { exercise: "Remo" })]), day("c", "2027-01-12", 2, [row("4 × 8")]), day("d", "2027-01-18", 3, [row("2 × 8")])];
    const p = planAllWeeks(src, days, [{ exercise: "Sentadilla", change: { setsDelta: 1 } }]);
    expect(p.items.map((i) => [i.dayId, i.after.split(" ·")[0]])).toEqual([["b", "5 × 8"], ["d", "3 × 8"]]);
    expect(p.fingerprint).not.toBe(planAllWeeks(src, [src], []).fingerprint);
  });
  it("salta días con sesión hecha", () => {
    const src = day("a", "2027-01-04", 1, []);
    const d = { ...day("b", "2027-01-11", 2, [row("4 × 8")]), sessionId: "s1" };
    expect(planAllWeeks(src, [src, d], [{ exercise: "Sentadilla", change: { setsDelta: 1 } }], new Set(["s1"])).items).toEqual([]);
  });
});
