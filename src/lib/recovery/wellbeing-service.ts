import "server-only";

import { ApiError } from "@/lib/api";
import { addDays, dateOnly, toIsoDay } from "@/lib/dates";
import { EXT, readSealed, removeSealed, sniffFile, userFile, writeSealed } from "@/lib/files/sealed-files";
import { prisma } from "@/lib/prisma";
import { ensureHealthConsent } from "@/lib/privacy/service";
import { openJson, sealJson } from "@/lib/security/data-key";

import { type MoodEntry, moodEntrySchema, type ScaleEntry, scaleEntrySchema, type SleepEntry, sleepEntrySchema } from "./wellbeing";

/**
 * v1.7 · Diario de bienestar (sueño, ánimo y estrés, escalas). Va cifrado (es información de salud),
 * nunca a la IA ni al coach. Si el servidor no tiene clave de cifrado, no se guarda (503).
 */
export type WellbeingEntry = ({ kind: "SLEEP" } & SleepEntry) | ({ kind: "MOOD" } & MoodEntry) | ({ kind: "SCALE" } & ScaleEntry);

export function parseWellbeing(raw: unknown): WellbeingEntry {
  const kind = (raw as { kind?: string })?.kind;
  if (kind === "SLEEP") return { kind, ...sleepEntrySchema.parse(raw) };
  if (kind === "MOOD") return { kind, ...moodEntrySchema.parse(raw) };
  if (kind === "SCALE") return { kind, ...scaleEntrySchema.parse(raw) };
  throw new ApiError(400, "Tipo de registro no válido");
}

export async function addWellbeing(userId: string, e: WellbeingEntry) {
  await ensureHealthConsent(userId);
  return prisma.wellbeingLog.create({ data: { userId, date: dateOnly(e.date), data: sealJson(e) }, select: { id: true } });
}

export async function listWellbeing(userId: string, today: string, days = 120) {
  const rows = await prisma.wellbeingLog.findMany({ where: { userId, date: { gte: addDays(dateOnly(today), -days) } }, orderBy: { date: "desc" } });
  return rows.map((r) => ({ id: r.id, ...openJson<WellbeingEntry>(r.data), date: toIsoDay(r.date) }));
}

export async function deleteWellbeing(userId: string, id: string) {
  const { count } = await prisma.wellbeingLog.deleteMany({ where: { id, userId } });
  if (!count) throw new ApiError(404, "Registro no encontrado");
}

// 12 · Fotos de lesión cifradas ------------------------------------------------------------------
export const PHOTO_MAX_BYTES = 4 * 1024 * 1024;
export const photoFile = userFile;

/** Solo imágenes (los justificantes admiten además PDF). */
export function sniffImage(buf: Buffer): string | null {
  const m = sniffFile(buf);
  return m && m.startsWith("image/") ? m : null;
}

export async function addInjuryPhoto(userId: string, injuryId: string, buf: Buffer, takenOn: string) {
  const injury = await prisma.injury.findFirst({ where: { id: injuryId, userId }, select: { id: true } });
  if (!injury) throw new ApiError(404, "Molestia no encontrada");
  if (buf.length > PHOTO_MAX_BYTES) throw new ApiError(413, "La foto ocupa demasiado (máx. 4 MB)");
  const mime = sniffImage(buf);
  if (!mime) throw new ApiError(415, "Solo fotos JPEG, PNG o WebP");
  await ensureHealthConsent(userId);
  const photo = await prisma.injuryPhoto.create({ data: { userId, injuryId, path: "", mime, takenOn: dateOnly(takenOn) }, select: { id: true } });
  const rel = `photos/${photo.id}${EXT[mime]}.enc`;
  await writeSealed(userId, rel, buf);
  await prisma.injuryPhoto.update({ where: { id: photo.id }, data: { path: rel } });
  return photo;
}

export async function readInjuryPhoto(userId: string, id: string) {
  const p = await prisma.injuryPhoto.findFirst({ where: { id, userId } });
  if (!p) throw new ApiError(404, "Foto no encontrada");
  return { mime: p.mime, bytes: await readSealed(userId, p.path) };
}

export async function deleteInjuryPhoto(userId: string, id: string) {
  const p = await prisma.injuryPhoto.findFirst({ where: { id, userId } });
  if (!p) throw new ApiError(404, "Foto no encontrada");
  await prisma.injuryPhoto.delete({ where: { id } });
  await removeSealed(userId, [p.path]);
}

export const listInjuryPhotos = (userId: string) => prisma.injuryPhoto.findMany({ where: { userId }, orderBy: { takenOn: "desc" }, select: { id: true, injuryId: true, takenOn: true } });

export async function removePhotoFiles(userId: string, photos: Array<{ path: string }>) {
  await removeSealed(userId, photos.map((p) => p.path));
}
