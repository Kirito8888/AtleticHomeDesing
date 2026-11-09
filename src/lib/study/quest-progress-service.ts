import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireModule } from "@/lib/study/modules-service";
import { sanitizeQuest } from "@/lib/study/quest-progress";
import { freshQuest, type QuestState } from "@/lib/study/quest";

export interface ProgressView {
  /** null = esta usuaria aún no ha guardado progreso de esta asignatura. */
  state: QuestState | null;
  version: number;
}

/** Progreso guardado de la usuaria en una asignatura (nunca el de otra: 404 si la asignatura no es suya). */
export async function getProgress(userId: string, moduleId: string): Promise<ProgressView> {
  await requireModule(userId, moduleId);
  const row = await prisma.questProgress.findUnique({ where: { userId_moduleId: { userId, moduleId } } });
  return row ? { state: sanitizeQuest(row.state), version: row.version } : { state: null, version: 0 };
}

/**
 * Guarda el progreso con control de versión: `baseVersion` es la que el cliente vio por última vez (0 = no había).
 * Si otro dispositivo guardó entretanto, responde 409 con el estado actual para que el cliente lo una con el suyo y reintente.
 *
 * @throws {ApiError} 404 asignatura ajena · 409 `{ state, version }` en `details` por conflicto de versión.
 */
export async function putProgress(userId: string, moduleId: string, input: { state: unknown; baseVersion: number }): Promise<ProgressView> {
  await requireModule(userId, moduleId);
  const state = sanitizeQuest(input.state);
  const conflict = async () => {
    const cur = await getProgress(userId, moduleId);
    return new ApiError(409, "El progreso cambió en otro dispositivo", cur);
  };
  if (input.baseVersion === 0) {
    try {
      await prisma.questProgress.create({ data: { userId, moduleId, state: state as object, version: 1 } });
      return { state, version: 1 };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw await conflict();
      throw e;
    }
  }
  const upd = await prisma.questProgress.updateMany({ where: { userId, moduleId, version: input.baseVersion }, data: { state: state as object, version: { increment: 1 } } });
  if (!upd.count) throw await conflict();
  return { state, version: input.baseVersion + 1 };
}

/**
 * «Reiniciar partida» (v2.8): deja la partida a cero sin mirar la versión (gana sobre cualquier otro dispositivo) y la sube en 1.
 * No borra la fila: con versión 0 un dispositivo ya sincronizado volvería a subir su progreso local al abrir el mapa.
 *
 * @throws {ApiError} 404 asignatura ajena.
 */
export async function resetProgress(userId: string, moduleId: string): Promise<ProgressView> {
  await requireModule(userId, moduleId);
  const state = freshQuest();
  const row = await prisma.questProgress.upsert({
    where: { userId_moduleId: { userId, moduleId } },
    create: { userId, moduleId, state: state as object, version: 1 },
    update: { state: state as object, version: { increment: 1 } },
  });
  return { state, version: row.version };
}
