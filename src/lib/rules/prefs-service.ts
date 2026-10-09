import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

import { pickPatch, type Prefs, prefsUpdateSchema, readPrefs } from "./prefs";

export async function getPrefs(userId: string): Promise<Prefs> {
  const p = await prisma.athleteProfile.findUnique({ where: { userId }, select: { prefs: true } });
  return readPrefs(p?.prefs);
}

export async function updatePrefs(userId: string, patch: unknown): Promise<Prefs> {
  const next = { ...(await getPrefs(userId)), ...pickPatch(prefsUpdateSchema, patch) };
  await prisma.athleteProfile.upsert({
    where: { userId },
    create: { userId, prefs: next as Prisma.InputJsonValue },
    update: { prefs: next as Prisma.InputJsonValue },
  });
  return next;
}
