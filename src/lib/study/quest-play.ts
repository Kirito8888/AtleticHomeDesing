// Modo Juego · lógica de una partida (pura: sin React, sin almacenamiento, azar inyectado).
// Mismas reglas que el juego original: 3 corazones por nivel, combo, pista = ½ punto y mazmorra sin límite de vidas.
import { type QuestItem } from "./quest-mock";
import { kindOf } from "./pack-exam";
import { MAX_APPEALS, MAX_EXAMS, starsFor, type QuestState } from "./quest";

/** Una pregunta de desarrollo cuenta como acierto con al menos este % de los puntos clave cubiertos. */
export const ESSAY_PASS = 0.6;

export const HEARTS = 3;
export const DUNGEON_MAX = 15;
export type RunMode = "level" | "boss" | "dungeon" | "exam";
export type Rng = () => number;

export interface Option {
  t: string;
  ok: boolean;
}
export interface PlayItem extends QuestItem {
  /** Teoría: las 4 opciones ya barajadas. */
  opts?: Option[];
}
export interface LogEntry {
  item: PlayItem;
  ok: boolean;
  pts: number;
  ans: string;
  /** Aceptada por apelación («Mi comando también vale»). */
  appeal?: boolean;
}
export interface Run {
  nodeId: string;
  mode: RunMode;
  items: PlayItem[];
  i: number;
  /** `Infinity` en la mazmorra. */
  lives: number;
  maxLives: number;
  score: number;
  combo: number;
  xp: number;
  log: LogEntry[];
}

/**
 * Barajado Fisher–Yates sin mutar la entrada.
 *
 * @param rng Fuente de azar en [0, 1) (inyectable para pruebas deterministas).
 */
