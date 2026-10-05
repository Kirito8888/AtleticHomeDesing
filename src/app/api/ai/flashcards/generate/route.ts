import { NextResponse } from "next/server";
import { z } from "zod";

import { generateFlashcards } from "@/lib/ai/flashcards";
import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";

const schema = z.object({
  documentId: z.string(),
  count: z.number().int().min(3).max(40).default(15),
  deckName: z.string().max(100).optional(),
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const deck = await generateFlashcards(user.id, await parseBody(req, schema));
  return NextResponse.json(deck, { status: 201 });
});
