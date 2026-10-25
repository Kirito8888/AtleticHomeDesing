import "server-only";
import { z } from "zod";

import { generateJson } from "@/lib/ai/llm";
import { assertAiAllowed } from "@/lib/ai/guard";
import { nextReview } from "@/lib/ai/sm2";
import { ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";

/** Límite de texto enviado al modelo por generación (~10k tokens). */
export const MAX_SOURCE_CHARS = 40_000;

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
export function sampleChunks<T extends { content: string }>(chunks: T[]): T[] {
  const total = chunks.reduce((a, c) => a + c.content.length, 0);
  if (total <= MAX_SOURCE_CHARS) return chunks;
  const keep = Math.max(1, Math.floor((chunks.length * MAX_SOURCE_CHARS) / total));
  const step = chunks.length / keep;
  return Array.from({ length: keep }, (_, i) => chunks[Math.floor(i * step)]);
}

export async function generateFlashcards(userId: string, params: { documentId: string; count: number; deckName?: string }) {
  await assertAiAllowed(userId);
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
    userId,
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

// ---------------------------------------------------------------------------
// v2.0 C · Mazos compartidos en solo lectura. El contenido es de la dueña; el SM-2 es de cada persona.
// ---------------------------------------------------------------------------

export type DeckAccess = "owner" | "reader";

/** Rol de la persona en el mazo; null si no lo ve (no se distingue «no existe» de «no es tuyo»). */
export async function deckAccess(userId: string, deckId: string): Promise<DeckAccess | null> {
  const deck = await prisma.flashcardDeck.findUnique({
    where: { id: deckId },
    select: { userId: true, shares: { where: { userId }, select: { id: true } } },
  });
  if (!deck) return null;
  if (deck.userId === userId) return "owner";
  return deck.shares.length ? "reader" : null;
}

/** Solo la dueña edita o borra: la lectora recibe 403, quien no ve el mazo recibe 404. */
export async function assertDeckOwner(userId: string, deckId: string) {
  const access = await deckAccess(userId, deckId);
  if (!access) throw new ApiError(404, "Mazo no encontrado");
  if (access === "reader") throw new ApiError(403, "Mazo compartido en solo lectura");
}

/** Mazos visibles por la persona (propios y compartidos) en un `where` de tarjetas. */
export const visibleCards = (userId: string) => ({ deck: { OR: [{ userId }, { shares: { some: { userId } } }] } });

const isDue = (r: { dueAt: Date } | undefined, now: Date) => !r || r.dueAt <= now;

export async function reviewFlashcard(userId: string, cardId: string, grade: number) {
  const card = await prisma.flashcard.findFirst({ where: { id: cardId, ...visibleCards(userId) }, select: { id: true } });
  if (!card) throw new ApiError(404, "Tarjeta no encontrada");
  const prev = await prisma.flashcardReview.findUnique({ where: { userId_cardId: { userId, cardId } } });
  const r = nextReview(prev, grade, new Date());
  const data = { ...r.state, dueAt: r.dueAt, lastReviewedAt: r.lastReviewedAt, lastGrade: r.lastGrade };
  return prisma.flashcardReview.upsert({
    where: { userId_cardId: { userId, cardId } },
    create: { userId, cardId, ...data },
    update: data,
  });
}

/** Tarjetas que tocan hoy a esta persona (las que aún no ha visto cuentan como nuevas), las más atrasadas primero. */
export async function dueCards(userId: string, opts: { deckId?: string; limit: number }) {
  const now = new Date();
  const cards = await prisma.flashcard.findMany({
    where: { ...visibleCards(userId), deckId: opts.deckId },
    select: { id: true, front: true, back: true, deckId: true, createdAt: true, reviews: { where: { userId }, select: { dueAt: true } } },
  });
  return cards
    .filter((c) => isDue(c.reviews[0], now))
    .sort((a, b) => (a.reviews[0]?.dueAt ?? a.createdAt).getTime() - (b.reviews[0]?.dueAt ?? b.createdAt).getTime())
    .slice(0, opts.limit)
    .map((c) => ({ id: c.id, front: c.front, back: c.back, deckId: c.deckId }));
}

/** Cuántas tarjetas tocan hoy por mazo (propios y compartidos). */
export async function dueCounts(userId: string): Promise<Map<string, number>> {
  const now = new Date();
  const cards = await prisma.flashcard.findMany({
    where: visibleCards(userId),
    select: { deckId: true, reviews: { where: { userId }, select: { dueAt: true } } },
  });
  const out = new Map<string, number>();
  for (const c of cards) if (isDue(c.reviews[0], now)) out.set(c.deckId, (out.get(c.deckId) ?? 0) + 1);
  return out;
}

export interface DeckSummary {
  id: string;
  name: string;
  subject: string | null;
  total: number;
  due: number;
  /** Tarjetas con ≥ 3 repeticiones seguidas, solo del progreso de esta persona. */
  mastered: number;
  reviewed: number;
  shared: boolean;
  ownerName: string | null;
  sharedWith: number;
}

export async function listDecks(userId: string): Promise<DeckSummary[]> {
  const decks = await prisma.flashcardDeck.findMany({
    where: { OR: [{ userId }, { shares: { some: { userId } } }] },
    orderBy: { updatedAt: "desc" },
    include: {
      user: { select: { name: true, email: true } },
      _count: { select: { cards: true, shares: true } },
      cards: { select: { reviews: { where: { userId }, select: { repetitions: true, lastReviewedAt: true } } } },
    },
  });
  const due = await dueCounts(userId);
  return decks.map((d) => {
    const mine = d.cards.flatMap((c) => c.reviews);
    const owner = d.userId === userId;
    return {
      id: d.id,
      name: d.name,
      subject: d.subject,
      total: d._count.cards,
      due: due.get(d.id) ?? 0,
      mastered: mine.filter((r) => r.repetitions >= 3).length,
      reviewed: mine.filter((r) => r.lastReviewedAt).length,
      shared: !owner,
      ownerName: owner ? null : (d.user.name ?? d.user.email),
      sharedWith: owner ? d._count.shares : 0,
    };
  });
}

/** Comparte por email. Mismo 404 genérico exista o no la persona (no se puede sondear qué emails existen). */
export async function shareDeck(ownerId: string, deckId: string, email: string) {
  await assertDeckOwner(ownerId, deckId);
  const target = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() }, select: { id: true } });
  if (!target || target.id === ownerId) throw new ApiError(404, "No se pudo compartir el mazo");
  await prisma.flashcardDeckShare.upsert({
    where: { deckId_userId: { deckId, userId: target.id } },
    create: { deckId, userId: target.id },
    update: {},
  });
  return { ok: true };
}

