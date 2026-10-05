import "server-only";
import { z } from "zod";

import { generateJson } from "@/lib/ai/gemini";
import { sm2 } from "@/lib/ai/sm2";
import { ApiError } from "@/lib/api";
import { addDays } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

/** Límite de texto enviado al modelo por generación (~10k tokens). */
const MAX_SOURCE_CHARS = 40_000;

const cardsSchema = z.object({
  cards: z
    .array(
      z.object({
        front: z.string().min(3).max(500),
        back: z.string().min(1).max(1500),
      }),
    )
    .min(1)
    .max(60),
});

const SYSTEM = `Eres un experto en técnicas de estudio (recuperación activa, principio de información mínima).
Creas flashcards en español a partir de apuntes:
- Una idea por tarjeta; pregunta concreta en "front", respuesta breve y exacta en "back".
- Prioriza definiciones, relaciones causa-efecto, fórmulas y datos que se suelen preguntar en examen.
- Usa SOLO información presente en el texto. No inventes.
- Evita preguntas de sí/no y tarjetas duplicadas.`;

/** Muestra fragmentos repartidos por todo el documento hasta el límite de caracteres. */
function sampleChunks<T extends { content: string }>(chunks: T[]): T[] {
  const total = chunks.reduce((a, c) => a + c.content.length, 0);
  if (total <= MAX_SOURCE_CHARS) return chunks;
  const keep = Math.max(1, Math.floor((chunks.length * MAX_SOURCE_CHARS) / total));
  const step = chunks.length / keep;
  return Array.from({ length: keep }, (_, i) => chunks[Math.floor(i * step)]);
}

export async function generateFlashcards(userId: string, params: { documentId: string; count: number; deckName?: string }) {
  const doc = await prisma.studyDocument.findFirst({
    where: { id: params.documentId, userId },
    include: { chunks: { orderBy: { chunkIndex: "asc" }, select: { content: true } } },
  });
  if (!doc) throw new ApiError(404, "Documento no encontrado");
  if (doc.status !== "EMBEDDED" || !doc.chunks.length) throw new ApiError(409, "El documento aún no está procesado");

  const source = sampleChunks(doc.chunks)
    .map((c) => c.content)
    .join("\n\n");
  const { data } = await generateJson(cardsSchema, {
    system: SYSTEM,
    prompt: `Genera exactamente ${params.count} flashcards del documento "${doc.title}".\n\nTEXTO:\n${source}`,
    temperature: 0.5,
  });

  const deckName = params.deckName?.trim() || doc.subject || doc.title;
  const deck = await prisma.flashcardDeck.upsert({
    where: { userId_name: { userId, name: deckName } },
    create: { userId, name: deckName, subject: doc.subject },
    update: {},
  });
  await prisma.flashcard.createMany({
    data: data.cards.slice(0, params.count).map((c) => ({ ...c, deckId: deck.id, sourceDocumentId: doc.id })),
  });
  return prisma.flashcardDeck.findUnique({
    where: { id: deck.id },
    include: { _count: { select: { cards: true } } },
  });
}

export async function reviewFlashcard(userId: string, cardId: string, grade: number) {
  const card = await prisma.flashcard.findFirst({ where: { id: cardId, deck: { userId } } });
  if (!card) throw new ApiError(404, "Tarjeta no encontrada");
  const next = sm2(card, grade);
  const now = new Date();
  return prisma.flashcard.update({
    where: { id: card.id },
    data: { ...next, lastReviewedAt: now, dueAt: addDays(now, next.intervalDays) },
  });
}
