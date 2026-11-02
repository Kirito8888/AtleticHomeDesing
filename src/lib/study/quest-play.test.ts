import { describe, expect, it } from "vitest";

import { emptyQuest, type QuestState } from "./quest";
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

// ───────────── v2.6 · desarrollo, apelaciones y examen final ─────────────
import { addAppeal, appealInResult, appealLast, clock, essayScore, examDeadline, expireRun, finishExam, isTheoryItem, notaOf, timeLeft } from "./quest-play";
import type { QuestItem } from "./quest-mock";

const pk = (kind: "tt" | "pc" | "te", n: number): QuestItem =>
  kind === "pc"
    ? { id: `pk:T:pc:${n}`, lid: "T", type: "p", p: { q: `cmd ${n}`, sol: "ls -l", ok: [], sh: "b" } }
    : kind === "te"
      ? { id: `pk:T:te:${n}`, lid: "T", type: "e", e: { q: `ensayo ${n}`, model: "m", points: ["a", "b", "c", "d"] } }
      : { id: `pk:T:tt:${n}`, lid: "T", type: "t", t: [`q${n}`, ["ok", "x", "y", "z"]] };

describe("essayScore", () => {
  it("aprueba desde el 60 % de los puntos clave", () => {
    expect(essayScore(3, 5)).toEqual({ ok: true, pts: 0.6 });
    expect(essayScore(2, 5)).toEqual({ ok: false, pts: 0 });
    expect(essayScore(4, 4)).toEqual({ ok: true, pts: 1 });
  });
  it("sin puntos o valores raros no aprueba ni lanza", () => {
    expect(essayScore(0, 0)).toEqual({ ok: false, pts: 0 });
    expect(essayScore(9, 4)).toEqual({ ok: true, pts: 1 });
    expect(essayScore(-2, 4).ok).toBe(false);
  });
});

describe("appealLast (Mi comando también vale)", () => {
  it("convierte el último fallo de práctica en acierto, devuelve una vida y saca el fallo", () => {
    let r = startRun("n", "level", [pk("pc", 1), pk("pc", 2)]);
    const a = answerRun(r, [], false, 0, "ls -la /etc");
    expect(a.run.lives).toBe(2);
    const ap = appealLast(a.run, a.fails);
    expect(ap.appeal).toEqual({ q: "cmd 1", sol: "ls -l", ans: "ls -la /etc" });
    expect(ap.run.score).toBe(1);
    expect(ap.run.lives).toBe(3);
    expect(ap.run.combo).toBe(1);
    expect(ap.fails).toEqual([]);
    expect(ap.run.log[0]).toMatchObject({ ok: true, pts: 1, appeal: true });
    r = ap.run;
  });
  it("no apela un acierto ni una teoría ni con vidas infinitas altera el contador", () => {
    const r = startRun("n", "level", [pk("tt", 1)]);
    const a = answerRun(r, [], false, 0, "x");
    expect(appealLast(a.run, a.fails).appeal).toBeNull();
    const ok = answerRun(startRun("n", "level", [pk("pc", 1)]), [], true, 1, "ls -l");
    expect(appealLast(ok.run, ok.fails).appeal).toBeNull();
    const dg = answerRun(startRun("dungeon", "dungeon", [pk("pc", 1)]), [], false, 0, "z");
    expect(appealLast(dg.run, dg.fails).run.lives).toBe(Infinity);
  });
  it("addAppeal pone la más reciente primero y limita a 100", () => {
    let s = emptyQuest();
    for (let i = 0; i < 105; i++) s = addAppeal(s, { q: `q${i}`, sol: "s", ans: "a" });
    expect(s.appeals).toHaveLength(100);
    expect(s.appeals![0].q).toBe("q104");
  });
});

