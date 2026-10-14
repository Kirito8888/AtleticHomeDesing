import { NextResponse } from "next/server";

import { ApiError, enforceRateLimit, route } from "@/lib/api";
import { requireUser, resolveAthleteId } from "@/lib/auth/session";
import { VIDEO_MAX_BYTES } from "@/lib/files/video";
import { deleteExerciseVideo, readExerciseVideo, setExerciseVideo } from "@/lib/training/exercise-library";

type Ctx = RouteContext<"/api/training/exercises/[id]/video">;

/** Se descifra al vuelo y solo para la dueña o su entrenadora (ámbito SESSIONS); nunca se cachea. */
export const GET = route(async (req, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const ownerId = await resolveAthleteId(user, req.nextUrl.searchParams.get("athlete"), "SESSIONS");
  const { mime, bytes } = await readExerciseVideo(ownerId, id);
  return new Response(new Uint8Array(bytes), { headers: { "Content-Type": mime, "Content-Length": String(bytes.length), "Cache-Control": "private, no-store", "Content-Disposition": "inline" } });
});

/** Solo `multipart/form-data` con un fichero: no hay campo de URL ni descarga desde terceros. */
export const PUT = route(async (req, ctx: Ctx) => {
  const user = await requireUser();
  await enforceRateLimit("videoUpload", user.id);
  const { id } = await ctx.params;
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > VIDEO_MAX_BYTES + 64 * 1024) throw new ApiError(413, "El vídeo ocupa demasiado (máx. 25 MB por clip)");
  const form = await req.formData().catch(() => {
    throw new ApiError(400, "Formulario no válido");
  });
  const file = form.get("file");
  if (!(file instanceof File)) throw new ApiError(400, "Falta el vídeo");
  if (file.size > VIDEO_MAX_BYTES) throw new ApiError(413, "El vídeo ocupa demasiado (máx. 25 MB por clip)");
  return NextResponse.json(await setExerciseVideo(user.id, id, Buffer.from(await file.arrayBuffer())));
});

export const DELETE = route(async (_req, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  await deleteExerciseVideo(user.id, id);
  return { ok: true };
});