export async function listShares(ownerId: string, deckId: string) {
  await assertDeckOwner(ownerId, deckId);
  const rows = await prisma.flashcardDeckShare.findMany({
    where: { deckId },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true, user: { select: { id: true, name: true, email: true } } },
  });
  return rows.map((r) => ({ userId: r.user.id, name: r.user.name, email: r.user.email, since: r.createdAt }));
}

/** La dueña quita a alguien, o la propia lectora deja el mazo (borra también su progreso en él). */
export async function unshareDeck(actorId: string, deckId: string, targetUserId: string) {
  if (actorId !== targetUserId) await assertDeckOwner(actorId, deckId);
  else if ((await deckAccess(actorId, deckId)) !== "reader") throw new ApiError(404, "Mazo no encontrado");
  await prisma.$transaction([
    prisma.flashcardDeckShare.deleteMany({ where: { deckId, userId: targetUserId } }),
    prisma.flashcardReview.deleteMany({ where: { userId: targetUserId, card: { deckId } } }),
  ]);
  return { ok: true };
}

export async function updateCard(userId: string, cardId: string, data: { front?: string; back?: string }) {
  const card = await prisma.flashcard.findUnique({ where: { id: cardId }, select: { deckId: true } });
  if (!card) throw new ApiError(404, "Tarjeta no encontrada");
  await assertDeckOwner(userId, card.deckId);
  return prisma.flashcard.update({ where: { id: cardId }, data, select: { id: true, front: true, back: true } });
}

export async function deleteCard(userId: string, cardId: string) {
  const card = await prisma.flashcard.findUnique({ where: { id: cardId }, select: { deckId: true } });
  if (!card) throw new ApiError(404, "Tarjeta no encontrada");
  await assertDeckOwner(userId, card.deckId);
  await prisma.flashcard.delete({ where: { id: cardId } });
  return { ok: true };
}

export async function deleteDeck(userId: string, deckId: string) {
  await assertDeckOwner(userId, deckId);
  await prisma.flashcardDeck.delete({ where: { id: deckId } });
  return { ok: true };
}
