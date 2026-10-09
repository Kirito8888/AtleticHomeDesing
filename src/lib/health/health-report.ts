import "server-only";

import { z } from "zod";

import { ApiError } from "@/lib/api";
import { addDays, dateOnly, toIsoDay } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { assertNotRestricted, isRestricted } from "@/lib/privacy/service";
import { BODY_AREA_LABEL } from "@/lib/recovery/injury-rules";
import { esc } from "@/lib/report/render";
import { hashShareToken, isShareToken, newShareToken } from "@/lib/security/share-token";

import { SYMPTOMS } from "./cycle";
import { getCycle } from "./cycle-service";
import { LAB_MARKERS, PELVIC_SYMPTOMS, postpartumStatus, screenResult } from "./women";
import { completedCycles } from "./women-plus";
import { getWomen } from "./women-service";

const VALID_DAYS = 7;
const MAX_ACTIVE = 5;
export const healthReportSchema = z.object({ kind: z.enum(["MEDICAL", "PHYSIO"]) });

/**
 * Enlaces temporales para la médica (ciclo, analíticas, cribados) o el fisio (molestias,
 * vuelta por fases y carga). Los crea su dueña/dueño; en la BD solo el hash del token.
 * El contenido se descifra al servirlo y nunca lo ve la entrenadora.
 */
export async function createHealthReport(userId: string, kind: "MEDICAL" | "PHYSIO") {
  await assertNotRestricted(userId, "crear enlaces para compartir");
  const active = await prisma.healthReport.count({ where: { userId, revokedAt: null, expiresAt: { gt: new Date() } } });
  if (active >= MAX_ACTIVE) throw new ApiError(400, `Ya tienes ${MAX_ACTIVE} enlaces activos: revoca alguno`);
  const { token, hash } = newShareToken();
  const expiresAt = new Date(Date.now() + VALID_DAYS * 864e5);
  await prisma.healthReport.create({ data: { userId, kind, tokenHash: hash, expiresAt } });
  return { token, expiresAt };
}

