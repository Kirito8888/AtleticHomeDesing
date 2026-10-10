import { z } from "zod";

import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { classSlotSchema, toMin } from "@/lib/study/schedule";
import { createSlot } from "@/lib/study/schedule-service";

/** v1.10 · Clases y exámenes del .ics de la universidad (leído en el navegador): solo se añaden los nuevos. */
export const POST = route(async (req) => {
  const user = await requireUser();
  const { slots } = await parseBody(req, z.object({ slots: z.array(classSlotSchema).min(1).max(200) }));
  const existing = await prisma.classSlot.findMany({ where: { userId: user.id }, select: { subject: true, kind: true, weekday: true, date: true, startMin: true } });
  const key = (s: { subject: string; kind: string; weekday: number | null; date: string | null; startMin: number }) => `${s.kind}|${s.subject.toLowerCase()}|${s.weekday ?? ""}|${s.date ?? ""}|${s.startMin}`;
  const have = new Set(existing.map((e) => key({ ...e, date: e.date?.toISOString().slice(0, 10) ?? null })));
  let added = 0;
  for (const s of slots) {
    const k = key({ subject: s.subject, kind: s.kind, weekday: s.kind === "CLASS" ? s.weekday : null, date: s.kind === "EXAM" ? s.date : null, startMin: toMin(s.start) });
    if (have.has(k)) continue;
    have.add(k);
    await createSlot(user.id, s);
    added++;
  }
  return { added, skipped: slots.length - added };
});
