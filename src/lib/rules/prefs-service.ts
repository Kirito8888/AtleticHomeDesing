import "server-only";

import { cache } from "react";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

import { pickPatch, type Prefs, prefsUpdateSchema, readPrefs } from "./prefs";

/** `cache`: layout, página y `getDashboard` la piden en el mismo render; una sola consulta por petición. */
export const getPrefs = cache(async (userId: string): Promise<Prefs> => {
  const p = await prisma.athleteProfile.findUnique({ where: { userId }, select: { prefs: true } });
  return readPrefs(p?.prefs);
});

/** Preferencias de varias personas en una consulta (las que no tienen perfil, las de por defecto). */
export async function getPrefsMany(userIds: string[]): Promise<Map<string, Prefs>> {
  const rows = await prisma.athleteProfile.findMany({ where: { userId: { in: userIds } }, select: { userId: true, prefs: true } });
  const byUser = new Map(rows.map((r) => [r.userId, r.prefs]));
  return new Map(userIds.map((id) => [id, readPrefs(byUser.get(id))]));
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
