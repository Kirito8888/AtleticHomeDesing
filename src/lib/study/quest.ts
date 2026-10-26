// Modo Juego · mapa de aventura de una asignatura (lógica pura, sin React ni almacenamiento).
// Cada tema es un nivel y al final hay un Jefe Final. El progreso vive en el dispositivo (localStorage).
import type { Tag } from "./adhd-report";

export const questKey = (moduleId: string) => `atlenza.study.quest.${moduleId}`;
export const BOSS_ID = "boss";
/** Estrellas del nivel anterior que hacen falta para desbloquear el siguiente. */
export const UNLOCK_STARS = 2;

export interface LevelResult {
  stars: number;
  /** Mejor porcentaje de aciertos (0–100). */
  best?: number;
}
export interface QuestState {
  xp: number;
  lv: Record<string, LevelResult>;
  /** Ids de las preguntas falladas (la mazmorra). */
  fails: string[];
  /** Modo libre: todos los nodos desbloqueados. */
  free: boolean;
}
export const emptyQuest = (): QuestState => ({ xp: 0, lv: {}, fails: [], free: false });

export interface QuestNode {
  id: string;
  kind: "level" | "boss";
  title: string;
  tag: Tag | null;
  minutes: number | null;
  /** Nº de nivel (1…n); el jefe lleva n+1. */
  n: number;
}

const clampStars = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(3, Math.floor(v))) : 0);

/** Lee el estado guardado sin fiarse de él: JSON roto o campos con tipos raros caen al valor vacío. */
export function parseQuest(raw: string | null): QuestState {
  const s = emptyQuest();
  if (!raw) return s;
  let o: unknown;
  try {
    o = JSON.parse(raw);
  } catch {
    return s;
  }
  if (!o || typeof o !== "object") return s;
  const r = o as Record<string, unknown>;
  if (typeof r.xp === "number" && Number.isFinite(r.xp) && r.xp > 0) s.xp = Math.floor(r.xp);
  if (r.lv && typeof r.lv === "object" && !Array.isArray(r.lv)) {
    for (const [id, v] of Object.entries(r.lv as Record<string, unknown>)) {
      if (!v || typeof v !== "object") continue;
      const lr = v as Record<string, unknown>;
      const res: LevelResult = { stars: clampStars(lr.stars) };
      if (typeof lr.best === "number" && Number.isFinite(lr.best)) res.best = Math.max(0, Math.min(100, lr.best));
      s.lv[id] = res;
    }
  }
  if (Array.isArray(r.fails)) s.fails = [...new Set(r.fails.filter((x): x is string => typeof x === "string"))];
  s.free = r.free === true;
  return s;
}

/** Niveles en el orden del temario + el Jefe Final. Sin temas no hay mapa. */
export function buildQuestMap(topics: { id: string; name: string; tag: Tag; minutes: number }[]): QuestNode[] {
  if (!topics.length) return [];
  const levels: QuestNode[] = topics.map((t, i) => ({ id: t.id, kind: "level", title: t.name, tag: t.tag, minutes: t.minutes, n: i + 1 }));
  return [...levels, { id: BOSS_ID, kind: "boss", title: "Jefe Final", tag: null, minutes: null, n: levels.length + 1 }];
}

/** ★ 60 % · ★★ 80 % · ★★★ 100 %. */
export const starsFor = (pct: number) => (pct >= 100 ? 3 : pct >= 80 ? 2 : pct >= 60 ? 1 : 0);
export const starsOf = (s: QuestState, id: string) => s.lv[id]?.stars ?? 0;
export const totalStars = (nodes: QuestNode[], s: QuestState) => nodes.reduce((a, n) => a + starsOf(s, n.id), 0);
export const maxStars = (nodes: QuestNode[]) => nodes.length * 3;

export function isUnlocked(nodes: QuestNode[], i: number, s: QuestState): boolean {
  if (i < 0 || i >= nodes.length) return false;
  if (s.free || i === 0) return true;
  return starsOf(s, nodes[i - 1].id) >= UNLOCK_STARS;
}

/** Primer nodo desbloqueado que aún no llega a ★★ (−1 si está todo superado). */
export const currentIndex = (nodes: QuestNode[], s: QuestState) => nodes.findIndex((n, i) => isUnlocked(nodes, i, s) && starsOf(s, n.id) < UNLOCK_STARS);

// Mismos cortes que el juego original (8, 18, 30, 42 y 51 de 51 estrellas), en fracción del máximo de esta asignatura.
const RANKS: { at: number; label: string }[] = [
  { at: 51 / 51, label: "⚡ Leyenda" },
  { at: 42 / 51, label: "👑 Experta" },
  { at: 30 / 51, label: "🛡️ Avanzada" },
  { at: 18 / 51, label: "🧰 Estudiante" },
  { at: 8 / 51, label: "🔧 Aprendiz" },
];
export const RANK_START = "🐣 Novata";

export function rankFor(stars: number, max: number): string {
  if (max <= 0 || stars <= 0) return RANK_START;
  const f = stars / max;
  // Pequeña tolerancia: 8/51 calculado con otro máximo no debe quedarse a una milésima del corte.
  return RANKS.find((r) => f + 1e-9 >= r.at)?.label ?? RANK_START;
}
