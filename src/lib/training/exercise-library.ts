import "server-only";

import { ApiError } from "@/lib/api";
import { EXT, readSealed, removeSealed, writeSealed } from "@/lib/files/sealed-files";
import { checkVideo } from "@/lib/files/video";
import { prisma } from "@/lib/prisma";

/**
 * v2.1 · Biblioteca de ejercicios: catálogo global (solo lectura) + ejercicios propios con instrucciones y un clip
 * cifrado. Solo la dueña edita; la entrenadora consulta (resolveAthleteId en la ruta). El vídeo nunca se guarda en
 * un ejercicio global: sería de una usuaria y lo vería todo el mundo.
 */
export const DESCRIPTION_MAX = 2000;

const PUBLIC = { id: true, userId: true, name: true, primaryMuscle: true, secondaryMuscles: true, pattern: true, loadType: true, isUnilateral: true, description: true, videoMime: true, videoBytes: true, videoPath: true } as const;

type Row = { userId: string | null; videoPath: string | null; videoMime: string | null; videoBytes: number | null };
/** Nunca sale la ruta del fichero: solo si hay vídeo. */
function view<T extends Row>({ videoPath, ...e }: T, ownerId: string) {
  return { ...e, hasVideo: !!videoPath, mine: e.userId === ownerId, global: e.userId === null };
}

export async function listLibrary(ownerId: string, q?: string | null) {
  const rows = await prisma.exercise.findMany({
    where: { OR: [{ userId: null }, { userId: ownerId }], name: q ? { contains: q, mode: "insensitive" } : undefined },
    select: PUBLIC,
    orderBy: { name: "asc" },
  });
  return rows.map((e) => view(e, ownerId));
}

async function find(ownerId: string, id: string) {
  const e = await prisma.exercise.findFirst({ where: { id, OR: [{ userId: null }, { userId: ownerId }] }, select: PUBLIC });
  if (!e) throw new ApiError(404, "Ejercicio no encontrado");
  return e;
}

export async function getExercise(ownerId: string, id: string) {
  return view(await find(ownerId, id), ownerId);
}

/** Editar o subir vídeo: solo ejercicios propios (404 si no se ve, 403 si es del catálogo). */
async function findOwn(userId: string, id: string) {
  const e = await find(userId, id);
  if (e.userId === null) throw new ApiError(403, "Los ejercicios del catálogo no se editan: crea uno propio");
  return e;
}

export async function updateExercise(userId: string, id: string, data: { name?: string; description?: string | null }) {
  await findOwn(userId, id);
  const e = await prisma.exercise.update({ where: { id }, data, select: PUBLIC }).catch((err: { code?: string }) => {
    if (err.code === "P2002") throw new ApiError(409, "Ya tienes un ejercicio con ese nombre");
    throw err;
  });
  return view(e, userId);
}

export async function setExerciseVideo(userId: string, id: string, buf: Buffer) {
  const prev = await findOwn(userId, id);
  const check = checkVideo(buf);
  if (!check.ok) throw new ApiError(check.status, check.message);
  // Nombre nuevo en cada subida: si falla a medias, el clip anterior sigue intacto.
  const rel = `exercises/${id}-${Date.now()}${EXT[check.mime]}.enc`;
  await writeSealed(userId, rel, buf);
  try {
    await prisma.exercise.update({ where: { id }, data: { videoPath: rel, videoMime: check.mime, videoBytes: buf.length } });
  } catch (err) {
    await removeSealed(userId, [rel]);
    throw err;
  }
  if (prev.videoPath) await removeSealed(userId, [prev.videoPath]);
  return getExercise(userId, id);
}

/** `ownerId` = dueña del ejercicio (la atleta, aunque lo pida su entrenadora). */
export async function readExerciseVideo(ownerId: string, id: string) {
  const e = await find(ownerId, id);
  if (!e.videoPath || !e.videoMime || e.userId !== ownerId) throw new ApiError(404, "Este ejercicio no tiene vídeo");
  return { mime: e.videoMime, bytes: await readSealed(ownerId, e.videoPath) };
}

export async function deleteExerciseVideo(userId: string, id: string) {
  const e = await findOwn(userId, id);
  if (!e.videoPath) return;
  await prisma.exercise.update({ where: { id }, data: { videoPath: null, videoMime: null, videoBytes: null } });
  await removeSealed(userId, [e.videoPath]);
}

/**
 * v2.2 · Borra un ejercicio propio y su clip cifrado. Si ya hay series registradas con él (FK `Restrict`) se
 * rechaza con 409: borrarlo dejaría el historial sin nombre. Los alias y las marcas se desvinculan.
 */
export async function deleteExercise(userId: string, id: string) {
  const e = await findOwn(userId, id);
  const used = await prisma.strengthSet.count({ where: { exerciseId: id } });
  if (used > 0) throw new ApiError(409, `Está en ${used} series registradas: no se puede borrar`);
  await prisma.$transaction([
    prisma.exerciseAlias.updateMany({ where: { userId, exerciseId: id }, data: { exerciseId: null } }),
    prisma.exercise.delete({ where: { id } }),
  ]);
  if (e.videoPath) await removeSealed(userId, [e.videoPath]);
}
