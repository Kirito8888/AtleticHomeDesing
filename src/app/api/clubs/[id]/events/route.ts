import { NextResponse } from "next/server";

import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { eventCreateSchema } from "@/lib/clubs/events";
import { createEvent, listEvents } from "@/lib/clubs/events-service";

/** Eventos del club: solo para sus miembros activos (una atleta ve únicamente su propia respuesta). */
export const GET = route(async (_req, ctx: RouteContext<"/api/clubs/[id]/events">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  return await listEvents(user, id);
});

/** Crear un evento: staff del club. El importe (cuota por asistente, sin cobro) solo lo pone la administración. */
export const POST = route(async (req, ctx: RouteContext<"/api/clubs/[id]/events">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const ev = await createEvent(user, id, await parseBody(req, eventCreateSchema));
  return NextResponse.json({ id: ev.id }, { status: 201 });
});
