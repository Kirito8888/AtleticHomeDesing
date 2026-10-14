import { NextResponse } from "next/server";
import { z } from "zod";

import { listShares, shareDeck, unshareDeck } from "@/lib/ai/flashcards";
import { enforceRateLimit, parseBody, parseQuery, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";

type Ctx = RouteContext<"/api/ai/flashcards/decks/[id]/shares">;

export const GET = route(async (_req, ctx: Ctx) => {
  const user = await requireUser();
  return listShares(user.id, (await ctx.params).id);
});

export const POST = route(async (req, ctx: Ctx) => {
  const user = await requireUser();
  await enforceRateLimit("deckShare", user.id);
  const { email } = await parseBody(req, z.object({ email: z.string().email().max(200) }));
  return NextResponse.json(await shareDeck(user.id, (await ctx.params).id, email), { status: 201 });
});

/** `?userId=` quita a esa persona (dueña); sin `userId`, la lectora deja el mazo. */
export const DELETE = route(async (req, ctx: Ctx) => {
  const user = await requireUser();
  const q = parseQuery(req, z.object({ userId: z.string().optional() }));
  return unshareDeck(user.id, (await ctx.params).id, q.userId ?? user.id);
});
