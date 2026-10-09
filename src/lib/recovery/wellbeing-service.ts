import "server-only";

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { ApiError } from "@/lib/api";
import { addDays, dateOnly, toIsoDay } from "@/lib/dates";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { ensureHealthConsent } from "@/lib/privacy/service";
import { dataKey, openJson, previousDataKey, sealJson } from "@/lib/security/data-key";
import { openBytes, sealBytes } from "@/lib/security/secret-box";

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
const PHOTO_MIME: Record<string, string> = { "image/jpeg": ".jpg", "image/webp": ".webp", "image/png": ".png" };
export const PHOTO_MAX_BYTES = 4 * 1024 * 1024;

/** Comprueba la firma real del fichero (no solo lo que dice el navegador). */
export function sniffImage(buf: Buffer): string | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length > 12 && buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  return null;
}

/** Ruta relativa a UPLOAD_DIR/<usuario> (así sobrevive a mover la carpeta de subidas). */
export function photoFile(userId: string, rel: string) {
  const base = path.resolve(/* turbopackIgnore: true */ env().UPLOAD_DIR, userId);
  const file = path.resolve(/* turbopackIgnore: true */ base, rel);
  if (!file.startsWith(base + path.sep)) throw new ApiError(400, "Ruta no válida");
  return file;
}

export async function addInjuryPhoto(userId: string, injuryId: string, buf: Buffer, takenOn: string) {
  const injury = await prisma.injury.findFirst({ where: { id: injuryId, userId }, select: { id: true } });
  if (!injury) throw new ApiError(404, "Molestia no encontrada");
  if (buf.length > PHOTO_MAX_BYTES) throw new ApiError(413, "La foto ocupa demasiado (máx. 4 MB)");
  const mime = sniffImage(buf);
  if (!mime) throw new ApiError(415, "Solo fotos JPEG, PNG o WebP");
  await ensureHealthConsent(userId);
  const photo = await prisma.injuryPhoto.create({ data: { userId, injuryId, path: "", mime, takenOn: dateOnly(takenOn) }, select: { id: true } });
  const rel = `photos/${photo.id}${PHOTO_MIME[mime]}.enc`;
  await mkdir(photoFile(userId, "photos"), { recursive: true });
  await writeFile(photoFile(userId, rel), sealBytes(buf, dataKey()), { mode: 0o600 });
  await prisma.injuryPhoto.update({ where: { id: photo.id }, data: { path: rel } });
  return photo;
}

export async function readInjuryPhoto(userId: string, id: string) {
  const p = await prisma.injuryPhoto.findFirst({ where: { id, userId } });
  if (!p) throw new ApiError(404, "Foto no encontrada");
  return { mime: p.mime, bytes: openBytes(await readFile(photoFile(userId, p.path)), [dataKey(), previousDataKey()]) };
}

export async function deleteInjuryPhoto(userId: string, id: string) {
  const p = await prisma.injuryPhoto.findFirst({ where: { id, userId } });
  if (!p) throw new ApiError(404, "Foto no encontrada");
  await prisma.injuryPhoto.delete({ where: { id } });
  await rm(photoFile(userId, p.path), { force: true });
}

export const listInjuryPhotos = (userId: string) => prisma.injuryPhoto.findMany({ where: { userId }, orderBy: { takenOn: "desc" }, select: { id: true, injuryId: true, takenOn: true } });
