import "server-only";

import { z } from "zod";

import { ApiError } from "@/lib/api";
import { addDays, dateOnly, isoDate, toIsoDay } from "@/lib/dates";
import { formatNum, SESSION_TYPE_LABEL } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { assertNotRestricted, isRestricted } from "@/lib/privacy/service";
import { BODY_AREA_LABEL } from "@/lib/recovery/injury-rules";
import { weekOf } from "@/lib/rules/engine";
import { loadRuleInputs } from "@/lib/rules/rules-service";
import { hashShareToken, isShareToken, newShareToken } from "@/lib/security/share-token";
import { implementBests } from "@/lib/training/implement-bests";

import { type ReportData, renderReport } from "./render";

const VALID_DAYS = 7;
const MAX_ACTIVE = 10;

export const createReportSchema = z
  .object({ from: isoDate, to: isoDate, includeInjuries: z.boolean().default(false) })
  .refine((r) => r.from <= r.to, "La fecha de inicio debe ser anterior al fin")
  .refine((r) => (Date.parse(r.to) - Date.parse(r.from)) / 864e5 <= 120, "Como mucho 120 días");

/** Crea el enlace (caduca a los 7 días). El token solo se devuelve aquí. */
export async function createReport(userId: string, input: z.infer<typeof createReportSchema>): Promise<{ token: string; expiresAt: Date }> {
  await assertNotRestricted(userId, "crear enlaces para compartir");
  const active = await prisma.sharedReport.count({ where: { userId, expiresAt: { gt: new Date() } } });
  if (active >= MAX_ACTIVE) throw new ApiError(400, `Ya tienes ${MAX_ACTIVE} enlaces activos: revoca alguno`);
  const { token, hash } = newShareToken();
  const expiresAt = new Date(Date.now() + VALID_DAYS * 864e5);
  await prisma.sharedReport.create({ data: { userId, tokenHash: hash, from: dateOnly(input.from), to: dateOnly(input.to), includeInjuries: input.includeInjuries, expiresAt } });
  return { token, expiresAt };
}

export async function listReports(userId: string) {
  return prisma.sharedReport.findMany({
    where: { userId, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: { id: true, from: true, to: true, includeInjuries: true, expiresAt: true },
  });
}

export async function revokeReport(userId: string, id: string) {
  const { count } = await prisma.sharedReport.deleteMany({ where: { id, userId } });
  if (!count) throw new ApiError(404, "Enlace no encontrado");
}

/** HTML del informe, o null si el token no existe, caducó o fue revocado. */
export async function reportHtml(token: string, now = new Date()): Promise<string | null> {
  if (!isShareToken(token)) return null;
  const r = await prisma.sharedReport.findUnique({ where: { tokenHash: hashShareToken(token) } });
  if (!r || r.expiresAt <= now || (await isRestricted(r.userId))) return null;
  return renderReport(await reportData(r.userId, toIsoDay(r.from), toIsoDay(r.to), r.includeInjuries, r.expiresAt));
}

async function reportData(userId: string, from: string, to: string, includeInjuries: boolean, expiresAt: Date): Promise<ReportData> {
  const range = { gte: dateOnly(from), lte: dateOnly(to) };
  const [user, sessions, attempts, controls, injuries, ruleInputs] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true } }),
    prisma.trainingSession.findMany({
      where: { userId, date: range },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      select: { date: true, title: true, status: true, type: true, technical: { select: { bestMarkM: true } } },
    }),
    prisma.technicalAttempt.findMany({
      where: { isFoul: false, markM: { gt: 0 }, technicalSession: { session: { userId, status: "COMPLETED", date: range } } },
      select: { markM: true, technicalSession: { select: { event: true, implementWeightG: true, isCompetition: true, session: { select: { date: true } } } } },
    }),
    // Solo los controles deportivos: ni peso, ni grasa, ni VFC, ni notas.
    prisma.recoveryMetrics.findMany({
      where: { userId, date: range, OR: [{ squeezePain: { not: null } }, { heelPain: { not: null } }, { jumpCm: { not: null } }] },
      orderBy: { date: "asc" },
      select: { date: true, squeezePain: true, heelPain: true, jumpCm: true },
    }),
    includeInjuries
      ? prisma.injury.findMany({
          where: { userId, startedOn: { lte: range.lte }, OR: [{ resolvedOn: null }, { resolvedOn: { gte: range.gte } }] },
          orderBy: { startedOn: "asc" },
          select: { area: true, pain: true, startedOn: true, resolvedOn: true },
        })
      : Promise.resolve(null),
    loadRuleInputs(userId, to, Math.round((Date.parse(to) - Date.parse(from)) / 864e5) + 1),
  ]);
  const weeks = new Map<string, ReportData["weeks"][number]>();
  for (let d = weekOf(from); d <= to; d = toIsoDay(addDays(dateOnly(d), 7))) weeks.set(d, { week: d, planned: 0, done: 0, skipped: 0, throws: 0 });
  for (const s of sessions) {
    const w = weeks.get(weekOf(toIsoDay(s.date)));
    if (!w) continue;
    if (s.status === "COMPLETED") w.done++;
    else if (s.status === "SKIPPED") w.skipped++;
    else w.planned++;
  }
  for (const t of ruleInputs.throws) {
    const w = weeks.get(weekOf(t.date));
    if (w && t.date >= from) w.throws += t.throws;
  }
  const bests = implementBests(
    attempts.map((a) => ({
      date: toIsoDay(a.technicalSession.session.date),
      event: a.technicalSession.event,
      implementWeightG: a.technicalSession.implementWeightG,
      markM: a.markM!,
      isCompetition: a.technicalSession.isCompetition,
    })),
  );
  return {
    athlete: user.name?.split(" ")[0] || "atleta",
    from,
    to,
    expiresAt: toIsoDay(expiresAt),
    weeks: [...weeks.values()],
    // Títulos sin «(versión suave)»: podría delatar síntomas.
    sessions: sessions.map((s) => ({
      date: toIsoDay(s.date),
      title: (s.title ?? SESSION_TYPE_LABEL[s.type]).replace(/\s*\(versión suave\)\s*/gi, " ").trim(),
      status: s.status,
      type: s.type,
      best: s.technical?.bestMarkM != null ? `${formatNum(s.technical.bestMarkM, 2)} m` : null,
    })),
    marks: bests.map((b) => ({ label: b.label, top: b.top })),
    controls: controls.map((c) => ({ date: toIsoDay(c.date), squeeze: c.squeezePain, heel: c.heelPain, jumpCm: c.jumpCm })),
    injuries: injuries
      ? injuries.map((i) => ({ area: BODY_AREA_LABEL[i.area as keyof typeof BODY_AREA_LABEL] ?? i.area, pain: i.pain, since: toIsoDay(i.startedOn), resolved: i.resolvedOn ? toIsoDay(i.resolvedOn) : null }))
      : null,
  };
}
