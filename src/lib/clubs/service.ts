import "server-only";

import type { CoachScope, OrgRole } from "@/generated/prisma/enums";
import { ApiError } from "@/lib/api";
import type { CurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { type AuditContext, recordEvent } from "@/lib/security/audit";

import { parseAmount } from "./fees";

const isoToDate = (d: string) => new Date(`${d}T00:00:00Z`);

/** Membresía ACTIVE del usuario en el club con uno de los roles; si no, 404 (no se revela si el club existe). */
export async function requireOrgRole(userId: string, orgId: string, roles: OrgRole[]) {
  const m = await prisma.orgMember.findUnique({ where: { orgId_userId: { orgId, userId } } });
  if (!m || m.status !== "ACTIVE" || !roles.includes(m.role)) throw new ApiError(404, "Club no encontrado");
  return m;
}

export async function createOrg(user: CurrentUser, name: string) {
  if (user.role !== "COACH" && user.role !== "ADMIN") throw new ApiError(403, "Solo una entrenadora puede crear un club");
  return prisma.organization.create({
    data: { name, createdById: user.id, members: { create: { userId: user.id, role: "ADMIN", status: "ACTIVE", acceptedAt: new Date() } } },
  });
}

/** Invita por email. Mismo 404 genérico exista o no el email. El staff del club exige rol global COACH/ADMIN. */
export async function inviteMember(user: CurrentUser, orgId: string, email: string, role: OrgRole) {
  await requireOrgRole(user.id, orgId, ["ADMIN"]);
  const target = await prisma.user.findUnique({ where: { email }, select: { id: true, role: true } });
  if (!target || target.id === user.id) throw new ApiError(404, "No se pudo enviar la invitación");
  if (role !== "ATHLETE" && target.role === "ATHLETE") throw new ApiError(404, "No se pudo enviar la invitación");
  try {
    return await prisma.orgMember.create({ data: { orgId, userId: target.id, role, invitedById: user.id } });
  } catch {
    throw new ApiError(404, "No se pudo enviar la invitación");
  }
}

/** La propia persona acepta (con los ámbitos que concede) o ajusta; el ADMIN del club solo cambia el rol. */
export async function updateMember(
  user: CurrentUser,
  orgId: string,
  memberId: string,
  data: { status?: "ACTIVE"; scopes?: CoachScope[]; canPlan?: boolean; role?: OrgRole },
  ctx: AuditContext = {},
) {
  const m = await prisma.orgMember.findFirst({ where: { id: memberId, orgId } });
  if (!m) throw new ApiError(404, "No encontrado");
  const own = m.userId === user.id;
  if ((data.status || data.scopes || data.canPlan !== undefined) && !own) throw new ApiError(403, "Solo la propia persona acepta o concede permisos");
  if (data.role) {
    await requireOrgRole(user.id, orgId, ["ADMIN"]);
    if (own && m.role === "ADMIN" && data.role !== "ADMIN") {
      const admins = await prisma.orgMember.count({ where: { orgId, role: "ADMIN", status: "ACTIVE" } });
      if (admins < 2) throw new ApiError(409, "Debe quedar al menos una administradora");
    }
  } else if (!own) throw new ApiError(403, "Sin permiso");
  const updated = await prisma.orgMember.update({
    where: { id: m.id },
    data: {
      role: data.role,
      status: data.status,
      scopes: data.scopes ? [...new Set(data.scopes)] : undefined,
      canPlan: data.canPlan,
      acceptedAt: data.status === "ACTIVE" && !m.acceptedAt ? new Date() : undefined,
    },
  });
  // v2.2 · Auditoría de club: solo lo que concede la propia persona (aceptar, ámbitos, planificar). Va a su Actividad.
  if (own && (data.status || data.scopes || data.canPlan !== undefined)) {
    const parts = [data.status ? "invitación aceptada" : null, data.scopes ? `ámbitos: ${updated.scopes.join(", ") || "ninguno"}` : null, data.canPlan !== undefined ? `planificar: ${updated.canPlan ? "sí" : "no"}` : null];
    await recordEvent(user.id, "COACH_SCOPES_CHANGED", ctx, `${await clubLabel(orgId)} · ${parts.filter(Boolean).join(" · ")}`);
  }
  return updated;
}

async function clubLabel(orgId: string) {
  const o = await prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } });
  return `Club «${o?.name ?? "?"}»`;
}

/** Salir/rechazar (la propia persona) o expulsar (ADMIN del club). */
export async function removeMember(user: CurrentUser, orgId: string, memberId: string, ctx: AuditContext = {}) {
  const m = await prisma.orgMember.findFirst({ where: { id: memberId, orgId } });
  if (!m) throw new ApiError(404, "No encontrado");
  if (m.userId !== user.id) await requireOrgRole(user.id, orgId, ["ADMIN"]);
  else if (m.role === "ADMIN" && m.status === "ACTIVE" && (await prisma.orgMember.count({ where: { orgId, role: "ADMIN", status: "ACTIVE" } })) < 2) {
    throw new ApiError(409, "Debe quedar al menos una administradora");
  }
  await prisma.orgMember.delete({ where: { id: m.id } });
  // v2.2 · Auditoría: salir/rechazar o ser expulsada deja huella en la Actividad de la persona afectada.
  const what = m.userId === user.id ? (m.status === "ACTIVE" ? "has salido del club" : "invitación rechazada") : "expulsada por la administración del club";
  await recordEvent(m.userId, "COACH_SCOPES_CHANGED", m.userId === user.id ? ctx : {}, `${await clubLabel(orgId)} · ${what}`);
}

/** Cuotas: las ve el ADMIN del club (todas) o la atleta (las suyas). El COACH no: no son datos deportivos. */
export async function listFees(user: CurrentUser, orgId: string) {
  const me = await prisma.orgMember.findUnique({ where: { orgId_userId: { orgId, userId: user.id } } });
  if (!me || me.status !== "ACTIVE") throw new ApiError(404, "Club no encontrado");
  if (me.role === "COACH") return [];
  return prisma.orgFee.findMany({
    where: { orgId, ...(me.role === "ADMIN" ? {} : { memberId: me.id }) },
    orderBy: { dueDate: "desc" },
    include: { member: { select: { user: { select: { name: true, email: true } } } } },
  });
}

export async function recordFee(user: CurrentUser, orgId: string, input: { memberId: string; concept: string; amount: string; dueDate: string }) {
  await requireOrgRole(user.id, orgId, ["ADMIN"]);
  const member = await prisma.orgMember.findFirst({ where: { id: input.memberId, orgId, role: "ATHLETE" } });
  if (!member) throw new ApiError(404, "Atleta no encontrada en este club");
  const amountCents = parseAmount(input.amount);
  if (!amountCents) throw new ApiError(422, "Importe no válido");
  return prisma.orgFee.create({
    data: { orgId, memberId: member.id, concept: input.concept, amountCents, dueDate: isoToDate(input.dueDate), recordedById: user.id },
  });
}

export async function setFeeStatus(user: CurrentUser, orgId: string, feeId: string, status: "PENDING" | "PAID", paidAt?: string) {
  await requireOrgRole(user.id, orgId, ["ADMIN"]);
  const fee = await prisma.orgFee.findFirst({ where: { id: feeId, orgId } });
  if (!fee) throw new ApiError(404, "No encontrado");
  return prisma.orgFee.update({
    where: { id: fee.id },
    data: { status, paidAt: status === "PAID" ? isoToDate(paidAt ?? new Date().toISOString().slice(0, 10)) : null },
  });
}
