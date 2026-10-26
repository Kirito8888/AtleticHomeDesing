// Modo Juego · lógica de una partida (pura: sin React, sin almacenamiento, azar inyectado).
// Mismas reglas que el juego original: 3 corazones por nivel, combo, pista = ½ punto y mazmorra sin límite de vidas.
import { type QuestItem } from "./quest-mock";
import { starsFor, type QuestState } from "./quest";

export const HEARTS = 3;
export const DUNGEON_MAX = 15;
export type RunMode = "level" | "boss" | "dungeon";
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

export function shuffle<T>(a: readonly T[], rng: Rng = Math.random): T[] {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

export function startRun(nodeId: string, mode: RunMode, items: QuestItem[], rng: Rng = Math.random): Run {
  const picked = mode === "dungeon" ? shuffle(items, rng).slice(0, DUNGEON_MAX) : items;
  const play: PlayItem[] = picked.map((it) =>
    it.type === "t" && it.t ? { ...it, opts: shuffle(it.t[1].map((t, i) => ({ t, ok: i === 0 })), rng) } : it,
  );
  const lives = mode === "dungeon" ? Infinity : HEARTS;
  return { nodeId, mode, items: play, i: 0, lives, maxLives: lives, score: 0, combo: 0, xp: 0, log: [] };
}

export const isDead = (r: Run) => r.lives <= 0 && r.i < r.items.length;
export const isOver = (r: Run) => r.i >= r.items.length || r.lives <= 0;
export const currentItem = (r: Run): PlayItem | null => (isOver(r) ? null : r.items[r.i]);
export const runPct = (r: Run) => (r.items.length ? Math.round((r.score / r.items.length) * 100) : 0);

/** Registra una respuesta (`pts` 1, ½ con pista, 0 si falla). No avanza: eso lo hace `next`. */
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

export const next = (r: Run): Run => ({ ...r, i: r.i + 1 });

export interface Summary {
  pct: number;
  stars: number;
  dead: boolean;
}

/** Cierra la partida: suma XP y guarda estrellas/mejor % (nunca bajan). La mazmorra no puntúa niveles. */
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

