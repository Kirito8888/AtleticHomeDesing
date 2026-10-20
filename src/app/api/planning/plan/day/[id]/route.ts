import { z } from "zod";

import { ApiError, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { EQUIPMENT, LOCATIONS } from "@/lib/ai-plan/options";
import { chooseDayAlternative, setDayMode, swapDayLocation } from "@/lib/ai-plan/service";

const keys = <T extends Record<string, string>>(o: T) => Object.keys(o) as [keyof T & string, ...(keyof T & string)[]];

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("mode"), mode: z.enum(["LIGHT"]).nullable() }),
  z.object({
    action: z.literal("swap"),
    /** `location` suelto: clientes anteriores a los varios espacios. */
    location: z.enum(keys(LOCATIONS)).optional(),
    locations: z.array(z.enum(keys(LOCATIONS))).min(1).max(6).optional(),
    equipment: z.array(z.enum(keys(EQUIPMENT))).max(16),
  }),
  z.object({ action: z.literal("alternative"), block: z.number().int().min(0), row: z.number().int().min(0), alt: z.number().int().min(0).max(2) }),
]);

/** Ajustes de un día del plan sin escribir: versión suave, otro sitio/material u otro ejercicio. */
export const POST = route(async (req, ctx: RouteContext<"/api/planning/plan/day/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const body = await parseBody(req, schema);
  if (body.action === "mode") return setDayMode(user.id, id, body.mode);
  if (body.action === "swap") {
    const spaces = body.locations ?? (body.location ? [body.location] : []);
    if (!spaces.length || new Set(spaces).size !== spaces.length) throw new ApiError(400, "Indica los espacios de hoy, sin repetir");
    return swapDayLocation(user.id, id, spaces, body.equipment);
  }
  return chooseDayAlternative(user.id, id, body.block, body.row, body.alt);
});
