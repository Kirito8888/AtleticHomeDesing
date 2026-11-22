import { describe, expect, it } from "vitest";

import { mapModality, normalizeWorkout } from "./normalize";
import { payloadSchema, workoutSchema } from "./payload";

const base = { start: "2026-11-21T08:30:00+01:00", end: "2026-11-21T09:15:00+01:00" };

describe("mapModality", () => {
  it.each([
    ["Correr", "RUN"], ["Running", "RUN"], ["Carrera al aire libre", "RUN"], ["Caminar", "WALK"], ["Outdoor Walk", "WALK"], ["Senderismo", "WALK"],
    ["Ciclismo", "CYCLE"], ["Cycling", "CYCLE"], ["Natación en piscina", "SWIM"], ["Swimming", "SWIM"], ["Remo", "ROW"], ["Rowing", "ROW"],
    ["Entrenamiento de fuerza", "OTHER"], ["HIIT", "OTHER"], ["Yoga", "OTHER"],
  ])("%s → %s", (type, m) => expect(mapModality(type)).toBe(m));
});

describe("normalizeWorkout", () => {
  it("calcula duración desde start/end, día de Madrid y clave estable", () => {
    const n = normalizeWorkout(workoutSchema.parse({ type: "Correr", ...base, distanceKm: 7.2, hrAvg: 148.4, kcal: 480.6 }));
    expect(n).toMatchObject({ date: "2026-11-21", modality: "RUN", durationSec: 2700, distanceM: 7200, hrAvg: 148, kcal: 481 });
    expect(n.dedupeKey).toBe("2026-11-21|2026-11-21T07:30|RUN");
  });
  it("«Correr» y «Running» dan la misma clave (idempotencia entre idiomas)", () => {
    const a = normalizeWorkout(workoutSchema.parse({ type: "Correr", ...base }));
    const b = normalizeWorkout(workoutSchema.parse({ type: "Running", ...base, name: "Carrera" }));
    expect(a.dedupeKey).toBe(b.dedupeKey);
  });
  it("un entreno a las 00:30 de Madrid cuenta en el día de Madrid, no en el UTC", () => {
    const n = normalizeWorkout(workoutSchema.parse({ type: "Correr", start: "2026-11-21T00:30:00+01:00", durationMin: 30 }));
    expect(n.date).toBe("2026-11-21");
    expect(n.dedupeKey.startsWith("2026-11-21|2026-11-20T23:30")).toBe(true);
  });
  it("durationMin/durationSec y distanceM", () => {
    expect(normalizeWorkout(workoutSchema.parse({ type: "x", start: base.start, durationMin: 12.5, distanceM: 3000 }))).toMatchObject({ durationSec: 750, distanceM: 3000 });
    expect(normalizeWorkout(workoutSchema.parse({ type: "x", start: base.start, durationSec: 600 })).durationSec).toBe(600);
  });
  it("distancia 0 → sin distancia", () => {
    expect(normalizeWorkout(workoutSchema.parse({ type: "x", start: base.start, durationMin: 10, distanceKm: 0 })).distanceM).toBeNull();
  });
});

describe("payloadSchema", () => {
  it("acepta un entreno suelto o una lista, y números como texto con coma (Atajos)", () => {
    expect(payloadSchema.parse({ type: "Correr", ...base })).toHaveLength(1);
    expect(payloadSchema.parse({ workouts: [{ type: "Correr", ...base }, { type: "Remo", ...base }] })).toHaveLength(2);
    const [w] = payloadSchema.parse({ type: "Correr", ...base, distanceKm: "7,2", hrAvg: "148" });
    expect(w.distanceKm).toBe(7.2);
    expect(w.hrAvg).toBe(148);
  });
  it.each([
    ["sin duración", { type: "Correr", start: base.start }],
    ["FC absurda", { type: "Correr", ...base, hrAvg: 400 }],
    ["hrMax < hrAvg", { type: "Correr", ...base, hrAvg: 150, hrMax: 140 }],
    ["fin antes del inicio", { type: "Correr", start: base.end, end: base.start }],
    ["fecha sin zona", { type: "Correr", start: "2026-11-21 08:30", durationMin: 5 }],
    ["futuro lejano", { type: "Correr", start: "2099-01-01T08:00:00Z", durationMin: 5 }],
    ["kcal enorme", { type: "Correr", ...base, kcal: 99999 }],
    ["lista vacía", { workouts: [] }],
    ["más de 50", { workouts: Array.from({ length: 51 }, () => ({ type: "Correr", ...base })) }],
    ["tipo vacío", { type: "", ...base }],
  ])("rechaza: %s", (_n, body) => expect(payloadSchema.safeParse(body).success).toBe(false));
});
