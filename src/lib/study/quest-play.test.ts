import { describe, expect, it } from "vitest";

import { emptyQuest } from "./quest";
import { allItems, itemById, levelItems } from "./quest-mock";
import { DUNGEON_MAX, HEARTS, answerRun, finishRun, isDead, isOver, next, shuffle, startRun, type Run } from "./quest-play";

const seq = (...v: number[]) => {
  let i = 0;
  return () => v[i++ % v.length];
};
const items = () => allItems(["L3"]).slice(0, 5);
const play = (r: Run, fails: string[], ok: boolean, pts = ok ? 1 : 0) => {
  const a = answerRun(r, fails, ok, pts, "x");
  return { run: next(a.run), fails: a.fails };
};

describe("shuffle / startRun", () => {
  it("no muta la entrada y conserva los elementos", () => {
    const a = [1, 2, 3, 4, 5];
    const b = shuffle(a, seq(0.1, 0.9, 0.5));
    expect(a).toEqual([1, 2, 3, 4, 5]);
    expect([...b].sort()).toEqual(a);
  });
  it("3 corazones por nivel y 4 opciones con una sola correcta en teoría", () => {
    const r = startRun("n", "level", items(), seq(0.3));
    expect(r.lives).toBe(HEARTS);
    for (const it of r.items.filter((x) => x.type === "t")) {
      expect(it.opts).toHaveLength(4);
      expect(it.opts!.filter((o) => o.ok)).toHaveLength(1);
      expect(it.opts!.find((o) => o.ok)!.t).toBe(it.t![1][0]);
    }
  });
  it("la mazmorra tiene vidas infinitas y como mucho 15 preguntas", () => {
    const r = startRun("dungeon", "dungeon", allItems(["L1", "L2"]));
    expect(r.lives).toBe(Infinity);
    expect(r.items.length).toBe(DUNGEON_MAX);
  });
});

describe("answerRun", () => {
  it("fallar quita un corazón, rompe el combo y guarda el fallo una sola vez", () => {
    let r = startRun("n", "level", items());
    let f: string[] = [];
    ({ run: r, fails: f } = play(r, f, false));
    expect(r.lives).toBe(2);
    expect(f).toHaveLength(1);
    const again = answerRun({ ...r, i: 0 }, f, false, 0, "y");
    expect(again.fails).toHaveLength(1);
  });
  it("Game Over al tercer fallo (antes de acabar las preguntas)", () => {
    let r = startRun("n", "level", items());
    let f: string[] = [];
    for (let k = 0; k < 3; k++) ({ run: r, fails: f } = play(r, f, false));
    expect(r.lives).toBe(0);
    expect(isOver(r)).toBe(true);
    expect(isDead(r)).toBe(true);
    const done = finishRun(emptyQuest(), r);
    expect(done.summary).toMatchObject({ dead: true, stars: 0, pct: 0 });
    expect(done.state.lv.n).toEqual({ stars: 0, best: 0 });
  });
  it("XP: 10 teoría / 20 práctica por punto y +5 desde el combo 3", () => {
    const base = allItems(["L3"]);
    const t = base.filter((x) => x.type === "t").slice(0, 3);
    let r = startRun("n", "level", t);
    let f: string[] = [];
    for (let k = 0; k < 3; k++) ({ run: r, fails: f } = play(r, f, true));
    expect(r.combo).toBe(3);
    expect(r.xp).toBe(10 + 10 + 15);
    const p = startRun("n", "level", base.filter((x) => x.type === "p").slice(0, 1));
    expect(answerRun(p, [], true, 1, "x").run.xp).toBe(20);
    expect(answerRun(p, [], true, 0.5, "x").run.xp).toBe(10);
  });
  it("un fallo corta el combo", () => {
    let r = startRun("n", "level", items());
    let f: string[] = [];
    for (let k = 0; k < 2; k++) ({ run: r, fails: f } = play(r, f, true));
    ({ run: r, fails: f } = play(r, f, false));
    expect(r.combo).toBe(0);
  });
  it("acertar con pista (½) no saca el fallo; acertar entero sí", () => {
    const r = startRun("n", "level", items());
    const id = r.items[0].id;
    expect(answerRun(r, [id], true, 0.5, "x").fails).toEqual([id]);
    expect(answerRun(r, [id], true, 1, "x").fails).toEqual([]);
  });
});

describe("mazmorra", () => {
  it("no pierde vidas, saca los fallos al acertar y no puntúa niveles", () => {
    const ids = ["L3:t0", "L3:p1"];
    const start = ids.map((i) => itemById(i)!);
    let r = startRun("dungeon", "dungeon", start);
    let f = [...ids];
    ({ run: r, fails: f } = play(r, f, false));
    expect(r.lives).toBe(Infinity);
    expect(f).toHaveLength(2);
    ({ run: r, fails: f } = play(r, f, true, 0.5));
    expect(f).toHaveLength(1);
    expect(isOver(r)).toBe(true);
    const s0 = emptyQuest();
    const done = finishRun({ ...s0, fails: f }, r);
    expect(done.state.lv).toEqual({});
    expect(done.state.xp).toBe(r.xp);
  });
});

describe("finishRun", () => {
  const perfect = (n: number, mode: "level" | "boss" = "level") => {
    let r = startRun("t1", mode, levelItems(1).slice(0, n));
    let f: string[] = [];
    for (let k = 0; k < n; k++) ({ run: r, fails: f } = play(r, f, true));
    return r;
  };
  it("100 % = ★★★, suma XP y guarda el mejor porcentaje", () => {
    const r = perfect(5);
    const { state, summary } = finishRun(emptyQuest(), r);
    expect(summary).toEqual({ pct: 100, stars: 3, dead: false });
    expect(state.lv.t1).toEqual({ stars: 3, best: 100 });
    expect(state.xp).toBe(r.xp);
  });
  it("las estrellas y el mejor % nunca bajan", () => {
    const prev = { ...emptyQuest(), xp: 50, lv: { t1: { stars: 3, best: 100 } } };
    let r = startRun("t1", "level", items());
    let f: string[] = [];
    for (let k = 0; k < 5; k++) ({ run: r, fails: f } = play(r, f, k < 2));
    // 3 fallos seguidos → Game Over con 40 %
    const { state } = finishRun(prev, r);
    expect(state.lv.t1).toEqual({ stars: 3, best: 100 });
    expect(state.xp).toBe(50 + r.xp);
  });
  it("cortes 60/80/100 → 1/2/3 ★ (sobre 5: 3/5 = 60 %, 4/5 = 80 %)", () => {
    const run = (ok: number) => {
      let r = startRun("t1", "level", items());
      let f: string[] = [];
      // los fallos van al final para no morir antes (máx. 2 fallos)
      for (let k = 0; k < 5; k++) ({ run: r, fails: f } = play(r, f, k < ok));
      return finishRun(emptyQuest(), r).summary;
    };
    expect(run(5).stars).toBe(3);
    expect(run(4).stars).toBe(2);
    expect(run(3).stars).toBe(1);
  });
});

describe("mock", () => {
  it("itemById ignora ids desconocidos y los niveles rotan entre bancos", () => {
    expect(itemById("L99:t0")).toBeNull();
    expect(itemById("L1:p99")).toBeNull();
    expect(itemById("basura")).toBeNull();
    expect(itemById("L1:p3")!.type).toBe("p");
    expect(levelItems(5)[0].lid).toBe(levelItems(1)[0].lid);
  });
});
