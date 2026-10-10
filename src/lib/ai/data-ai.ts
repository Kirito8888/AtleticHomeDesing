import "server-only";

import { z } from "zod";

import { generateJson, generateText } from "@/lib/ai/llm";
import { assertAiAllowed } from "@/lib/ai/guard";
import { aiAvailable } from "@/lib/ai/provider";
import { notFromStrava, STRAVA } from "@/lib/strava/policy";
import { addDays, dateOnly, today, toIsoDay } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { weekOf } from "@/lib/rules/engine";
import { loadRuleInputs } from "@/lib/rules/rules-service";
import { implementBestsFor } from "@/lib/training/implement-bests-query";
import { summarizeTests } from "@/lib/training/physical-tests";
import { currentRms } from "@/lib/training/rm-service";
import { getPerformanceSeries } from "@/lib/training/service";
import { exerciseOptions } from "@/lib/training/session-queries";
import { matchExercise, parseSpoken, type Spoken, spokenSchema } from "@/lib/training/voice-parse";

const fakeAi = () => process.env.LIFEOS_FAKE_AI === "1";

/**
 * Resumen numérico de TU entrenamiento para la IA: semanas, carga, marcas, RM
 * y tests. Nada de recuperación, ciclo, molestias, notas, nombre ni email.
 */
export async function trainingSummary(userId: string, day = toIsoDay(today())) {
  const from = addDays(dateOnly(day), -55);
  // La forma (CTL/ATL) se calcula con todas las sesiones: si hay de Strava en el periodo, no se envía
  const strava = await prisma.trainingSession.count({ where: { userId, source: STRAVA, date: { gte: from, lte: dateOnly(day) } } });
  const [sessions, perf, bests, rms, tests, rule] = await Promise.all([
    prisma.trainingSession.findMany({ where: { userId, status: "COMPLETED", date: { gte: from, lte: dateOnly(day) }, ...notFromStrava }, select: { date: true, type: true, durationSec: true, sessionRpe: true, tss: true } }),
    getPerformanceSeries(userId, 56),
    implementBestsFor(userId),
    currentRms(userId),
    prisma.testResult.findMany({ where: { userId }, orderBy: { date: "asc" } }),
    loadRuleInputs(userId, day, 56),
  ]);
  const weeks = new Map<string, { semana: string; sesiones: number; minutos: number; cargaSrpe: number; tss: number; lanzamientos: number; porTipo: Record<string, number> }>();
  for (const s of sessions) {
    const w = weekOf(toIsoDay(s.date));
    const e = weeks.get(w) ?? { semana: w, sesiones: 0, minutos: 0, cargaSrpe: 0, tss: 0, lanzamientos: 0, porTipo: {} };
    e.sesiones++;
    e.minutos += Math.round((s.durationSec ?? 0) / 60);
    e.cargaSrpe += Math.round((s.sessionRpe ?? 0) * ((s.durationSec ?? 0) / 60));
    e.tss += Math.round(s.tss ?? 0);
    e.porTipo[s.type] = (e.porTipo[s.type] ?? 0) + 1;
    weeks.set(w, e);
  }
  for (const t of rule.throws) {
    const e = weeks.get(weekOf(t.date));
    if (e) e.lanzamientos += t.throws;
  }
  const cur = perf.current;
  return {
    hoy: day,
    semanas: [...weeks.values()].sort((a, b) => (a.semana < b.semana ? -1 : 1)),
    forma: cur && !strava ? { ctl: Math.round(cur.ctl), atl: Math.round(cur.atl), tsb: Math.round(cur.tsb), acwr: cur.acwr != null ? Math.round(cur.acwr * 100) / 100 : null } : null,
    mejoresMarcas: bests.slice(0, 6).map((b) => ({ implemento: b.label, top3: b.top.map((t) => ({ m: t.markM, fecha: t.date, competicion: t.isCompetition })) })),
    rm: rms.map((r) => ({ ejercicio: r.name, kg: r.kg, porMano: r.perHand })),
    tests: summarizeTests(tests.map((t) => ({ ...t, date: toIsoDay(t.date) }))).map((t) => ({ test: t.name, unidad: t.unit, ultimo: t.last.value, mejor: t.best.value, cambioPct: t.changePct })),
  };
}

const ASK_SYSTEM = `Eres el asistente de datos de un atleta. Respondes en español, breve (máximo 8 frases) y concreto,
usando SOLO los datos JSON que se te dan. Si la respuesta no está en los datos, dilo. Cita cifras y fechas.
No hagas diagnósticos médicos ni recomiendes medicación. Si te preguntan por salud o lesiones, di que esos datos no se comparten contigo.`;

export async function askTrainingData(userId: string, question: string): Promise<{ answer: string; model: string }> {
  const data = await trainingSummary(userId);
  if (fakeAi()) {
    const total = data.semanas.reduce((a, w) => a + w.sesiones, 0);
    const best = data.mejoresMarcas[0];
    return {
      answer: `En las últimas 8 semanas registraste ${total} sesiones${best ? `; tu mejor marca con ${best.implemento} es ${best.top3[0].m} m` : ""}. (Respuesta simulada: «${question.slice(0, 60)}»)`,
      model: "simulado",
    };
  }
  await assertAiAllowed(userId);
  const r = await generateText({ userId, system: ASK_SYSTEM, messages: [{ role: "user", text: `DATOS:\n${JSON.stringify(data)}\n\nPREGUNTA: ${question}` }], temperature: 0.2 });
  return { answer: r.text, model: r.model };
}

const VOICE_SYSTEM = `Conviertes lo que dicta un atleta sobre su sesión de fuerza en JSON. Un elemento por ejercicio con series,
repeticiones, kg (null si no lo dice) y RIR (null si no lo dice). durationMin y rpe de la sesión si los dice. No inventes nada.`;

export type VoiceDraft = { durationMin: number | null; rpe: number | null; blocks: Array<{ exerciseId: string; exercise: string; sets: number; reps: number; kg: number | null; rir: number | null }>; unmatched: string[]; source: "ia" | "local" };

/** Dictado → borrador del formulario. Con IA (si está autorizada) o con el parser local. Solo el texto: el audio no sale del móvil. */
export async function voiceToDraft(userId: string, text: string): Promise<VoiceDraft> {
  let spoken: Spoken;
  let source: VoiceDraft["source"] = "local";
  const consent = await prisma.user.findUnique({ where: { id: userId }, select: { aiConsentAt: true, processingRestrictedAt: true } });
  if (!fakeAi() && consent?.aiConsentAt && !consent.processingRestrictedAt && (await aiAvailable(userId))) {
    try {
      spoken = (await generateJson(spokenSchema, { userId, system: VOICE_SYSTEM, prompt: text, temperature: 0 })).data;
      source = "ia";
    } catch {
      spoken = parseSpoken(text);
    }
  } else spoken = parseSpoken(text);
  const catalog = (await exerciseOptions(userId)).map((e) => ({ id: e.id, name: e.name }));
  const blocks: VoiceDraft["blocks"] = [];
  const unmatched: string[] = [];
  for (const it of spoken.items) {
    const ex = matchExercise(it.exercise, catalog);
    if (ex) blocks.push({ exerciseId: ex.id, exercise: ex.name, sets: it.sets, reps: it.reps, kg: it.kg, rir: it.rir });
    else unmatched.push(it.exercise);
  }
  return { durationMin: spoken.durationMin, rpe: spoken.rpe, blocks, unmatched, source };
}

export const askSchema = z.object({ question: z.string().trim().min(3).max(500) });
export const voiceSchema = z.object({ text: z.string().trim().min(3).max(2000) });
