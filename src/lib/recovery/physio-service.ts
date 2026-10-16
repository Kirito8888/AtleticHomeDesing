import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api";
import { type CurrentUser, resolveAthleteId } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { notifyOnce } from "@/lib/push/service";

import { completion, currentPhase, normalizeProgress, type PhysioPhases, physioPhasesSchema } from "./physio-protocol";

type BodyArea = NonNullable<Prisma.PhysioProtocolCreateInput["area"]>;
export interface ProtocolInput {
  title: string;
  area?: BodyArea | null;
  notes?: string | null;
  phases: unknown;
}

const json = (v: unknown) => v as Prisma.InputJsonValue;
const phasesOf = (raw: unknown): PhysioPhases => physioPhasesSchema.parse(raw);

function requireCoach(user: CurrentUser) {
  // Una fisio usa cuenta de entrenadora. La ADMIN global no crea ni comparte (como en v2.0 B).
  if (user.role !== "COACH") throw new ApiError(403, "Solo una entrenadora o fisio puede gestionar protocolos");
}

async function ownProtocol(user: CurrentUser, id: string) {
  const p = await prisma.physioProtocol.findFirst({ where: { id, ownerId: user.id } });
  if (!p) throw new ApiError(404, "Protocolo no encontrado");
  return p;
}

export async function createProtocol(user: CurrentUser, input: ProtocolInput) {
  requireCoach(user);
  const phases = phasesOf(input.phases);
  return prisma.physioProtocol.create({ data: { ownerId: user.id, title: input.title, area: input.area ?? null, notes: input.notes ?? null, phases: json(phases) }, select: { id: true } });
}

export async function updateProtocol(user: CurrentUser, id: string, input: Partial<ProtocolInput>) {
  requireCoach(user);
  await ownProtocol(user, id);
  return prisma.physioProtocol.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.area !== undefined ? { area: input.area } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.phases !== undefined ? { phases: json(phasesOf(input.phases)) } : {}),
    },
    select: { id: true },
  });
}

export async function deleteProtocol(user: CurrentUser, id: string) {
  await ownProtocol(user, id);
  await prisma.physioProtocol.delete({ where: { id } });
}

/** Mis protocolos (dueña) con el nº de atletas a las que se han compartido. */
export async function listOwn(user: CurrentUser) {
  requireCoach(user);
  const rows = await prisma.physioProtocol.findMany({ where: { ownerId: user.id }, orderBy: { updatedAt: "desc" }, include: { _count: { select: { shares: true } } } });
  return rows.map((p) => ({ id: p.id, title: p.title, area: p.area, phases: phasesOf(p.phases).length, shares: p._count.shares }));
}

/** Protocolo completo (solo la dueña) con el seguimiento de cada atleta; si ya no tiene acceso, se muestra bloqueado y sin datos. */
export async function getOwn(user: CurrentUser, id: string) {
  requireCoach(user);
  const p = await ownProtocol(user, id);
  const phases = phasesOf(p.phases);
  const shares = await prisma.physioProtocolShare.findMany({ where: { protocolId: id }, include: { athlete: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: "asc" } });
  const out = [];
  for (const s of shares) {
    try {
      await resolveAthleteId(user, s.athleteId, "RECOVERY");
    } catch {
      out.push({ shareId: s.id, athleteId: s.athleteId, athlete: s.athlete.name ?? s.athlete.email, blocked: true as const });
      continue;
    }
    const progress = normalizeProgress(phases, s.progress);
    out.push({
      shareId: s.id,
      athleteId: s.athleteId,
      athlete: s.athlete.name ?? s.athlete.email,
      blocked: false as const,
      progress,
      painToday: s.painToday,
      phase: currentPhase(phases, progress),
      ...completion(phases, progress),
      updatedAt: s.updatedAt.toISOString(),
    });
  }
  return { id: p.id, title: p.title, area: p.area, notes: p.notes, phases, shares: out };
}

/** Comparte en lectura/seguimiento. Exige vínculo activo + ámbito RECOVERY; `processingRestrictedAt` bloquea (resolveAthleteId). */
export async function shareProtocol(user: CurrentUser, id: string, athleteId: string) {
  requireCoach(user);
  await ownProtocol(user, id);
  if (athleteId === user.id) throw new ApiError(400, "No puedes compartirte un protocolo a ti misma");
  await resolveAthleteId(user, athleteId, "RECOVERY");
  const phases = phasesOf((await ownProtocol(user, id)).phases);
  const row = await prisma.physioProtocolShare.upsert({
    where: { protocolId_athleteId: { protocolId: id, athleteId } },
    create: { protocolId: id, athleteId, sharedById: user.id, progress: json(normalizeProgress(phases, null)) },
    update: {},
    select: { id: true },
  });
  // v2.2 · Aviso a la atleta (push/Telegram, sin email). Texto genérico: ni título ni zona del protocolo.
  // Una vez por compartido (clave con su id); si el aviso falla, el compartido sigue valiendo.
  await notifyOnce(athleteId, `physio-share:${row.id}`, { title: "Atlenza", body: "Tu entrenadora ha compartido contigo un protocolo de recuperación.", url: "/recovery/fisio", tag: "health-physio" }).catch(() => false);
  return row;
}