export const listHealthReports = (userId: string) =>
  prisma.healthReport.findMany({ where: { userId, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" }, select: { id: true, kind: true, expiresAt: true } });

export async function revokeHealthReport(userId: string, id: string) {
  const { count } = await prisma.healthReport.updateMany({ where: { id, userId, revokedAt: null }, data: { revokedAt: new Date() } });
  if (!count) throw new ApiError(404, "Enlace no encontrado");
}

const page = (title: string, who: string, expires: string, body: string) => `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title><style>
body{font:15px/1.5 system-ui,sans-serif;margin:0 auto;max-width:860px;padding:16px;color:#111;background:#fff}
h1{font-size:1.4rem;margin:.2rem 0}h2{font-size:1.1rem;margin-top:1.6rem}
table{border-collapse:collapse;width:100%;font-size:.9rem;display:block;overflow-x:auto}th,td{border-bottom:1px solid #ddd;padding:4px 8px;text-align:left;white-space:nowrap}
.muted{color:#666;font-size:.85rem}
@media (prefers-color-scheme:dark){body{background:#111;color:#eee}th,td{border-color:#333}.muted{color:#aaa}}
</style></head><body><h1>${esc(title)}: ${esc(who)}</h1><p class="muted">Enlace de solo lectura compartido por la propia persona; caduca el ${esc(expires)}. Datos registrados por ella en LifeOS: orientativos, no son un informe clínico.</p>${body}</body></html>`;
const table = (head: string[], rows: string[][]) =>
  rows.length ? `<table><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</table>` : `<p class="muted">Sin datos.</p>`;

async function medicalBody(userId: string, today: string) {
  const [{ settings, logs }, women] = await Promise.all([getCycle(userId, 400), getWomen(userId)]);
  const parts: string[] = [];
  const cycles = completedCycles(settings, logs);
  parts.push(`<h2>Ciclo menstrual</h2>`);
  parts.push(
    settings
      ? `<p>Duración media declarada ${settings.avgLength} días · regla ${settings.periodDays} días · anticonceptivo hormonal: ${settings.hormonal === "si" ? "sí" : settings.hormonal === "no" ? "no" : "no indicado"}.</p>`
      : `<p class="muted">Sin ajustes del ciclo.</p>`,
  );
  parts.push(table(["Inicio", "Duración (días)"], cycles.slice(-8).map((c) => [c.start, String(c.length)])));
  const freq = new Map<string, number>();
  for (const l of logs) for (const s of l.symptoms) freq.set(s, (freq.get(s) ?? 0) + 1);
  if (freq.size) parts.push(`<p>Síntomas registrados (días): ${[...freq].map(([k, n]) => `${esc(SYMPTOMS[k as keyof typeof SYMPTOMS] ?? k)} ${n}`).join(" · ")}</p>`);
  const labs = women.logs.filter((l) => l.kind === "LAB");
  parts.push(`<h2>Analíticas</h2>`);
  parts.push(
    table(
      ["Fecha", ...Object.values(LAB_MARKERS).map((m) => `${m.label} (${m.unit})`)],
      labs.map((l) => [l.date, ...Object.keys(LAB_MARKERS).map((k) => (l.kind === "LAB" && l.values[k as keyof typeof LAB_MARKERS] != null ? String(l.values[k as keyof typeof LAB_MARKERS]) : "—"))]),
    ),
  );
  parts.push(`<h2>Cribados</h2>`);
  const screens = women.logs.filter((l) => l.kind === "SCREEN");
  parts.push(table(["Fecha", "Cribado de RED-S (orientativo)"], screens.map((x) => [x.date, x.kind === "SCREEN" ? { red: "señal de alarma", amber: "vigilar", ok: "sin señales" }[screenResult(x.answers).level] : ""])));
  const bones = women.logs.filter((l) => l.kind === "BONE");
  if (bones.length) parts.push(table(["Fecha", "Fracturas de estrés previas", "Raciones de calcio/día"], bones.map((b) => (b.kind === "BONE" ? [b.date, String(b.stressFractures), String(b.calciumServings)] : []))));
  const pelvic = women.logs.filter((l) => l.kind === "PELVIC");
  if (pelvic.length) {
    parts.push(`<h2>Suelo pélvico</h2>`);
    parts.push(table(["Fecha", "Síntomas"], pelvic.map((p) => (p.kind === "PELVIC" ? [p.date, p.symptoms.map((s) => PELVIC_SYMPTOMS[s]).join(", ")] : []))));
  }
  const pp = women.settings.mode === "POSTPARTUM" ? postpartumStatus(women.settings, today) : null;
  if (pp) parts.push(`<h2>Posparto</h2><p>Semana ${pp.weeks} · fase ${pp.phase + 1}: ${esc(pp.title)}.</p>`);
  return parts.join("");
}

async function physioBody(userId: string, today: string) {
  const from = addDays(dateOnly(today), -56);
  const [injuries, sessions] = await Promise.all([
    prisma.injury.findMany({ where: { userId, OR: [{ resolvedOn: null }, { resolvedOn: { gte: from } }] }, orderBy: { startedOn: "asc" }, include: { protocol: true } }),
    prisma.trainingSession.findMany({ where: { userId, status: "COMPLETED", date: { gte: from } }, select: { date: true, durationSec: true, sessionRpe: true, zoneFatigue: true } }),
  ]);
  const parts: string[] = [`<h2>Molestias y lesiones</h2>`];
  parts.push(
    table(
      ["Zona", "Dolor (0-10)", "Desde", "Resuelta", "Limita"],
      injuries.map((i) => [BODY_AREA_LABEL[i.area as keyof typeof BODY_AREA_LABEL] ?? i.area, String(i.pain), toIsoDay(i.startedOn), i.resolvedOn ? toIsoDay(i.resolvedOn) : "no", i.limitsTraining ? "sí" : "no"]),
    ),
  );
  for (const i of injuries.filter((x) => x.protocol)) {
    const phases = i.protocol!.phases as Array<{ name: string }>;
    parts.push(`<p>Vuelta por fases (${esc(BODY_AREA_LABEL[i.area as keyof typeof BODY_AREA_LABEL] ?? i.area)}): fase ${i.protocol!.current + 1} de ${phases.length}, «${esc(phases[i.protocol!.current]?.name ?? "")}».</p>`);
  }
  const weeks = new Map<string, number>();
  for (const s of sessions) {
    const d = dateOnly(toIsoDay(s.date));
    const monday = toIsoDay(addDays(d, -((d.getUTCDay() + 6) % 7)));
    weeks.set(monday, (weeks.get(monday) ?? 0) + (s.sessionRpe ?? 0) * Math.round((s.durationSec ?? 0) / 60));
  }
  parts.push(`<h2>Carga semanal (sRPE, 8 semanas)</h2>`);
  parts.push(table(["Semana del", "Carga (UA)"], [...weeks].sort(([a], [b]) => a.localeCompare(b)).map(([w, v]) => [w, String(v)])));
  const zones = new Map<string, number[]>();
  for (const s of sessions) for (const [z, v] of Object.entries((s.zoneFatigue as Record<string, number>) ?? {})) zones.set(z, [...(zones.get(z) ?? []), v]);
  if (zones.size) {
    parts.push(`<h2>Fatiga por zona (media 8 semanas, 0-10)</h2>`);
    parts.push(table(["Zona", "Media", "Sesiones"], [...zones].map(([z, v]) => [z, (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1), String(v.length)])));
  }
  return parts.join("");
}

/** HTML del enlace, o null si no existe, caducó o se revocó. */
export async function healthReportHtml(token: string, now = new Date()): Promise<string | null> {
  if (!isShareToken(token)) return null;
  const r = await prisma.healthReport.findUnique({ where: { tokenHash: hashShareToken(token) }, include: { user: { select: { name: true } } } });
  if (!r || r.revokedAt || r.expiresAt <= now || (await isRestricted(r.userId))) return null;
  const today = toIsoDay(now);
  const who = r.user.name ?? "LifeOS";
  const expires = toIsoDay(r.expiresAt);
  return r.kind === "MEDICAL" ? page("Resumen para tu médica", who, expires, await medicalBody(r.userId, today)) : page("Resumen para el fisio", who, expires, await physioBody(r.userId, today));
}
