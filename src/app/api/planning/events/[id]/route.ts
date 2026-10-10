import { z } from "zod";

import { ApiError, parseBody, route } from "@/lib/api";
import { requireUser, resolveAthleteId } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

type Ctx = RouteContext<"/api/planning/events/[id]">;

export const DELETE = route(async (req, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const userId = await resolveAthleteId(user, req.nextUrl.searchParams.get("athleteId"), "PLANNING", "write");
  const { count } = await prisma.calendarEvent.deleteMany({ where: { id, userId } });
  if (!count) throw new ApiError(404, "Evento no encontrado");
  return { ok: true };
});

const placeSchema = z
  .object({ lat: z.number().min(-90).max(90).nullable(), lon: z.number().min(-180).max(180).nullable(), location: z.string().trim().max(200).nullish() })
  .refine((p) => (p.lat == null) === (p.lon == null), "Pon latitud y longitud, o ninguna");

/** v1.8 · Lugar de la competición (coordenadas para el pronóstico del día). */
export const PATCH = route(async (req, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const userId = await resolveAthleteId(user, req.nextUrl.searchParams.get("athleteId"), "PLANNING", "write");
  const p = await parseBody(req, placeSchema);
  const { count } = await prisma.calendarEvent.updateMany({ where: { id, userId }, data: { lat: p.lat, lon: p.lon, ...(p.location !== undefined ? { location: p.location || null } : {}) } });
  if (!count) throw new ApiError(404, "Evento no encontrado");
  return { ok: true };
});
