import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";

import { currentPhase, defaultProtocol, type ProtocolPhases, protocolPhasesSchema } from "./return-protocol";

async function ownInjury(userId: string, injuryId: string) {
  const inj = await prisma.injury.findFirst({ where: { id: injuryId, userId }, select: { id: true, area: true, limitsTraining: true } });
  if (!inj) throw new ApiError(404, "Lesión no encontrada");
  return inj;
}

/** Crea la vuelta por fases con la plantilla genérica (lanzamientos si es brazo/hombro/codo o limita el entreno). */
export async function startProtocol(userId: string, injuryId: string) {
  const inj = await ownInjury(userId, injuryId);
  const throwing = inj.limitsTraining || ["SHOULDER", "ELBOW", "WRIST_HAND", "UPPER_BACK", "LOWER_BACK"].includes(inj.area);
  const phases = defaultProtocol(throwing);
  return prisma.returnProtocol.upsert({
    where: { injuryId },
    create: { userId, injuryId, phases: phases as unknown as Prisma.InputJsonValue },
    update: {},
  });
}

/** Guarda las fases (criterios marcados o editados); la fase actual se recalcula. */
export async function saveProtocol(userId: string, injuryId: string, raw: unknown) {
  await ownInjury(userId, injuryId);
  const phases = protocolPhasesSchema.parse(raw);
  return prisma.returnProtocol.update({ where: { injuryId }, data: { phases: phases as unknown as Prisma.InputJsonValue, current: currentPhase(phases) } });
}

export async function deleteProtocol(userId: string, injuryId: string) {
  await ownInjury(userId, injuryId);
  await prisma.returnProtocol.deleteMany({ where: { injuryId } });
}

export function readProtocol(raw: unknown): ProtocolPhases | null {
  const r = protocolPhasesSchema.safeParse(raw);
  return r.success ? r.data : null;
}
