import "server-only";

import { randomBytes } from "node:crypto";

import { purgeUser } from "@/lib/account/service";
import { ApiError } from "@/lib/api";
import { generatePassword, hashPassword } from "@/lib/auth/scrypt";
import { addDays, dateOnly, today, toIsoDay } from "@/lib/dates";
import { saveWomenSettings } from "@/lib/health/women-service";
import { prisma } from "@/lib/prisma";
import { createRoutine } from "@/lib/routine/service";
import { dataKeyConfigured } from "@/lib/security/data-key";
import { recomputeSessionsTss } from "@/lib/training/service";

import { AUDIENCES, type Audience, demoSeries } from "./audiences";

export const DEMO_DAYS = 30;
const MAX_DEMOS = 10;

/**
 * v1.7 · Cuenta de demostración (solo administración): datos sintéticos de un tipo de público, sin
 * relación con ninguna persona real. Correo en el dominio reservado `.invalid` (nunca recibe nada),
 * contraseña aleatoria mostrada una sola vez y borrado automático a los 30 días.
 */
export async function createDemoAccount(audience: Audience) {
  if ((await prisma.user.count({ where: { demoExpiresAt: { not: null } } })) >= MAX_DEMOS) throw new ApiError(400, `Como mucho ${MAX_DEMOS} cuentas demo a la vez: borra alguna`);
  const day = toIsoDay(today());
  const { spec, sessions, recovery, water } = demoSeries(audience, day, randomBytes(4).readUInt32LE());
  const email = `demo-${audience.toLowerCase()}-${randomBytes(3).toString("hex")}@demo.lifeos.invalid`;
  const password = generatePassword(16);
  const user = await prisma.user.create({
    data: {
      email,
      name: spec.name,
      passwordHash: await hashPassword(password),
      demoAudience: audience,
      demoExpiresAt: addDays(new Date(), DEMO_DAYS),
      athleteProfile: { create: { sex: spec.sex, birthDate: dateOnly(`${Number(day.slice(0, 4)) - spec.age}-06-15`), disciplines: audience === "THROWER" ? ["THROWS"] : audience === "RUNNER" ? ["LONG_DISTANCE"] : [] } },
    },
    select: { id: true },
  });
  await prisma.trainingSession.createMany({ data: sessions.map((s) => ({ userId: user.id, date: dateOnly(s.date), type: s.type, title: s.title, durationSec: s.durationSec, sessionRpe: s.sessionRpe, status: s.status })) });
  await prisma.recoveryMetrics.createMany({ data: recovery.map((x) => ({ userId: user.id, ...x, date: dateOnly(x.date) })) });
  await prisma.hydrationLog.createMany({ data: water.map((w) => ({ userId: user.id, date: dateOnly(w.date), ml: w.ml })) });
  await prisma.habit.create({ data: { userId: user.id, name: "Estirar 10 min" } });
  // Carga (TSS), PMC y readiness como si se hubieran registrado a mano
  await recomputeSessionsTss(user.id);
  if (audience === "POSTPARTUM" && dataKeyConfigured()) await saveWomenSettings(user.id, { mode: "POSTPARTUM", postpartumSince: toIsoDay(addDays(dateOnly(day), -70)) });
  if (spec.routine) await createRoutine(user.id, { ...spec.routine, startDate: toIsoDay(addDays(dateOnly(day), 1)) }, day);
  return { email, password, audience: AUDIENCES[audience] };
}

export const listDemoAccounts = () =>
  prisma.user.findMany({ where: { demoExpiresAt: { not: null } }, orderBy: { createdAt: "desc" }, select: { id: true, email: true, demoAudience: true, demoExpiresAt: true } });

export async function deleteDemoAccount(id: string) {
  const u = await prisma.user.findUnique({ where: { id }, select: { demoExpiresAt: true } });
  if (!u?.demoExpiresAt) throw new ApiError(404, "Cuenta demo no encontrada");
  await purgeUser(id);
}

/** Lo llama el job diario de conservación: borra las demo caducadas (con sus ficheros). */
export async function pruneExpiredDemos(now = new Date()) {
  const expired = await prisma.user.findMany({ where: { demoExpiresAt: { lt: now } }, select: { id: true } });
  for (const u of expired) await purgeUser(u.id);
  return expired.length;
}
