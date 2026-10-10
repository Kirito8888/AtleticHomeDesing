import { NextResponse } from "next/server";
import { z } from "zod";

import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { manualCardSchema, parseCardLines } from "@/lib/study/coursework";
import { addManualCards } from "@/lib/study/coursework-service";

/** v1.7 · Tarjetas a mano (sin IA): una, o varias pegadas como «pregunta | respuesta» por línea. */
export const POST = route(async (req) => {
  const user = await requireUser();
  const body = await parseBody(
    req,
    z.union([manualCardSchema, z.object({ deck: manualCardSchema.shape.deck, subject: manualCardSchema.shape.subject, lines: z.string().max(100_000) })]),
  );
  const cards = "lines" in body ? parseCardLines(body.lines) : [{ front: body.front, back: body.back }];
  return NextResponse.json(await addManualCards(user.id, body.deck, body.subject ?? null, cards), { status: 201 });
});
