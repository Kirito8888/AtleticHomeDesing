import { Encoder, Profile } from "@garmin/fitsdk";
import { describe, expect, it } from "vitest";

import { haversine, hrZoneSeconds, ImportError, parseActivity } from "./activity-import";

// Ficheros de prueba generados con el codificador oficial de Garmin (FIT SDK)
// imitando lo que escribe cada marca: con o sin resumen de sesión, con distancia
// del dispositivo o solo GPS, speed vs enhancedSpeed.
const START = new Date("2026-10-05T06:30:00Z"); // 08:30 en Madrid
const DEG_PER_M = 1 / 111_195; // metros → grados de latitud
const SC = 2 ** 31 / 180; // grados → semicírculos

/** onMesg con un objeto plano (los tipos del SDK son estrictos por mensaje). */
const put = (e: Encoder, mesgNum: number, mesg: Record<string, unknown>) => e.onMesg(mesgNum, mesg as never);

function fit(build: (e: Encoder) => void): Buffer {
  const e = new Encoder();
  build(e);
  return Buffer.from(e.close());
}

/** Garmin: carrera en pista con resumen de sesión completo. */
const garminTrack = () =>
  fit((e) => {
    put(e, Profile.MesgNum.FILE_ID, { type: "activity", manufacturer: "garmin", product: 4315, timeCreated: START, serialNumber: 1 });
    for (let i = 0; i <= 600; i++) {
      put(e, Profile.MesgNum.RECORD, {
        timestamp: new Date(START.getTime() + i * 1000),
        distance: i * 4,
        enhancedSpeed: 4,
        heartRate: 150 + (i % 10),
        cadence: 88,
      });
    }
    put(e, Profile.MesgNum.SESSION, {
      timestamp: new Date(START.getTime() + 600_000),
      startTime: START,
      sport: "running",
      subSport: "track",
      totalElapsedTime: 600,
      totalTimerTime: 600,
      totalDistance: 2400,
      avgHeartRate: 154,
      maxHeartRate: 159,
      avgRunningCadence: 88,
    });
  });

/** Estilo Coros: solo registros (sin resumen) y una pausa de 2 min en medio. */
const corosNoSession = () =>
  fit((e) => {
    put(e, Profile.MesgNum.FILE_ID, { type: "activity", manufacturer: "coros", product: 1, timeCreated: START, serialNumber: 2 });
    let t = 0;
    let d = 0;
    for (let i = 0; i < 300; i++) {
      // 300 s corriendo a 3 m/s, pausa de 120 s, otros 300 s
      if (i === 150) t += 120;
      put(e, Profile.MesgNum.RECORD, { timestamp: new Date(START.getTime() + t * 1000), distance: d, heartRate: i < 150 ? 140 : 160 });
      t += 2;
      d += 6;
    }
  });

/** Estilo Polar: bici, sin distancia en los registros (solo GPS), speed (no enhanced). */
const polarGpsOnly = () =>
  fit((e) => {
    put(e, Profile.MesgNum.FILE_ID, { type: "activity", manufacturer: "polarElectro", product: 1, timeCreated: START, serialNumber: 3 });
    for (let i = 0; i <= 300; i++) {
      put(e, Profile.MesgNum.RECORD, {
        timestamp: new Date(START.getTime() + i * 1000),
        positionLat: Math.round((40.4 + i * 8 * DEG_PER_M) * SC), // 8 m/s hacia el norte
        positionLong: Math.round(-3.7 * SC),
        speed: 8,
        altitude: 600 + (i < 150 ? i * 0.2 : 30 - (i - 150) * 0.2),
        heartRate: 130,
      });
    }
    put(e, Profile.MesgNum.SESSION, { timestamp: new Date(START.getTime() + 300_000), startTime: START, sport: "cycling", totalTimerTime: 300, totalElapsedTime: 300 });
  });

const gpx = (pts: string) => `<?xml version="1.0" encoding="UTF-8"?>
<gpx creator="StravaGPX" version="1.1" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
 <metadata><time>2026-10-05T06:30:00Z</time></metadata>
 <trk><name>Rodaje</name><type>running</type><trkseg>${pts}</trkseg></trk>
</gpx>`;
const stravaGpx = () =>
  Buffer.from(
    gpx(
      Array.from({ length: 301 }, (_, i) => {
        const lat = (40.4 + i * 3 * DEG_PER_M).toFixed(7);
        const ele = (650 + Math.min(i, 100) * 0.3).toFixed(1); // sube 30 m y se mantiene
        const time = new Date(START.getTime() + i * 1000).toISOString();
        return `<trkpt lat="${lat}" lon="-3.7000000"><ele>${ele}</ele><time>${time}</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>${145 + (i % 2)}</gpxtpx:hr><gpxtpx:cad>86</gpxtpx:cad></gpxtpx:TrackPointExtension></extensions></trkpt>`;
      }).join(""),
    ),
  );