export function shuffle<T>(a: readonly T[], rng: Rng = Math.random): T[] {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

/**
 * Prepara una partida. En la mazmorra mezcla y toma hasta `DUNGEON_MAX` preguntas con vidas infinitas;
 * en nivel o Jefe usa el orden dado y `HEARTS` vidas. Las de teoría llevan sus opciones barajadas (la correcta es la primera de `t[1]`).
 */
export function startRun(nodeId: string, mode: RunMode, items: QuestItem[], rng: Rng = Math.random): Run {
  const picked = mode === "dungeon" ? shuffle(items, rng).slice(0, DUNGEON_MAX) : items;
  const play: PlayItem[] = picked.map((it) =>
    it.type === "t" && it.t ? { ...it, opts: shuffle(it.t[1].map((t, i) => ({ t, ok: i === 0 })), rng) } : it,
  );
  // Mazmorra y examen: sin vidas (en el examen solo manda el cronómetro).
  const lives = mode === "dungeon" || mode === "exam" ? Infinity : HEARTS;
  return { nodeId, mode, items: play, i: 0, lives, maxLives: lives, score: 0, combo: 0, xp: 0, log: [] };
}

/** Sin vidas antes de contestar todas (Game Over). */
export const isDead = (r: Run) => r.lives <= 0 && r.i < r.items.length;
/** Fin de partida: sin preguntas por contestar o sin vidas. */
export const isOver = (r: Run) => r.i >= r.items.length || r.lives <= 0;
/** Pregunta en curso, o null si la partida terminó. */
export const currentItem = (r: Run): PlayItem | null => (isOver(r) ? null : r.items[r.i]);
/** Puntos conseguidos sobre el total de preguntas, en % entero (0 sin preguntas). */
export const runPct = (r: Run) => (r.items.length ? Math.round((r.score / r.items.length) * 100) : 0);

/**
 * Registra una respuesta (`pts` 1, ½ con pista, 0 si falla). No avanza: eso lo hace `next`.
 * Acierto: suma puntos, combo y XP (10 teoría / 20 práctica × `pts`, +5 desde combo ×3) y saca el fallo pendiente
 * (en nivel/Jefe solo con `pts` 1; en mazmorra siempre). Fallo: rompe el combo, resta una vida (la mazmorra no) y apunta el fallo.
 *
 * @param fails Ids de fallos pendientes (no se muta; se devuelve la lista nueva).
 * @param ans Respuesta escrita/elegida, para el registro.
 * @returns La partida y los fallos actualizados; sin pregunta en curso, ambos sin cambios.
 */
export function answerRun(r: Run, fails: string[], ok: boolean, pts: number, ans: string): { run: Run; fails: string[] } {
  const item = r.items[r.i];
  if (!item) return { run: r, fails };
  let run: Run;
  let nf = fails;
  if (ok) {
    const combo = r.combo + 1;
    const xp = r.xp + Math.round((item.type === "p" ? 20 : 10) * pts + (combo >= 3 ? 5 : 0));
    run = { ...r, score: r.score + pts, combo, xp };
    if (r.mode === "dungeon" || pts === 1) nf = fails.filter((x) => x !== item.id);
  } else {
    run = { ...r, combo: 0, lives: r.lives === Infinity ? r.lives : r.lives - 1 };
    if (!fails.includes(item.id)) nf = [...fails, item.id];
  }
  run.log = [...r.log, { item, ok, pts, ans }];
  return { run, fails: nf };
}

/** Avanza a la siguiente pregunta. */
export const next = (r: Run): Run => ({ ...r, i: r.i + 1 });

export interface Summary {
  pct: number;
  stars: number;
  dead: boolean;
}

/**
 * Cierra la partida: suma XP y guarda estrellas/mejor % (nunca bajan). La mazmorra no puntúa niveles.
 * Con Game Over las estrellas son 0 y el mejor % no sube. No muta `state`.
 */
export function finishRun(state: QuestState, r: Run): { state: QuestState; summary: Summary } {
  const pct = runPct(r);
  const dead = isDead(r);
  const stars = r.mode === "dungeon" || dead ? 0 : starsFor(pct);
  const lv = { ...state.lv };
  if (r.mode !== "dungeon") {
    const prev = lv[r.nodeId];
    lv[r.nodeId] = { stars: Math.max(prev?.stars ?? 0, stars), best: Math.max(prev?.best ?? 0, dead ? 0 : pct) };
  }
  return { state: { ...state, xp: state.xp + r.xp, lv }, summary: { pct, stars, dead } };
}


// ───────────────────────── v2.6 · desarrollo, apelaciones y examen final ─────────────────────────

/**
 * Corrección de una pregunta de desarrollo por rúbrica: `covered` de `total` puntos clave marcados por la usuaria.
 * Acierta con ≥ `ESSAY_PASS`; los puntos son la fracción cubierta (a un decimal) o 0 si no llega.
 */
export function essayScore(covered: number, total: number): { ok: boolean; pts: number } {
  const f = total > 0 ? Math.max(0, Math.min(1, covered / total)) : 0;
  const ok = f >= ESSAY_PASS;
  return { ok, pts: ok ? Math.round(f * 10) / 10 : 0 };
}

/**
 * «⚖️ Mi comando también vale» (puerto del original): la última respuesta fallada pasa a acierto (1 punto), el combo vuelve a 1,
 * se devuelve una vida si las hay y se saca el fallo pendiente. La apelación queda para comprobarla en la máquina virtual.
 *
 * @returns La partida y los fallos actualizados, y la apelación a guardar; sin respuesta fallada que apelar, todo sin cambios.
 */
export function appealLast(r: Run, fails: string[]): { run: Run; fails: string[]; appeal: { q: string; sol: string; ans: string } | null } {
  const last = r.log[r.log.length - 1];
  if (!last || last.ok || last.item.type !== "p" || !last.item.p) return { run: r, fails, appeal: null };
  const log = r.log.slice(0, -1).concat({ ...last, ok: true, pts: 1, appeal: true });
  const run: Run = { ...r, score: r.score + 1, combo: 1, lives: r.lives === Infinity ? r.lives : Math.min(r.maxLives, r.lives + 1), log };
  return { run, fails: fails.filter((x) => x !== last.item.id), appeal: { q: last.item.p.q, sol: last.item.p.sol, ans: last.ans } };
}

/** Añade una apelación al estado (más reciente primero, tope `MAX_APPEALS`). */
export const addAppeal = (s: QuestState, a: { q: string; sol: string; ans: string }): QuestState => ({ ...s, appeals: [a, ...(s.appeals ?? [])].slice(0, MAX_APPEALS) });

/** Instante en que acaba el examen. */
export const examDeadline = (startMs: number, minutes: number) => startMs + minutes * 60_000;
/** Milisegundos que quedan (nunca negativo). */
export const timeLeft = (deadlineMs: number, nowMs: number) => Math.max(0, deadlineMs - nowMs);
/** `mm:ss` del cronómetro. */
export function clock(ms: number): string {
  const t = Math.ceil(ms / 1000);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

/** Se acabó el tiempo: lo que falta por contestar cuenta como fallo («(sin tiempo)»). Los fallos pendientes no se tocan. */
export function expireRun(r: Run): Run {
  const rest = r.items.slice(r.i).map((item): LogEntry => ({ item, ok: false, pts: 0, ans: "(sin tiempo)" }));
  return { ...r, i: r.items.length, log: [...r.log, ...rest] };
}

/** ¿Cuenta la pregunta como «teoría» (true) o «práctica» (false)? Por el tipo del paquete; si no es del paquete, por su forma. */
export function isTheoryItem(it: PlayItem): boolean {
  const k = kindOf(it.id);
  if (k) return k === "theoryTest" || k === "theoryEssay";
  return it.type !== "p";
}

/** Nota sobre 10 con un decimal. */
export const notaOf = (score: number, max: number) => (max > 0 ? Math.round((score / max) * 100) / 10 : 0);

export interface ExamSummary {
  pct: number;
  /** Nota sobre 10. */
  nota: number;
  stars: number;
  theory: number | null;
  practical: number | null;
}

/** Subnota sobre 10 de un grupo de respuestas (null si no hay ninguna). */
const sub = (log: LogEntry[]) => (log.length ? Math.round((log.reduce((a, l) => a + l.pts, 0) / log.length) * 100) / 10 : null);

/**
 * Cierra el examen final: nota /10 y subnotas, estrellas por el %, mejor nota y XP; guarda el intento (más reciente primero).
 * `lv.final.best` guarda la **nota** (no el %), como el original. No muta `state`.
 */
export function finishExam(state: QuestState, r: Run, finalId: string, nowIso: string): { state: QuestState; summary: ExamSummary } {
  const pct = runPct(r);
  const nota = notaOf(r.score, r.items.length);
  const stars = starsFor(pct);
  const prev = state.lv[finalId];
  const lv = { ...state.lv, [finalId]: { stars: Math.max(prev?.stars ?? 0, stars), best: Math.max(prev?.best ?? 0, nota) } };
  const theory = sub(r.log.filter((l) => isTheoryItem(l.item)));
  const practical = sub(r.log.filter((l) => !isTheoryItem(l.item)));
  const exams = [{ at: nowIso, nota, theory, practical, total: r.items.length }, ...(state.exams ?? [])].slice(0, MAX_EXAMS);
  return { state: { ...state, xp: state.xp + r.xp, lv, exams }, summary: { pct, nota, stars, theory, practical } };
}

/**
 * Apelación hecha **desde la pantalla de resultados** del examen (en el examen no hay corrección por pregunta): la respuesta `idx`
 * del registro pasa a acierto y se recalcula nota, estrellas y mejor nota. Si ya era acierto o no es una práctica, no cambia nada.
 */
export function appealInResult(state: QuestState, r: Run, idx: number, finalId: string): { state: QuestState; run: Run; summary: ExamSummary } | null {
  const l = r.log[idx];
  if (!l || l.ok || l.item.type !== "p" || !l.item.p || l.ans === "(sin tiempo)" || l.ans === "(no lo sé)") return null;
  const log = r.log.map((x, i) => (i === idx ? { ...x, ok: true, pts: 1, appeal: true } : x));
  const run: Run = { ...r, score: r.score + 1, log };
  const pct = runPct(run);
  const nota = notaOf(run.score, run.items.length);
  const prev = state.lv[finalId];
  const exams = state.exams?.length ? [{ ...state.exams[0], nota, theory: sub(log.filter((x) => isTheoryItem(x.item))), practical: sub(log.filter((x) => !isTheoryItem(x.item))) }, ...state.exams.slice(1)] : state.exams;
  const next: QuestState = {
    ...addAppeal({ ...state, fails: state.fails.filter((x) => x !== l.item.id) }, { q: l.item.p.q, sol: l.item.p.sol, ans: l.ans }),
    lv: { ...state.lv, [finalId]: { stars: Math.max(prev?.stars ?? 0, starsFor(pct)), best: Math.max(prev?.best ?? 0, nota) } },
    ...(exams ? { exams } : {}),
  };
  return { state: next, run, summary: { pct, nota, stars: starsFor(pct), theory: sub(log.filter((x) => isTheoryItem(x.item))), practical: sub(log.filter((x) => !isTheoryItem(x.item))) } };
}
