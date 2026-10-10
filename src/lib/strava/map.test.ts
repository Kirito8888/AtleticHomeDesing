import { describe, expect, it } from "vitest";

import { stravaToParsed } from "./map";

describe("Strava → actividad", () => {
  it("resumen, modalidad, superficie, cadencia por pierna y muestras de los streams", () => {
    const a = stravaToParsed(
      { id: 1, name: "Rodaje", sport_type: "TrailRun", start_date: "2026-10-05T07:30:00Z", elapsed_time: 3700, moving_time: 3600, distance: 10012.4, total_elevation_gain: 210.6, average_heartrate: 148.4, max_heartrate: 171, average_cadence: 86 },
      { time: { data: [0, 1, 2] }, heartrate: { data: [120, 121, 122] }, distance: { data: [0, 3, 6] }, latlng: { data: [[40.4, -3.7], [40.4001, -3.7], [40.4002, -3.7]] } },
    );
    expect(a).toMatchObject({ format: "Strava", modality: "RUN", surface: "TRAIL", date: "2026-10-05", elapsedSec: 3700, movingSec: 3600, distanceM: 10012.4, hrAvg: 148, hrMax: 171, elevationGainM: 211, avgCadence: 172 });
    expect(a.samples).toHaveLength(3);
    expect(a.samples[2]).toMatchObject({ hr: 122, distance: 6, lat: 40.4002, lon: -3.7 });
    expect(a.samples[2].time.toISOString()).toBe("2026-10-05T07:30:02.000Z");
  });

  it("cinta, bici y deportes desconocidos", () => {
    expect(stravaToParsed({ id: 2, sport_type: "Run", trainer: true, start_date: "2026-10-05T18:00:00Z", elapsed_time: 1800 })).toMatchObject({ surface: "TREADMILL", movingSec: 1800, distanceM: null, samples: [] });
    expect(stravaToParsed({ id: 3, type: "Ride", start_date: "2026-10-05T18:00:00Z", elapsed_time: 60, average_cadence: 85 })).toMatchObject({ modality: "CYCLE", avgCadence: 85 });
    expect(stravaToParsed({ id: 4, sport_type: "Yoga", start_date: "2026-10-05T18:00:00Z", elapsed_time: 60 }).modality).toBe("OTHER");
  });
});
