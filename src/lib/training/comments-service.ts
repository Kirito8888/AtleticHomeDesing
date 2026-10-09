import "server-only";

import { z } from "zod";

import { ApiError } from "@/lib/api";
import { type CurrentUser, resolveAthleteId } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { sendToUser } from "@/lib/push/service";

export const commentSchema = z.object({ body: z.string().trim().min(1).max(2000) });

/** Comprueba acceso (atleta o coach con permiso de sesiones) y que la sesión es de ese atleta. */
async function access(viewer: CurrentUser, sessionId: string, athleteId: string | null | undefined) {
  const athlete = await resolveAthleteId(viewer, athleteId, "SESSIONS");
  const s = await prisma.trainingSession.findFirst({ where: { id: sessionId, userId: athlete }, select: { id: true, title: true } });
  if (!s) throw new ApiError(404, "Sesión no encontrada");
  return { athlete, session: s };
}

export async function sessionThread(viewer: CurrentUser, sessionId: string, athleteId?: string | null) {
  const { athlete } = await access(viewer, sessionId, athleteId);
  const rows = await prisma.sessionComment.findMany({
    where: { sessionId, athleteId: athlete },
    orderBy: { createdAt: "asc" },
    include: { author: { select: { id: true, name: true, email: true } } },
  });
  return rows.map((c) => ({
    id: c.id,
    body: c.body,
    createdAt: c.createdAt.toISOString(),
    author: c.author.name ?? c.author.email.split("@")[0],
    mine: c.authorId === viewer.id,
    fromCoach: c.authorId !== athlete,
  }));
}

/**
 * Añade un comentario y avisa por push al otro lado: si escribe el coach, al atleta;
 * si responde el atleta, a los coaches que ya comentaron y siguen teniendo acceso.
 */
export async function addComment(viewer: CurrentUser, sessionId: string, athleteId: string | null | undefined, body: string, send?: Parameters<typeof sendToUser>[2]) {
  const { athlete, session } = await access(viewer, sessionId, athleteId);
  const c = await prisma.sessionComment.create({ data: { sessionId, athleteId: athlete, authorId: viewer.id, body }, select: { id: true } });
  const title = session.title ?? "tu sesión";
  const preview = body.length > 120 ? `${body.slice(0, 117)}…` : body;
  if (viewer.id !== athlete) {
    await sendToUser(athlete, { title: `Comentario en «${title}»`, body: preview, url: `/training/${sessionId}`, tag: `comment-${sessionId}` }, send);
  } else {
    const coaches = await prisma.sessionComment.findMany({ where: { sessionId, athleteId: athlete, authorId: { not: athlete } }, distinct: ["authorId"], select: { authorId: true } });
    const active = await prisma.coachAthlete.findMany({
      where: { athleteId: athlete, coachId: { in: coaches.map((x) => x.authorId) }, status: "ACTIVE", scopes: { has: "SESSIONS" } },
      select: { coachId: true },
    });
    for (const a of active) {
      await sendToUser(a.coachId, { title: `Respuesta en «${title}»`, body: preview, url: `/coach/session/${sessionId}?athleteId=${athlete}`, tag: `comment-${sessionId}` }, send);
    }
  }
  return c;
}

/** Solo su autor borra un comentario. */
export async function deleteComment(viewer: CurrentUser, commentId: string) {
  const { count } = await prisma.sessionComment.deleteMany({ where: { id: commentId, authorId: viewer.id } });
  if (!count) throw new ApiError(404, "Comentario no encontrado");
}
