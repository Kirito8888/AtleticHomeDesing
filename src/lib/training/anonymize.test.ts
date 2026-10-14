import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { buildFit } from "../../../e2e/fit-builder.mjs";
import { parseActivity } from "./activity-import";
import { anonymizeActivity } from "./anonymize";

const SEMI = 2 ** 31 / 180; // grados → semicírculos (FIT)
const start = new Date("2026-09-20T07:15:00Z");
const fit = buildFit({
  fileId: { manufacturer: "garmin", product: 3121, timeCreated: start },
  records: Array.from({ length: 60 }, (_, i) => ({
    timestamp: new Date(start.getTime() + i * 10_000),
    distance: i * 30,
    heartRate: 130 + (i % 20),
    cadence: 85,
    altitude: 650 + i * 0.1,
    positionLat: (40.4168 + i * 0.0002) * SEMI,
    positionLong: (-3.7038 + i * 0.0001) * SEMI,
  })),
  session: { timestamp: new Date(start.getTime() + 590_000), startTime: start, sport: "running", totalElapsedTime: 590, totalTimerTime: 590, totalDistance: 1770, avgHeartRate: 139, maxHeartRate: 149 },
});

describe("anonimizar actividades reales para los tests", () => {
  it("fechas a enero de 2020 (misma hora), sin GPS ni dispositivo; el resto se conserva", () => {
    const { tcx } = anonymizeActivity(fit);
    expect(tcx).not.toMatch(/40\.41|-3\.70|Position|3121|Garmin/);
    const a = parseActivity(Buffer.from(tcx));
    const orig = parseActivity(fit);
    expect(a.format).toBe("TCX");
    expect(a.startedAt.toISOString()).toBe("2020-01-06T07:15:00.000Z");
    expect(a.device).toBeNull();
    expect(a.samples.every((s) => s.lat == null && s.lon == null)).toBe(true);
    expect(a.distanceM).toBe(orig.distanceM);
    expect(a.elapsedSec).toBe(orig.elapsedSec);
    expect(Math.abs((a.hrAvg ?? 0) - (orig.hrAvg ?? 0))).toBeLessThanOrEqual(1); // el TCX la calcula de los puntos
    expect(a.samples).toHaveLength(orig.samples.length);
  });

  it("--keep-shape traslada el recorrido a un punto neutro conservando la forma", () => {
    const a = parseActivity(Buffer.from(anonymizeActivity(fit, { keepShape: true }).tcx));
    expect(a.samples[0]).toMatchObject({ lat: 30, lon: -40 });
    expect(a.samples.at(-1)!.lat! - 30).toBeCloseTo(59 * 0.0002, 5);
  });
});

// v1.10 (punto 54) · Ficheros reales anonimizados con scripts/anonymize-activity.mts, si los hay
const REAL = path.resolve(__dirname, "../../../e2e/fixtures/real");
const realFiles = existsSync(REAL) ? readdirSync(REAL).filter((f) => /\.(fit|gpx|tcx)$/i.test(f)) : [];
describe.skipIf(!realFiles.length)("actividades reales anonimizadas", () => {
  it.each(realFiles)("%s se lee con valores razonables y sin fechas ni GPS reales", (f) => {
    const a = parseActivity(readFileSync(path.join(REAL, f)));
    expect(a.startedAt.getUTCFullYear()).toBe(2020);
    expect(a.elapsedSec).toBeGreaterThan(0);
    if (a.distanceM != null) expect(a.distanceM).toBeLessThan(400_000);
    if (a.hrMax != null) expect(a.hrMax).toBeLessThan(230);
    // Sin GPS o trasladado al punto neutro (30, -40)
    expect(a.samples.every((s) => s.lat == null || Math.abs(s.lat - 30) < 2)).toBe(true);
  });
});
