// Progreso del Modo Juego sincronizado entre dispositivos (puro). Se guarda por usuaria y asignatura en `QuestProgress`.
import { MAX_APPEALS, MAX_EXAMS, parseQuest, type Appeal, type ExamAttempt, type QuestState } from "./quest";

/** Estado válido a partir de cualquier valor (lo que llegue por la red o esté guardado): nunca lanza. */
export const sanitizeQuest = (v: unknown): QuestState => parseQuest(JSON.stringify(v ?? null));

/**
 * Une dos partidas sin perder nada de ninguna: lo mejor de cada nivel, todos los fallos y apelaciones pendientes y el historial de
 * exámenes. Sirve la primera vez que un dispositivo con progreso local se conecta, o tras un conflicto de versión.
 * `a` manda en lo que no se puede unir (modo libre, tutorial visto).
 */
export function mergeQuest(a: QuestState, b: QuestState): QuestState {
  const lv: QuestState["lv"] = {};
  for (const id of new Set([...Object.keys(a.lv), ...Object.keys(b.lv)])) {
    const x = a.lv[id];
    const y = b.lv[id];
    const best = Math.max(x?.best ?? -1, y?.best ?? -1);
    lv[id] = { stars: Math.max(x?.stars ?? 0, y?.stars ?? 0), ...(best >= 0 ? { best } : {}) };
  }
  const out: QuestState = { xp: Math.max(a.xp, b.xp), lv, fails: [...new Set([...a.fails, ...b.fails])], free: a.free };
  if (a.seen || b.seen) out.seen = true;
  const key = (x: Appeal) => `${x.q}\u0000${x.ans}`;
  const appeals = [...new Map([...(a.appeals ?? []), ...(b.appeals ?? [])].map((x) => [key(x), x])).values()].slice(0, MAX_APPEALS);
  if (appeals.length) out.appeals = appeals;
  const exams = [...new Map([...(a.exams ?? []), ...(b.exams ?? [])].map((x) => [x.at, x] as [string, ExamAttempt])).values()].sort((x, y) => (x.at < y.at ? 1 : -1)).slice(0, MAX_EXAMS);
  if (exams.length) out.exams = exams;
  return out;
}

/** ¿Hay algo que merezca la pena sincronizar? (una partida vacía no pisa nada). */
export const hasProgress = (s: QuestState) => s.xp > 0 || Object.keys(s.lv).length > 0 || s.fails.length > 0 || !!s.appeals?.length || !!s.exams?.length;
