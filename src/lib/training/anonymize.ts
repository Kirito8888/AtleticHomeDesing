// v1.10 · Anonimizar una actividad real (FIT, GPX o TCX) para usarla en los tests sin datos personales:
// fechas desplazadas a enero de 2020 (se conserva la hora del día), sin GPS (o con la forma trasladada
// lejos), sin dispositivo ni número de serie. La salida es un TCX que la app vuelve a leer igual.
import { parseActivity, type ParsedActivity } from "@/lib/training/activity-import";

const BASE = Date.UTC(2020, 0, 6); // lunes 6 de enero de 2020

const SPORT: Record<ParsedActivity["modality"], string> = { RUN: "Running", SPRINT: "Running", HURDLES: "Running", WALK: "Running", CYCLE: "Biking", SWIM: "Other", ROW: "Other", OTHER: "Other" };
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

/** `keepShape`: conserva la forma del recorrido trasladándola a un punto neutro (océano Atlántico). */
export function anonymizeActivity(buf: Buffer, opts: { keepShape?: boolean } = {}): { tcx: string; parsed: ParsedActivity } {
  const a = parseActivity(buf);
  const start = a.startedAt.getTime();
  const dayMs = start - Date.UTC(a.startedAt.getUTCFullYear(), a.startedAt.getUTCMonth(), a.startedAt.getUTCDate());
  const shift = BASE + dayMs - start;
  const at = (d: Date) => new Date(d.getTime() + shift).toISOString();
  const first = a.samples.find((s) => s.lat != null && s.lon != null);
  const move = (lat: number, lon: number) => [Math.round((lat - first!.lat! + 30) * 1e7) / 1e7, Math.round((lon - first!.lon! - 40) * 1e7) / 1e7];
  const points = a.samples
    .map((s) => {
      const parts = [`<Time>${at(s.time)}</Time>`];
      if (opts.keepShape && first && s.lat != null && s.lon != null) {
        const [lat, lon] = move(s.lat, s.lon);
        parts.push(`<Position><LatitudeDegrees>${lat}</LatitudeDegrees><LongitudeDegrees>${lon}</LongitudeDegrees></Position>`);
      }
      if (s.altitude != null) parts.push(`<AltitudeMeters>${Math.round(s.altitude * 10) / 10}</AltitudeMeters>`);
      if (s.distance != null) parts.push(`<DistanceMeters>${Math.round(s.distance * 10) / 10}</DistanceMeters>`);
      if (s.hr != null) parts.push(`<HeartRateBpm><Value>${Math.round(s.hr)}</Value></HeartRateBpm>`);
      if (s.cadence != null) parts.push(`<Cadence>${Math.round(s.cadence)}</Cadence>`);
      return `<Trackpoint>${parts.join("")}</Trackpoint>`;
    })
    .join("\n");
  const lap = [
    `<TotalTimeSeconds>${a.elapsedSec}</TotalTimeSeconds>`,
    a.distanceM != null ? `<DistanceMeters>${a.distanceM}</DistanceMeters>` : "",
    a.hrAvg != null ? `<AverageHeartRateBpm><Value>${Math.round(a.hrAvg)}</Value></AverageHeartRateBpm>` : "",
    a.hrMax != null ? `<MaximumHeartRateBpm><Value>${Math.round(a.hrMax)}</Value></MaximumHeartRateBpm>` : "",
    "<Intensity>Active</Intensity><TriggerMethod>Manual</TriggerMethod>",
  ].join("");
  const tcx = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Actividad anonimizada para tests (Atlenza): fechas desplazadas a 2020, sin GPS real ni dispositivo. -->
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">
<Activities><Activity Sport="${esc(SPORT[a.modality])}">
<Id>${at(a.startedAt)}</Id>
<Lap StartTime="${at(a.startedAt)}">${lap}<Track>
${points}
</Track></Lap>
</Activity></Activities>
</TrainingCenterDatabase>
`;
  return { tcx, parsed: a };
}