const garminTcx = () =>
  Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2" xmlns:ns3="http://www.garmin.com/xmlschemas/ActivityExtension/v2">
 <Activities><Activity Sport="Running"><Id>2026-10-05T06:30:00.000Z</Id>
  <Lap StartTime="2026-10-05T06:30:00.000Z"><TotalTimeSeconds>420.0</TotalTimeSeconds><DistanceMeters>1500.0</DistanceMeters><Track>
  ${Array.from({ length: 211 }, (_, i) => `<Trackpoint><Time>${new Date(START.getTime() + i * 2000).toISOString()}</Time><DistanceMeters>${(i * 1500) / 210}</DistanceMeters><HeartRateBpm><Value>${150}</Value></HeartRateBpm><Extensions><ns3:TPX><ns3:RunCadence>90</ns3:RunCadence></ns3:TPX></Extensions></Trackpoint>`).join("")}
  </Track></Lap>
  <Creator><Name>Forerunner 265</Name></Creator></Activity></Activities>
</TrainingCenterDatabase>`);

describe("importación de actividades", () => {
  it("FIT de Garmin: usa el resumen de sesión del dispositivo", () => {
    const a = parseActivity(garminTrack());
    expect(a).toMatchObject({
      format: "FIT",
      device: "Garmin",
      modality: "RUN",
      surface: "TRACK",
      date: "2026-10-05",
      movingSec: 600,
      distanceM: 2400,
      hrAvg: 154,
      hrMax: 159,
      avgCadence: 88,
    });
    expect(a.startedAt.toISOString()).toBe(START.toISOString());
  });

  it("FIT sin resumen (Coros): calcula de las muestras y descuenta la pausa", () => {
    const a = parseActivity(corosNoSession());
    expect(a.device).toBe("Coros");
    expect(a.elapsedSec).toBe(598 + 120); // 299 intervalos de 2 s + pausa
    expect(a.movingSec).toBe(596); // sin los 122 s de la pausa
    expect(a.distanceM).toBe(299 * 6);
    expect(a.hrAvg).toBe(150); // mitad del tiempo a 140 y mitad a 160 (ponderado por tiempo)
    expect(a.hrMax).toBe(160);
  });

  it("FIT con solo GPS (Polar): distancia por haversine y desnivel positivo", () => {
    const a = parseActivity(polarGpsOnly());
    expect(a.device).toBe("Polar Electro");
    expect(a.modality).toBe("CYCLE");
    expect(a.distanceM).toBeCloseTo(2400, -1); // 300 s × 8 m/s, ±5 m
    expect(a.elevationGainM).toBeCloseTo(30, 0);
    expect(a.movingSec).toBe(300);
  });

  it("GPX de Strava: FC y cadencia de las extensiones, distancia por GPS", () => {
    const a = parseActivity(stravaGpx());
    expect(a).toMatchObject({ format: "GPX", device: "StravaGPX", modality: "RUN", hrAvg: 146, hrMax: 146, avgCadence: 86, elapsedSec: 300 });
    expect(a.distanceM).toBeCloseTo(900, -1);
    expect(a.elevationGainM).toBeCloseTo(30, 0);
  });

  it("TCX de Garmin Connect: totales de la vuelta y cadencia de la extensión TPX", () => {
    const a = parseActivity(garminTcx());
    expect(a).toMatchObject({ format: "TCX", device: "Forerunner 265", modality: "RUN", movingSec: 420, distanceM: 1500, hrAvg: 150, avgCadence: 90 });
  });

  it("rechaza un FIT dañado (CRC), XML con entidades y formatos desconocidos", () => {
    const bad = garminTrack();
    bad[bad.length - 40] ^= 0xff;
    expect(() => parseActivity(bad)).toThrow(/dañado/);
    expect(() => parseActivity(Buffer.from('<?xml version="1.0"?><!DOCTYPE gpx [<!ENTITY a "aaaa">]><gpx>&a;</gpx>'))).toThrow(ImportError);
    expect(() => parseActivity(Buffer.from("hola"))).toThrow(/no reconocido/);
  });

  it("segundos por zona de FC", () => {
    const s = [0, 1, 2, 3, 4].map((i) => ({ time: new Date(START.getTime() + i * 1000), hr: [100, 125, 145, 165, 185][i] }));
    expect(hrZoneSeconds(s, 200)).toEqual([0, 1, 1, 1, 1]); // 125→Z2(62 %), 145→Z3, 165→Z4, 185→Z5
  });

  it("haversine: 1° de latitud ≈ 111,2 km", () => {
    expect(haversine(40, -3, 41, -3)).toBeCloseTo(111_195, -1);
  });
});
