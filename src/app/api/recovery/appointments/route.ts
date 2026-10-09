import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { appointmentSchema } from "@/lib/recovery/health-admin";

/** Citas de fisio o médico (te avisa por push el día antes). */
export const GET = route(async () => {
  const user = await requireUser();
  return prisma.appointment.findMany({ where: { userId: user.id }, orderBy: { at: "asc" } });
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const a = await parseBody(req, appointmentSchema);
  return prisma.appointment.create({ data: { userId: user.id, kind: a.kind, at: new Date(a.at), place: a.place ?? null, notes: a.notes ?? null }, select: { id: true } });
});
