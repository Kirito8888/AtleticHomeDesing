// Ficheros FIT sintéticos para los tests, con el codificador del paquete fit-file-parser (MIT).
// Números de mensaje y campo del perfil FIT público; los valores se escalan aquí.
import { FitBaseType as T, FitEncoder } from "fit-file-parser";

export const MANUFACTURER = { garmin: 1, polarElectro: 123, coros: 294 };
const SPORT = { running: 1, cycling: 2 };
const SUB_SPORT = { generic: 0, treadmill: 1, trail: 3, track: 4 };

const ts = (d) => FitEncoder.toFitTimestamp(d);
const f = (number, size, baseType, value) => ({ number, size, baseType, value: Math.round(value) });

/**
 * @param {{ fileId: { manufacturer: keyof typeof MANUFACTURER, product?: number, timeCreated: Date },
 *   records: Array<{ timestamp: Date, distance?: number, speed?: number, enhancedSpeed?: number, heartRate?: number,
 *     cadence?: number, positionLat?: number, positionLong?: number, altitude?: number }>,
 *   session?: { timestamp: Date, startTime: Date, sport?: keyof typeof SPORT, subSport?: keyof typeof SUB_SPORT,
 *     totalElapsedTime?: number, totalTimerTime?: number, totalDistance?: number, avgHeartRate?: number,
 *     maxHeartRate?: number, avgCadence?: number } }} a
 * @returns {Buffer}
 */
export function buildFit(a) {
  const e = new FitEncoder();
  e.writeMessage(0, [
    f(0, 1, T.Enum, 4), // type: activity
    f(1, 2, T.Uint16, MANUFACTURER[a.fileId.manufacturer]),
    f(2, 2, T.Uint16, a.fileId.product ?? 1),
    f(4, 4, T.Uint32, ts(a.fileId.timeCreated)),
  ]);
  for (const r of a.records) {
    const fields = [f(253, 4, T.Uint32, ts(r.timestamp))];
    if (r.positionLat != null) fields.push(f(0, 4, T.Sint32, r.positionLat));
    if (r.positionLong != null) fields.push(f(1, 4, T.Sint32, r.positionLong));
    if (r.altitude != null) fields.push(f(2, 2, T.Uint16, (r.altitude + 500) * 5));
    if (r.heartRate != null) fields.push(f(3, 1, T.Uint8, r.heartRate));
    if (r.cadence != null) fields.push(f(4, 1, T.Uint8, r.cadence));
    if (r.distance != null) fields.push(f(5, 4, T.Uint32, r.distance * 100));
    if (r.speed != null) fields.push(f(6, 2, T.Uint16, r.speed * 1000));
    if (r.enhancedSpeed != null) fields.push(f(73, 4, T.Uint32, r.enhancedSpeed * 1000));
    // Mensajes con campos distintos: tipo local según la combinación (el codificador redefine si cambia)
    e.writeMessage(20, fields, 1);
  }
  const s = a.session;
  if (s) {
    const fields = [f(253, 4, T.Uint32, ts(s.timestamp)), f(2, 4, T.Uint32, ts(s.startTime))];
    if (s.sport) fields.push(f(5, 1, T.Enum, SPORT[s.sport]));
    if (s.subSport) fields.push(f(6, 1, T.Enum, SUB_SPORT[s.subSport]));
    if (s.totalElapsedTime != null) fields.push(f(7, 4, T.Uint32, s.totalElapsedTime * 1000));
    if (s.totalTimerTime != null) fields.push(f(8, 4, T.Uint32, s.totalTimerTime * 1000));
    if (s.totalDistance != null) fields.push(f(9, 4, T.Uint32, s.totalDistance * 100));
    if (s.avgHeartRate != null) fields.push(f(16, 1, T.Uint8, s.avgHeartRate));
    if (s.maxHeartRate != null) fields.push(f(17, 1, T.Uint8, s.maxHeartRate));
    if (s.avgCadence != null) fields.push(f(18, 1, T.Uint8, s.avgCadence));
    e.writeMessage(18, fields, 2);
  }
  return Buffer.from(e.close());
}
