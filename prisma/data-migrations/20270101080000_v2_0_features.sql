-- v2.0 bloque C: el estado SM-2 que vivía en cada Flashcard pasa a FlashcardReview, a nombre de la dueña del mazo.
-- Idempotente (ON CONFLICT) y sin tocar las columnas antiguas de Flashcard.
INSERT INTO "FlashcardReview" ("id", "userId", "cardId", "easeFactor", "intervalDays", "repetitions", "dueAt", "lastReviewedAt", "createdAt", "updatedAt")
SELECT 'fr' || md5(f."id"), d."userId", f."id", f."easeFactor", f."intervalDays", f."repetitions", f."dueAt", f."lastReviewedAt", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Flashcard" f JOIN "FlashcardDeck" d ON d."id" = f."deckId"
ON CONFLICT ("userId", "cardId") DO NOTHING;
