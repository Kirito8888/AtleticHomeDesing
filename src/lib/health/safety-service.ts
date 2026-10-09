import "server-only";

import { z } from "zod";

import { ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { sendToUser } from "@/lib/push/service";
import { dataKeyConfigured, openJson, sealJson } from "@/lib/security/data-key";

/**
 * «Entreno sola, con aviso»: sales con una hora prevista de vuelta y, si no marcas
 * «llegué» a tiempo, tus contactos de confianza (cuentas de LifeOS que aceptaron)
 * reciben un push. Sin SMS ni email: el servidor no tiene ese servicio.
 * La nota y la ubicación (solo si la compartes al salir) van cifradas.
 */
export const startTripSchema = z.object({
  minutes: z.number().int().min(10).max(600),
  note: z.string().trim().max(200).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lon: z.number().min(-180).max(180).optional(),
});
type TripData = { note?: string; lat?: number; lon?: number };

const hhmm = (d: Date) => new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }).format(d);
const nameOf = (u: { name: string | null; email: string }) => u.name ?? u.email.split("@")[0];

export async function inviteContact(userId: string, email: string) {
  const other = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() }, select: { id: true } });
  // Mismo mensaje exista o no: no se filtra qué emails están registrados
  if (!other || other.id === userId) throw new ApiError(404, "No se pudo enviar la invitación");
  await prisma.safetyContact.upsert({ where: { userId_contactId: { userId, contactId: other.id } }, create: { userId, contactId: other.id }, update: { status: "PENDING" } });
  await sendToUser(other.id, { title: "Te han elegido como contacto de confianza", body: "Acepta en LifeOS → Entreno sola para recibir el aviso si no llega a tiempo.", url: "/safety" });
}

/** El contacto acepta o rechaza; la dueña lo quita. */
export async function setContactStatus(userId: string, id: string, status: "ACTIVE" | "REVOKED") {
  const link = await prisma.safetyContact.findUnique({ where: { id } });
  if (!link || (link.contactId !== userId && link.userId !== userId)) throw new ApiError(404, "Contacto no encontrado");
  if (status === "ACTIVE" && link.contactId !== userId) throw new ApiError(403, "Solo la persona invitada puede aceptar");
  await prisma.safetyContact.update({ where: { id }, data: { status } });
}

export async function startTrip(userId: string, input: z.infer<typeof startTripSchema>) {
  const now = new Date();
  await prisma.safetyTrip.updateMany({ where: { userId, endedAt: null }, data: { endedAt: now } });
  const data: TripData = { note: input.note || undefined, lat: input.lat, lon: input.lon };
  const hasData = data.note || data.lat != null;
  return prisma.safetyTrip.create({
    data: { userId, startedAt: now, dueAt: new Date(now.getTime() + input.minutes * 60_000), data: hasData && dataKeyConfigured() ? sealJson(data) : null },
    select: { id: true, dueAt: true },
  });
}

export async function endTrip(userId: string, send?: Parameters<typeof sendToUser>[2]) {
  const trip = await prisma.safetyTrip.findFirst({ where: { userId, endedAt: null }, orderBy: { startedAt: "desc" }, include: { user: { select: { name: true, email: true } } } });
  if (!trip) throw new ApiError(404, "No hay ninguna salida abierta");
  await prisma.safetyTrip.update({ where: { id: trip.id }, data: { endedAt: new Date() } });
  // Si ya habían saltado los avisos, tranquiliza a sus contactos
  if (trip.alertedAt) {
    for (const c of await activeContacts(userId)) await sendToUser(c, { title: `${nameOf(trip.user)} ya ha llegado`, body: "Ha marcado «llegué».", url: "/safety", tag: `safety-${trip.id}` }, send);
  }
}

const activeContacts = async (userId: string) => (await prisma.safetyContact.findMany({ where: { userId, status: "ACTIVE" }, select: { contactId: true } })).map((c) => c.contactId);

/** Salidas vencidas sin «llegué»: avisa a sus contactos una sola vez. Lo llama el planificador cada 5 min. */
export async function runSafetyJob(now = new Date(), send?: Parameters<typeof sendToUser>[2]): Promise<number> {
  const due = await prisma.safetyTrip.findMany({ where: { endedAt: null, alertedAt: null, dueAt: { lte: now } }, include: { user: { select: { name: true, email: true } } } });
  let alerted = 0;
  for (const t of due) {
    // Marca primero: aunque falle un push, no se repite cada 5 minutos
    const { count } = await prisma.safetyTrip.updateMany({ where: { id: t.id, alertedAt: null }, data: { alertedAt: now } });
    if (!count) continue;
    const d = t.data && dataKeyConfigured() ? openJson<TripData>(t.data) : {};
    const where = d.lat != null && d.lon != null ? ` Ubicación al salir: ${d.lat.toFixed(5)}, ${d.lon.toFixed(5)}.` : "";
    const note = d.note ? ` «${d.note}».` : "";
    const who = nameOf(t.user);
    for (const c of await activeContacts(t.userId)) {
      await sendToUser(c, { title: `¿Ha llegado ${who}?`, body: `Salió a las ${hhmm(t.startedAt)} y pensaba volver a las ${hhmm(t.dueAt)}; no ha marcado «llegué».${note}${where}`, url: "/safety", tag: `safety-${t.id}` }, send);
    }
    await sendToUser(t.userId, { title: "¿Has llegado?", body: "Marca «llegué» en LifeOS: tus contactos ya han recibido el aviso.", url: "/safety", tag: `safety-${t.id}` }, send);
    alerted++;
  }
  return alerted;
}

/** Todo lo de la página: mi salida abierta, mis contactos, quién me tiene de contacto y sus salidas. */
export async function safetyOverview(userId: string) {
  const [trip, mine, watching] = await Promise.all([
    prisma.safetyTrip.findFirst({ where: { userId, endedAt: null }, orderBy: { startedAt: "desc" } }),
    prisma.safetyContact.findMany({ where: { userId, status: { not: "REVOKED" } }, include: { contact: { select: { name: true, email: true } } } }),
    prisma.safetyContact.findMany({ where: { contactId: userId, status: { not: "REVOKED" } }, include: { owner: { select: { name: true, email: true } } } }),
  ]);
  const owners = watching.filter((w) => w.status === "ACTIVE").map((w) => w.userId);
  const trips = owners.length ? await prisma.safetyTrip.findMany({ where: { userId: { in: owners }, endedAt: null }, include: { user: { select: { name: true, email: true } } } }) : [];
  return {
    trip: trip ? { id: trip.id, startedAt: trip.startedAt.toISOString(), dueAt: trip.dueAt.toISOString(), alerted: Boolean(trip.alertedAt) } : null,
    contacts: mine.map((c) => ({ id: c.id, status: c.status, name: nameOf(c.contact) })),
    watching: watching.map((w) => ({ id: w.id, status: w.status, name: nameOf(w.owner) })),
    watchingTrips: trips.map((t) => ({ id: t.id, name: nameOf(t.user), startedAt: t.startedAt.toISOString(), dueAt: t.dueAt.toISOString(), overdue: t.dueAt <= new Date() })),
  };
}
