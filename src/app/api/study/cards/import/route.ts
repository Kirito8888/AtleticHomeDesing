import { NextResponse } from "next/server";
import { z } from "zod";

import { packItems } from "@/lib/ai/study-pack";
import { ApiError, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { adaptDocSchema } from "@/lib/study/adhd-format";
import { manualCardSchema } from "@/lib/study/coursework";
import { importCards } from "@/lib/study/coursework-service";
import { cardsFromAdapt, cardsFromPack } from "@/lib/study/flashcard-extract";

const schema = z.object({
  deck: manualCardSchema.shape.deck,
  subject: manualCardSchema.shape.subject,
  dryRun: z.boolean().default(false),
  source: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("adapt"), content: adaptDocSchema }),
    z.object({ kind: z.literal("pack"), topicId: z.string().min(1).max(60) }),
  ]),
});

/**
 * v2.8 · N2 · `POST /api/study/cards/import` · Crea flashcards desde un resultado de «Resumir» o desde las preguntas teóricas
 * del paquete de un tema, en un mazo PROPIO (se crea si no existe). La extracción es determinista (sin IA) y se hace aquí, así
 * la previsualización (`dryRun: true`, no escribe) y el guardado dan las mismas cifras. Se omiten las de anverso ya existente.
 * Respuesta: `{ deck, isNew, create, duplicates, added }`.
 *
 * - Errores: 401 · 404 tema no suyo · 400 sin tarjetas extraíbles.
 */
export const POST = route(async (req) => {
  const user = await requireUser();
  const body = await parseBody(req, schema);
  let cards;
  if (body.source.kind === "adapt") cards = cardsFromAdapt(body.source.content);
  else {
    const topic = await prisma.studyTopic.findFirst({ where: { id: body.source.topicId, userId: user.id }, select: { id: true } });
    if (!topic) throw new ApiError(404, "Ese tema no existe.");
    cards = cardsFromPack(await packItems(user.id, topic.id));
  }
  if (!cards.length) throw new ApiError(400, "No encontré conceptos de los que sacar tarjetas.");
  const r = await importCards(user.id, { deck: body.deck, subject: body.subject ?? null, cards, dryRun: body.dryRun });
  return NextResponse.json(r, { status: body.dryRun ? 200 : 201 });
});
