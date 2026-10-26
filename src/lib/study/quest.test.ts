import { describe, expect, it } from "vitest";

import {
  BOSS_ID,
  buildQuestMap,
  currentIndex,
  emptyQuest,
  isUnlocked,
  maxStars,
  parseQuest,
  questKey,
  RANK_START,
  rankFor,
  starsFor,
  totalStars,
  type QuestState,
} from "./quest";

const topics = [
  { id: "a", name: "Tema A", tag: "red" as const, minutes: 30 },
  { id: "b", name: "Tema B", tag: "yellow" as const, minutes: 20 },
  { id: "c", name: "Tema C", tag: "grey" as const, minutes: 10 },
];
const nodes = buildQuestMap(topics);
const withStars = (lv: Record<string, number>, free = false): QuestState => ({
  ...emptyQuest(),
  free,
  lv: Object.fromEntries(Object.entries(lv).map(([k, stars]) => [k, { stars }])),
});

describe("buildQuestMap", () => {
  it("un nivel por tema en orden y el Jefe Final al final", () => {
    expect(nodes.map((n) => n.id)).toEqual(["a", "b", "c", BOSS_ID]);
    expect(nodes.map((n) => n.n)).toEqual([1, 2, 3, 4]);
    expect(nodes[3]).toMatchObject({ kind: "boss", title: "Jefe Final", tag: null });
    expect(nodes[1]).toMatchObject({ kind: "level", title: "Tema B", tag: "yellow", minutes: 20 });
  });
  it("sin temas no hay mapa (ni jefe suelto)", () => {
    expect(buildQuestMap([])).toEqual([]);
  });
  it("clave por asignatura", () => {
    expect(questKey("m1")).toBe("atlenza.study.quest.m1");
  });
});

describe("starsFor", () => {
  it.each([
    [0, 0],
    [59, 0],
    [60, 1],
    [79, 1],
    [80, 2],
    [99, 2],
    [100, 3],
  ])("%i %% → %i ★", (pct, stars) => expect(starsFor(pct)).toBe(stars));
});

describe("desbloqueo", () => {
  it("de partida solo el primer nivel", () => {
    const s = emptyQuest();
    expect(nodes.map((_, i) => isUnlocked(nodes, i, s))).toEqual([true, false, false, false]);
  });
  it("1 ★ no abre el siguiente; 2 ★ sí", () => {
    expect(isUnlocked(nodes, 1, withStars({ a: 1 }))).toBe(false);
    expect(isUnlocked(nodes, 1, withStars({ a: 2 }))).toBe(true);
    expect(isUnlocked(nodes, 1, withStars({ a: 3 }))).toBe(true);
  });
  it("cada nivel depende solo del anterior; el jefe del último tema", () => {
    const s = withStars({ a: 3, b: 1, c: 2 });
    expect(nodes.map((_, i) => isUnlocked(nodes, i, s))).toEqual([true, true, false, true]);
    expect(isUnlocked(nodes, 3, withStars({ a: 3, b: 3, c: 1 }))).toBe(false);
  });
  it("el modo libre lo abre todo", () => {
    const s = withStars({}, true);
    expect(nodes.every((_, i) => isUnlocked(nodes, i, s))).toBe(true);
  });
  it("índices fuera de rango no están desbloqueados", () => {
    expect(isUnlocked(nodes, -1, emptyQuest())).toBe(false);
    expect(isUnlocked(nodes, 4, withStars({}, true))).toBe(false);
  });
  it("nodo actual: primero abierto con menos de ★★", () => {
    expect(currentIndex(nodes, emptyQuest())).toBe(0);
    expect(currentIndex(nodes, withStars({ a: 2, b: 1 }))).toBe(1);
    expect(currentIndex(nodes, withStars({ a: 2, b: 2, c: 2, [BOSS_ID]: 2 }))).toBe(-1);
  });
});

describe("estrellas y rango", () => {
  it("suma solo los nodos del mapa", () => {
    expect(totalStars(nodes, withStars({ a: 3, b: 1, otro: 3 }))).toBe(4);
    expect(maxStars(nodes)).toBe(12);
  });
  it("cortes del original con 51 estrellas", () => {
    expect(rankFor(0, 51)).toBe(RANK_START);
    expect(rankFor(7, 51)).toBe(RANK_START);
    expect(rankFor(8, 51)).toBe("🔧 Aprendiz");
    expect(rankFor(17, 51)).toBe("🔧 Aprendiz");
    expect(rankFor(18, 51)).toBe("🧰 Estudiante");
    expect(rankFor(30, 51)).toBe("🛡️ Avanzada");
    expect(rankFor(41, 51)).toBe("🛡️ Avanzada");
    expect(rankFor(42, 51)).toBe("👑 Experta");
    expect(rankFor(50, 51)).toBe("👑 Experta");
    expect(rankFor(51, 51)).toBe("⚡ Leyenda");
  });
  it("escala con el máximo de la asignatura", () => {
    expect(rankFor(12, 12)).toBe("⚡ Leyenda");
    expect(rankFor(6, 12)).toBe("🧰 Estudiante");
    expect(rankFor(1, 12)).toBe(RANK_START);
    expect(rankFor(2, 12)).toBe("🔧 Aprendiz");
  });
  it("sin mapa: rango inicial", () => {
    expect(rankFor(0, 0)).toBe(RANK_START);
    expect(rankFor(3, 0)).toBe(RANK_START);
  });
});

describe("parseQuest", () => {
  it("vacío o roto → estado inicial", () => {
    expect(parseQuest(null)).toEqual(emptyQuest());
    expect(parseQuest("{no json")).toEqual(emptyQuest());
    expect(parseQuest("[1,2]")).toEqual(emptyQuest());
    expect(parseQuest("null")).toEqual(emptyQuest());
  });
  it("conserva lo válido y sanea lo raro", () => {
    const s = parseQuest(JSON.stringify({ xp: 120.7, lv: { a: { stars: 9, best: 140 }, b: { stars: "3" }, c: null }, fails: ["a:t1", 4, "a:t1"], free: "sí" }));
    expect(s).toEqual({ xp: 120, lv: { a: { stars: 3, best: 100 }, b: { stars: 0 } }, fails: ["a:t1"], free: false });
  });
  it("xp negativa o no numérica → 0", () => {
    expect(parseQuest(JSON.stringify({ xp: -5 })).xp).toBe(0);
    expect(parseQuest(JSON.stringify({ xp: "100" })).xp).toBe(0);
  });
});
