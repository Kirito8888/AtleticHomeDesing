import "server-only";

import { ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { hrZoneSeconds, ImportError, parseActivity, type ParsedActivity } from "@/lib/training/activity-import";
import { createSessionSchema } from "@/lib/training/schemas";
import { createTrainingSession, thresholdsAt } from "@/lib/training/service";

const MODALITY_LABEL: Record<ParsedActivity["modality"], string> = {
  RUN: "Carrera",
  SPRINT: "Velocidad",
  HURDLES: "Vallas",
  SWIM: "Natación",
  CYCLE: "Bici",
  ROW: "Remo",
  WALK: "Caminata",
  OTHER: "Actividad",
};

/** Resumen + cuerpo de sesión listo para POST /api/training/sessions (sin guardar). */
export async function previewActivity(userId: string, buf: Buffer) {
  let a: ParsedActivity;
  try {
    a = parseActivity(buf);
  } catch (err) {
    if (err instanceof ImportError) throw new ApiError(422, err.message);
    throw new ApiError(422, "No se pudo leer el fichero de actividad");
  }
  return previewParsed(userId, a);
}

/** v1.10 · Igual, a partir de una actividad ya leída (FIT/GPX/TCX o la API de Strava). */
export async function previewParsed(userId: string, a: ParsedActivity) {
  const thresholds = await thresholdsAt(userId, new Date(`${a.date}T00:00:00Z`));
  const zoneMax = thresholds?.hrMax ?? a.hrMax;
  const km = a.distanceM ? ` ${(a.distanceM / 1000).toFixed(1).replace(".", ",")} km` : "";
  const payload = createSessionSchema.parse({
    date: a.date,
    startedAt: a.startedAt.toISOString(),
    type: "TRACK",
    status: "COMPLETED",
    title: `${MODALITY_LABEL[a.modality]}${km}`,
    durationSec: a.elapsedSec,
    notes: `Importado de ${a.format}${a.device ? ` (${a.device})` : ""}`.slice(0, 2000),
    track: {
      modality: a.modality,
      surface: a.surface,
      distanceM: a.distanceM,
      movingTimeSec: a.movingSec,
      hrAvg: a.hrAvg,
      hrMax: a.hrMax,
      elevationGainM: a.elevationGainM,
      avgCadence: a.avgCadence,
      hrZoneSeconds: zoneMax ? hrZoneSeconds(a.samples, zoneMax) : [],
    },
  });
  // Misma hora de inicio = la misma actividad ya importada.
  const duplicate = await prisma.trainingSession.findFirst({ where: { userId, startedAt: a.startedAt }, select: { id: true } });
  const { samples: _samples, ...summary } = a;
  void _samples;
  return { summary, payload, duplicateOf: duplicate?.id ?? null };
}

export async function importActivity(userId: string, buf: Buffer) {
  const { payload, duplicateOf } = await previewActivity(userId, buf);
  if (duplicateOf) throw new ApiError(409, "Esta actividad ya está importada", { sessionId: duplicateOf });
  return createTrainingSession(userId, null, payload);
}