/** Quitar el acceso borra el seguimiento de la atleta en este protocolo. */
export async function unshareProtocol(user: CurrentUser, id: string, athleteId: string) {
  requireCoach(user);
  await ownProtocol(user, id);
  await prisma.physioProtocolShare.deleteMany({ where: { protocolId: id, athleteId } });
}

/** Atletas que la entrenadora puede ver en RECOVERY (para el selector de compartir). */
export async function shareableAthletes(user: CurrentUser) {
  requireCoach(user);
  const [links, members] = await Promise.all([
    prisma.coachAthlete.findMany({ where: { coachId: user.id, status: "ACTIVE" }, select: { athleteId: true } }),
    prisma.orgMember.findMany({ where: { role: "ATHLETE", status: "ACTIVE", org: { members: { some: { userId: user.id, role: { in: ["ADMIN", "COACH"] }, status: "ACTIVE" } } } }, select: { userId: true } }),
  ]);
  const ids = [...new Set([...links.map((l) => l.athleteId), ...members.map((m) => m.userId)])];
  const ok: string[] = [];
  for (const athleteId of ids) {
    try {
      await resolveAthleteId(user, athleteId, "RECOVERY");
      ok.push(athleteId);
    } catch {
      /* sin ámbito o con tratamiento limitado: no se ofrece */
    }
  }
  const users = await prisma.user.findMany({ where: { id: { in: ok } }, select: { id: true, name: true, email: true } });
  return users.map((u) => ({ id: u.id, name: u.name ?? u.email }));
}

/** Atleta: protocolos que le han compartido. */
export async function listShared(user: CurrentUser) {
  const rows = await prisma.physioProtocolShare.findMany({ where: { athleteId: user.id }, include: { protocol: { include: { owner: { select: { name: true, email: true } } } } }, orderBy: { updatedAt: "desc" } });
  return rows.map((s) => {
    const phases = phasesOf(s.protocol.phases);
    const progress = normalizeProgress(phases, s.progress);
    return { shareId: s.id, title: s.protocol.title, area: s.protocol.area, owner: s.protocol.owner.name ?? s.protocol.owner.email, phase: currentPhase(phases, progress), phases: phases.length, ...completion(phases, progress) };
  });
}

/** Atleta: ve el contenido (solo lectura) y su seguimiento. Quien no es la destinataria: 404. */
export async function getShared(user: CurrentUser, shareId: string) {
  const s = await prisma.physioProtocolShare.findFirst({ where: { id: shareId, athleteId: user.id }, include: { protocol: { include: { owner: { select: { name: true, email: true } } } } } });
  if (!s) throw new ApiError(404, "Protocolo no encontrado");
  const phases = phasesOf(s.protocol.phases);
  const progress = normalizeProgress(phases, s.progress);
  return {
    shareId: s.id,
    title: s.protocol.title,
    area: s.protocol.area,
    notes: s.protocol.notes,
    owner: s.protocol.owner.name ?? s.protocol.owner.email,
    phases,
    progress,
    painToday: s.painToday,
    phase: currentPhase(phases, progress),
    ...completion(phases, progress),
  };
}

/** Atleta: marca criterios y dolor del día. No toca el contenido del protocolo. */
export async function updateShared(user: CurrentUser, shareId: string, input: { progress?: unknown; painToday?: number | null }) {
  const s = await prisma.physioProtocolShare.findFirst({ where: { id: shareId, athleteId: user.id }, include: { protocol: { select: { phases: true } } } });
  if (!s) throw new ApiError(404, "Protocolo no encontrado");
  const phases = phasesOf(s.protocol.phases);
  await prisma.physioProtocolShare.update({
    where: { id: shareId },
    data: {
      ...(input.progress !== undefined ? { progress: json(normalizeProgress(phases, input.progress)) } : {}),
      ...(input.painToday !== undefined ? { painToday: input.painToday } : {}),
    },
  });
  return getShared(user, shareId);
}
