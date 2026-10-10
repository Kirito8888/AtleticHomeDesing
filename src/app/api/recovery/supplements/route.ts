import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { dateOnly } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { supplementSchema } from "@/lib/recovery/health-admin";

/** Suplementos (solo su dueño). Atlenza no dice si algo está permitido. */
export const GET = route(async () => {
  const user = await requireUser();
  return prisma.supplement.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const s = await parseBody(req, supplementSchema);
  return prisma.supplement.create({
    data: {
      userId: user.id,
      name: s.name,
      brand: s.brand ?? null,
      batch: s.batch ?? null,
      dose: s.dose ?? null,
      startedOn: s.startedOn ? dateOnly(s.startedOn) : null,
      endedOn: s.endedOn ? dateOnly(s.endedOn) : null,
      notes: s.notes ?? null,
    },
    select: { id: true },
  });
});