describe("examen final", () => {
  const exam = () => startRun("final", "exam", [pk("tt", 1), pk("tt", 2), pk("pc", 1), pk("te", 1)]);
  it("sin vidas", () => {
    expect(exam().lives).toBe(Infinity);
    expect(exam().maxLives).toBe(Infinity);
  });
  it("cronómetro: queda tiempo, nunca negativo, y mm:ss", () => {
    const d = examDeadline(1_000, 35);
    expect(timeLeft(d, 1_000)).toBe(35 * 60_000);
    expect(timeLeft(d, d + 5)).toBe(0);
    expect(clock(35 * 60_000)).toBe("35:00");
    expect(clock(61_000)).toBe("01:01");
    expect(clock(0)).toBe("00:00");
  });
  it("al agotarse el tiempo, lo que falta cuenta como fallo «(sin tiempo)»", () => {
    let r = exam();
    r = next(answerRun(r, [], true, 1, "ok").run);
    const e = expireRun(r);
    expect(e.i).toBe(4);
    expect(e.log).toHaveLength(4);
    expect(e.log.slice(1).every((l) => !l.ok && l.ans === "(sin tiempo)")).toBe(true);
    expect(e.score).toBe(1);
  });
  it("nota sobre 10 con un decimal y subnotas teoría/práctica", () => {
    let r = exam();
    const fails: string[] = [];
    // tt1 ok, tt2 fallo, pc ok, te con 0,6
    for (const [ok, pts] of [[true, 1], [false, 0], [true, 1], [true, 0.6]] as const) r = next(answerRun(r, fails, ok, pts, "x").run);
    const { state, summary } = finishExam(emptyQuest(), r, "final", "2027-01-01T10:00:00Z");
    expect(summary.nota).toBe(6.5);
    expect(summary.pct).toBe(65);
    expect(summary.stars).toBe(1);
    expect(summary.theory).toBe(5.3);
    expect(summary.practical).toBe(10);
    expect(state.lv.final).toEqual({ stars: 1, best: 6.5 });
    expect(state.exams![0]).toMatchObject({ nota: 6.5, total: 4 });
  });
  it("la mejor nota y las estrellas no bajan; solo se guardan 20 intentos", () => {
    let s: QuestState = { ...emptyQuest(), lv: { final: { stars: 3, best: 9.5 } } };
    const r = next(answerRun(exam(), [], false, 0, "x").run);
    for (let i = 0; i < 25; i++) s = finishExam(s, r, "final", `t${i}`).state;
    expect(s.lv.final).toEqual({ stars: 3, best: 9.5 });
    expect(s.exams).toHaveLength(20);
    expect(s.exams![0].at).toBe("t24");
  });
  it("apelación desde los resultados: sube la nota y queda en Apelaciones; no vale sin respuesta o ya acertada", () => {
    let r = exam();
    const fails: string[] = [];
    for (const [ok, pts, ans] of [[true, 1, "a"], [true, 1, "b"], [false, 0, "ls -la"], [true, 1, "c"]] as const) r = next(answerRun(r, fails, ok, pts, ans).run);
    const before = finishExam(emptyQuest(), r, "final", "t0");
    expect(before.summary.nota).toBe(7.5);
    const ap = appealInResult(before.state, r, 2, "final")!;
    expect(ap.summary.nota).toBe(10);
    expect(ap.state.appeals).toEqual([{ q: "cmd 1", sol: "ls -l", ans: "ls -la" }]);
    expect(ap.state.lv.final).toEqual({ stars: 3, best: 10 });
    expect(ap.state.exams![0].nota).toBe(10);
    expect(appealInResult(ap.state, ap.run, 2, "final")).toBeNull();
    expect(appealInResult(before.state, r, 0, "final")).toBeNull();
    const timed = expireRun(exam());
    expect(appealInResult(emptyQuest(), timed, 2, "final")).toBeNull();
  });
  it("clasifica teoría/práctica por el tipo del paquete", () => {
    expect(isTheoryItem(pk("tt", 1))).toBe(true);
    expect(isTheoryItem(pk("te", 1))).toBe(true);
    expect(isTheoryItem(pk("pc", 1))).toBe(false);
    expect(isTheoryItem({ id: "pk:T:pt:1", lid: "T", type: "t", t: ["q", ["a", "b", "c", "d"]] })).toBe(false);
    expect(isTheoryItem({ id: "ai:x:1:p0", lid: "x", type: "p" })).toBe(false);
    expect(notaOf(0, 0)).toBe(0);
  });
});
