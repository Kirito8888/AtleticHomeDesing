"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { PALETTE } from "@/components/study/quest/palette";
import { EssayCard } from "@/components/study/quest/essay-card";
import { PracticeCard } from "@/components/study/quest/practice-card";
import { QuestHud } from "@/components/study/quest/quest-hud";
import { TheoryCard } from "@/components/study/quest/theory-card";
import { useQuestBank } from "@/components/study/quest/use-quest-bank";
import { useQuestStore } from "@/components/study/quest/use-quest-store";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import type { Tag } from "@/lib/study/adhd-report";
import { formatDec, formatInt } from "@/lib/format";
import { cn } from "@/lib/utils";
import { BOSS_ID, buildQuestMap, FINAL_ID, isUnlocked, starsOf, UNLOCK_STARS } from "@/lib/study/quest";
import { check, whyWrong } from "@/lib/study/quest-engine";
import { bankItem } from "@/lib/study/quest-ai";
import { itemById, type QuestItem } from "@/lib/study/quest-mock";
import {
  addAppeal,
  answerRun,
  appealInResult,
  appealLast,
  clock,
  currentItem,
  essayScore,
  examDeadline,
  expireRun,
  finishExam,
  finishRun,
  isDead,
  next,
  shuffle,
  startRun,
  timeLeft,
  type ExamSummary,
  type Run,
  type RunMode,
  type Summary,
} from "@/lib/study/quest-play";

interface Feedback {
  ok: boolean;
  pts: number;
  ans: string | null;
  picked: number | null;
  hinted: boolean;
  /** Desarrollo: puntos clave cubiertos / total. */
  rubric?: { covered: number; total: number };
  /** Aceptada por apelación. */
  appealed?: boolean;
}

const btn = "inline-flex min-h-11 items-center justify-center rounded-[10px] border-2 px-3.5 text-sm font-semibold shadow-[0_4px_0_#0008] active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40";
const panel = "rounded-2xl border-2 border-[var(--q-line)] bg-[var(--q-panel)] p-4";

type Gen = { status: "loading" } | { status: "ready"; items: QuestItem[]; source: "pack" | "ai"; minutes?: number } | { status: "error"; message: string; code: number };

/** v2.5 · Modo Juego, partes 4 y 5: la partida (teoría, terminal de práctica, vidas, combos y mazmorra). Las preguntas las genera la IA desde los apuntes
 *  (`POST /api/ai/study/quest`); la corrección y todo el estado son locales. */
export function QuestPlay({
  moduleId,
  mode,
  nodeId,
  topics,
}: {
  moduleId: string;
  mode: RunMode;
  nodeId: string;
  topics: { id: string; name: string; tag: Tag; minutes: number }[];
}) {
  const [s, save] = useQuestStore(moduleId);
  const nodes = useMemo(() => buildQuestMap(topics), [topics]);
  const mapHref = `/study/modules/${moduleId}/quest`;
  const playBase = `${mapHref}/play`;
  const [bank, mergeBank] = useQuestBank(moduleId);
  const [gen, setGen] = useState<Gen>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [run, setRun] = useState<Run | null>(null);
  const [fb, setFb] = useState<Feedback | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [exam, setExam] = useState<ExamSummary | null>(null);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [left, setLeft] = useState<number | null>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (fb) nextRef.current?.focus();
  }, [fb]);

  const isExam = mode === "exam";
  const idx = mode === "dungeon" || isExam ? -1 : nodes.findIndex((n) => n.id === nodeId);
  const node = idx >= 0 ? nodes[idx] : null;
  const examUnlocked = s.free || starsOf(s, BOSS_ID) >= UNLOCK_STARS;
  const title = mode === "dungeon" ? "Mazmorra de fallos" : isExam ? "Examen final" : mode === "boss" ? "Jefe Final" : (node?.title ?? "");
  const icon = mode === "dungeon" ? "💀" : isExam ? "🏆" : mode === "boss" ? "🐉" : "📘";

  // Fallos guardados: primero la caché de preguntas generadas, luego el banco de ejemplo (partidas antiguas); los que ya no existen se ignoran.
  const dungeonItems = useMemo(() => s.fails.map((id) => bankItem(bank, id) ?? itemById(id)).filter((x): x is QuestItem => !!x), [s.fails, bank]);

  // Genera las preguntas del nivel/Jefe al entrar (y al pedir «Nuevas preguntas» o reintentar).
  const playable = mode !== "dungeon" && (isExam ? examUnlocked : !!node && isUnlocked(nodes, idx, s));
  const keepFails = useRef(s.fails);
  useEffect(() => {
    keepFails.current = s.fails;
  }, [s.fails]);
  useEffect(() => {
    if (!playable) return;
    const ctl = new AbortController();
    fetch("/api/ai/study/quest", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ moduleId, nodeId }), signal: ctl.signal })
      .then(async (r) => {
        const j = (await r.json().catch(() => null)) as { items?: QuestItem[]; error?: string; source?: "pack" | "ai"; minutes?: number } | null;
        if (!r.ok || !j?.items?.length) throw Object.assign(new Error(j?.error ?? "No se pudieron generar las preguntas."), { code: r.status });
        mergeBank(j.items, keepFails.current);
        setGen({ status: "ready", items: j.items, source: j.source ?? "ai", minutes: j.minutes });
      })
      .catch((e: Error & { code?: number }) => {
        if (ctl.signal.aborted) return;
        setGen({ status: "error", message: e.message || "No se pudieron generar las preguntas.", code: e.code ?? 0 });
      });
    return () => ctl.abort();
  }, [playable, moduleId, nodeId, attempt, mergeBank]);

  const begin = useCallback(() => {
    const items = mode === "dungeon" ? dungeonItems : gen.status === "ready" ? shuffle(gen.items) : [];
    if (!items.length) return;
    setRun(startRun(mode === "dungeon" ? "dungeon" : nodeId, mode, items));
    setFb(null);
    setSummary(null);
    setExam(null);
    if (mode === "exam" && gen.status === "ready") {
      const d = examDeadline(Date.now(), gen.minutes ?? 35);
      setDeadline(d);
      setLeft(timeLeft(d, Date.now()));
    } else setDeadline(null);
  }, [mode, nodeId, dungeonItems, gen]);

  const regenerate = () => {
    setGen({ status: "loading" });
    setRun(null);
    setSummary(null);
    setExam(null);
    setDeadline(null);
    setAttempt((n) => n + 1);
  };

  // Último estado visible para el cronómetro (que corre fuera del ciclo de render).
  const live = useRef({ s, run });
  useEffect(() => {
    live.current = { s, run };
  });

  /** Cierra el examen: nota /10, estrellas, intento guardado. `state` lleva ya los últimos fallos. */
  const closeExam = useCallback(
    (r: Run, state: typeof s) => {
      const done = finishExam(state, r, FINAL_ID, new Date().toISOString());
      save(done.state);
      setRun(r);
      setExam(done.summary);
      setDeadline(null);
    },
    [save],
  );

  useEffect(() => {
    if (deadline === null || exam) return;
    const tick = () => {
      const l = timeLeft(deadline, Date.now());
      setLeft(l);
      const cur = live.current;
      if (l <= 0 && cur.run) closeExam(expireRun(cur.run), cur.s);
    };
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [deadline, exam, closeExam]);

  const answer = (ok: boolean, pts: number, ans: string | null, picked: number | null, hinted: boolean, rubric?: { covered: number; total: number }) => {
    if (!run || fb) return;
    const r = answerRun(run, s.fails, ok, pts, ans ?? "(no lo sé)");
    const state = { ...s, fails: r.fails };
    save(state);
    if (mode === "exam") {
      // En el examen no hay corrección pregunta a pregunta (como el original): se pasa a la siguiente y se corrige al final.
      const n = next(r.run);
      if (n.i >= n.items.length) closeExam(n, state);
      else setRun(n);
      return;
    }
    setRun(r.run);
    setFb({ ok, pts, ans, picked, hinted, rubric });
  };

  /** «⚖️ Mi comando también vale» tras un fallo de práctica (puerto del original): cuenta como acierto y queda en Apelaciones. */
  const appeal = async () => {
    if (!run || !fb || fb.ok) return;
    if (!(await confirmDialog({ title: "¿Tu comando hace exactamente lo que se pide?", description: "Contará como acierto y quedará en Apelaciones para que lo compruebes en la máquina virtual.", confirmLabel: "Sí, apelar" }))) return;
    const a = appealLast(run, s.fails);
    if (!a.appeal) return;
    save({ ...addAppeal(s, a.appeal), fails: a.fails });
    setRun(a.run);
    setFb({ ...fb, ok: true, pts: 1, appealed: true });
  };

  /** Apelación desde los resultados del examen. */
  const appealExam = async (i: number) => {
    if (!run || !exam) return;
    if (!(await confirmDialog({ title: "¿Tu comando hace exactamente lo que se pide?", description: "Sumará el punto y quedará en Apelaciones para que lo compruebes en la máquina virtual.", confirmLabel: "Sí, apelar" }))) return;
    const r = appealInResult(s, run, i, FINAL_ID);
    if (!r) return;
    save(r.state);
    setRun(r.run);
    setExam(r.summary);
  };

  const advance = () => {
    if (!run) return;
    const r = next(run);
    setFb(null);
    setRun(r);
    if (r.i >= r.items.length || r.lives <= 0) {
      const done = finishRun(s, r);
      save(done.state);
      setSummary(done.summary);
    }
  };

  const wrap = (children: React.ReactNode) => (
    <div style={PALETTE} className="rounded-2xl bg-[var(--q-bg)] p-3 text-[var(--q-ink)]" data-testid="quest-play">
      {children}
    </div>
  );
  const toMap = (
    <Link href={mapHref} className={cn(btn, "border-[var(--q-line)] bg-transparent")}>
      🗺️ Mapa
    </Link>
  );

  if (mode !== "dungeon" && !isExam && !node)
    return wrap(
      <p role="status" className={panel}>
        Ese nivel no existe en esta asignatura. {toMap}
      </p>,
    );
  if (mode !== "dungeon" && !(isExam ? examUnlocked : isUnlocked(nodes, idx, s)))
    return wrap(
      <div role="status" className={panel} data-testid="quest-locked">
        <p className="mb-3">{isExam ? "🔒 El examen final se abre con ★★ (80 %) en el Jefe Final, o activando el modo libre en el mapa." : "🔒 Este nivel sigue bloqueado: necesitas ★★ (80 %) en el anterior, o activar el modo libre en el mapa."}</p>
        {toMap}
      </div>,
    );
  if (mode === "dungeon" && !dungeonItems.length && !run)
    return wrap(
      <div role="status" className={panel}>
        <p className="mb-3">{s.fails.length ? "Los fallos guardados son de preguntas que ya no están en el banco." : "🎉 La mazmorra está vacía: no tienes ningún fallo pendiente."}</p>
        <div className="flex flex-wrap gap-2">
          {s.fails.length ? (
            <button type="button" onClick={() => save({ ...s, fails: [] })} className={cn(btn, "border-[var(--q-bad)] bg-[#6b1a2a]")}>
              Limpiar fallos obsoletos
            </button>
          ) : null}
          {toMap}
        </div>
      </div>,
    );

  if (!run && mode !== "dungeon" && gen.status === "loading")
    return wrap(
      <div role="status" aria-live="polite" className={cn(panel, "text-center")} data-testid="quest-loading">
        <div aria-hidden className="quest-pop text-5xl">
          {icon}
        </div>
        <h2 className="my-2 text-xl font-bold break-words">{title}</h2>
        <p className="text-sm text-[var(--q-mute)]">Generando mazmorra…</p>
      </div>,
    );
  if (!run && mode !== "dungeon" && gen.status === "error")
    return wrap(
      <div role="alert" className={panel} data-testid="quest-error">
        <p className="mb-3">{gen.message}</p>
        <div className="flex flex-wrap gap-2">
          {gen.code === 409 ? (
            <Link href="/study" className={cn(btn, "border-[var(--q-gold)] bg-[var(--q-panel2)]")}>
              📚 Subir apuntes
            </Link>
          ) : null}
          <button type="button" onClick={regenerate} data-testid="quest-retry" className={cn(btn, "border-[var(--q-lin)] bg-[#12452e]")}>
            ↻ Reintentar
          </button>
          {toMap}
        </div>
      </div>,
    );

  if (!run)
    return wrap(
      <div className={cn(panel, "quest-pop text-center")}>
        <div aria-hidden className="text-5xl">
          {icon}
        </div>
        <h2 className="my-2 text-xl font-bold break-words">{title}</h2>
        <p className="mb-4 text-sm text-[var(--q-mute)]">
          {mode === "dungeon"
            ? `Vidas infinitas. Cada acierto saca la pregunta de la mazmorra (${formatInt(dungeonItems.length)} pendientes, hasta 15 por partida).`
            : isExam
              ? `Simulacro de ${formatInt(gen.status === "ready" ? (gen.minutes ?? 35) : 35)} minutos, ${formatInt(gen.status === "ready" ? gen.items.length : 0)} preguntas, sin vidas ni pistas y sin corrección hasta el final. Nota sobre 10.`
              : `${mode === "boss" ? "Sin pistas. " : ""}Tienes 3 ❤️: cada fallo te quita una. Con 80 % consigues ★★. ${gen.status === "ready" && gen.source === "pack" ? "Preguntas de tu paquete de estudio." : "Preguntas generadas desde tus apuntes."}`}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" onClick={begin} data-testid="quest-start" className={cn(btn, "border-[var(--q-lin)] bg-[#12452e]")}>
            ▶ Empezar
          </button>
          {toMap}
        </div>
      </div>,
    );

  if (exam && run) {
    const review = run.log.map((l, i) => ({ l, i })).filter(({ l }) => !l.ok || l.pts < 1);
    const fb10 = (n: number | null) => (n === null ? "—" : formatDec(n, 1));
    return wrap(
      <>
        <div className={cn(panel, "quest-pop text-center")} data-testid="quest-exam-result">
          <div aria-hidden className="text-5xl">
            🏆
          </div>
          <h2 className="my-1 text-xl font-bold">Examen final</h2>
          <div aria-label={`${exam.stars} de 3 estrellas`} role="img" className="text-3xl tracking-widest text-[#3a4377]" data-stars={exam.stars}>
            {[1, 2, 3].map((k) => (
              <span key={k} className={k <= exam.stars ? "text-[var(--q-gold)]" : ""}>
                ★
              </span>
            ))}
          </div>
          <div className="font-mono text-5xl font-black text-[var(--q-gold)]" data-testid="quest-nota">
            {formatDec(exam.nota, 1)}
            <span className="text-2xl">/10</span>
          </div>
          <p className="mt-2 text-sm text-[var(--q-mute)]">
            Teoría: <b>{fb10(exam.theory)}</b> · Práctica: <b>{fb10(exam.practical)}</b>
          </p>
          <p className="my-2 text-sm text-[var(--q-mute)]">{exam.nota >= 5 ? (exam.stars >= 2 ? "Nota de sobra para aprobar. Repasa lo de abajo para llegar al 10." : "Aprobado justo. Repasa lo de abajo.") : "Aún no llegas al aprobado. Repasa lo de abajo y repite el simulacro."} +{formatInt(run.xp)} XP</p>
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" onClick={regenerate} data-testid="quest-regen" className={cn(btn, "border-[var(--q-lin)] bg-[#12452e]")}>
              ↻ Otro simulacro
            </button>
            {toMap}
            {s.fails.length ? (
              <Link href={`${playBase}?mode=dungeon`} className={cn(btn, "border-[var(--q-bad)] bg-[#6b1a2a]")}>
                💀 Mazmorra ({formatInt(s.fails.length)})
              </Link>
            ) : null}
          </div>
        </div>
        {review.length ? (
          <>
            <h3 className="mt-5 mb-2 text-base font-bold">Lo que tienes que repasar ({review.length})</h3>
            <ul className="grid gap-2" data-testid="quest-review">
              {review.map(({ l, i }) => (
                <li key={i} className="rounded-xl border-2 border-[var(--q-line)] bg-[var(--q-panel)] p-3 text-sm">
                  <ReviewItem l={l} />
                  {l.item.type === "p" && l.ans && l.ans !== "(sin tiempo)" && l.ans !== "(no lo sé)" ? (
                    <button type="button" onClick={() => appealExam(i)} data-testid="quest-appeal" className={cn(btn, "mt-2 border-[var(--q-line)] bg-transparent")}>
                      ⚖️ Mi comando también vale
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </>,
    );
  }

  if (summary) {
    const dead = isDead(run);
    const review = run.log.filter((l) => !l.ok || l.pts < 1);
    const msg = dead
      ? "💀 GAME OVER. Te has quedado sin vidas. Repasa los fallos de abajo y vuelve a intentarlo."
      : mode === "dungeon"
        ? s.fails.length
          ? `Quedan ${s.fails.length} fallos en la mazmorra. Vuelve a entrar hasta vaciarla.`
          : "🎉 ¡Mazmorra vacía! No te queda ningún fallo pendiente."
        : summary.stars === 3
          ? "🏆 ¡Perfecto! Este tema está listo para el 10."
          : summary.stars === 2
            ? "Nivel superado. Para el 10, vuelve a por ★★★ o vacía la mazmorra."
            : "Aún no llegas al 80 %. Lee las soluciones de abajo y repite el nivel.";
    return wrap(
      <>
        <div className={cn(panel, "quest-pop text-center")} data-testid="quest-result">
          <div aria-hidden className="text-5xl">
            {dead ? "💀" : icon}
          </div>
          <h2 className="my-1 text-xl font-bold break-words">{dead ? "GAME OVER" : title}</h2>
          {mode === "dungeon" ? null : (
            <div aria-label={`${summary.stars} de 3 estrellas`} role="img" className="text-3xl tracking-widest text-[#3a4377]" data-stars={summary.stars}>
              {[1, 2, 3].map((k) => (
                <span key={k} className={k <= summary.stars ? "text-[var(--q-gold)]" : ""}>
                  ★
                </span>
              ))}
            </div>
          )}
          <div className="font-mono text-5xl font-black text-[var(--q-gold)]">{summary.pct}%</div>
          <p className="mt-2 text-sm text-[var(--q-mute)]">{msg}</p>
          <p className="my-2 text-sm text-[var(--q-mute)]">+{formatInt(run.xp)} XP</p>
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" onClick={begin} className={cn(btn, "border-[var(--q-lin)] bg-[#12452e]")}>
              ↻ Repetir
            </button>
            {mode !== "dungeon" ? (
              <button type="button" onClick={regenerate} data-testid="quest-regen" className={cn(btn, "border-[var(--q-line)] bg-transparent")}>
                ✨ Nuevas preguntas
              </button>
            ) : null}
            {toMap}
            {mode !== "dungeon" && s.fails.length ? (
              <Link href={`${playBase}?mode=dungeon`} className={cn(btn, "border-[var(--q-bad)] bg-[#6b1a2a]")}>
                💀 Mazmorra ({formatInt(s.fails.length)})
              </Link>
            ) : null}
          </div>
        </div>
        {review.length ? (
          <>
            <h3 className="mt-5 mb-2 text-base font-bold">Lo que tienes que repasar ({review.length})</h3>
            <ul className="grid gap-2" data-testid="quest-review">
              {review.map((l, k) => (
                <li key={k} className="rounded-xl border-2 border-[var(--q-line)] bg-[var(--q-panel)] p-3 text-sm">
                  <ReviewItem l={l} />
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </>,
    );
  }

  const item = fb ? run.items[run.i] : currentItem(run);
  if (!item) return null;
  const lost = !!fb && !fb.ok && run.maxLives !== Infinity;
  const last = run.i + 1 >= run.items.length || run.lives <= 0;
  const p = item.p;
  const t = item.t;
  const e = item.e;
  return wrap(
    <>
      <QuestHud run={run} title={title} icon={icon} mapHref={mapHref} lostHeart={lost} timer={isExam && left !== null ? clock(left) : undefined} />
      <div key={run.i} className={cn(panel, "quest-pop", fb && !fb.ok && "quest-shake")} data-testid="quest-card" data-fail={fb && !fb.ok ? "1" : undefined}>
        {item.type === "t" && t ? (
          <TheoryCard item={item} picked={fb?.picked ?? null} onPick={(k) => answer(!!item.opts?.[k]?.ok, 1, item.opts?.[k]?.t ?? null, k, false)} />
        ) : item.type === "e" && e ? (
          <EssayCard
            key={item.id}
            item={item}
            locked={!!fb}
            onSubmit={(covered, total, text) => {
              const sc = essayScore(covered, total);
              answer(sc.ok, sc.pts, text, null, false, { covered, total });
            }}
          />
        ) : p ? (
          <PracticeCard
            item={item}
            locked={!!fb}
            noHelp={mode === "boss" || isExam}
            onSubmit={(v, hinted) => {
              const ok = v !== null && check(p, v);
              answer(ok, ok ? (hinted ? 0.5 : 1) : 0, v, null, hinted);
            }}
          />
        ) : null}
        {fb ? (
          <div role="status" className={cn("mt-3 rounded-xl border-2 p-3 text-sm", fb.ok ? "border-[var(--q-lin)] bg-[#12452e]" : "border-[var(--q-bad)] bg-[#5a1a28]")} data-testid="quest-feedback">
            <h4 className="mb-1 font-bold">
              {fb.appealed
                ? "⚖️ Aceptado por apelación"
                : e
                  ? fb.ok
                    ? `✔ Bien: cubres ${fb.rubric?.covered}/${fb.rubric?.total} puntos clave`
                    : `✘ Te faltan puntos clave (${fb.rubric?.covered ?? 0}/${fb.rubric?.total ?? e.points.length})`
                  : fb.ok
                    ? fb.hinted
                      ? "✔ Correcto (con pista: ½ punto)"
                      : "✔ ¡Correcto!"
                    : p
                      ? "✘ Respuesta esperada:"
                      : `✘ No. Era: ${t?.[1][0]}`}
            </h4>
            {e ? (
              <>
                <p className="whitespace-pre-line break-words">{e.model}</p>
                {e.exp ? <p className="mt-1">{e.exp}</p> : null}
              </>
            ) : null}
            {fb.appealed && p ? (
              <p className="mt-1 text-[var(--q-mute)]">
                Tu comando: <span className="font-mono break-all">{fb.ans}</span> · Referencia: <span className="font-mono break-all">{p.sol}</span>. Queda en ⚖️ Apelaciones: compruébalo en la máquina virtual antes del examen.
              </p>
            ) : null}
            {p && !fb.appealed ? (
              <>
                <code className="block font-mono break-all">{p.sol}</code>
                {p.exp ? <p className="mt-1">{p.exp}</p> : null}
                {!fb.ok && fb.ans ? <p className="mt-1 text-[var(--q-mute)]">Tú escribiste: <span className="font-mono break-all">{fb.ans}</span></p> : null}
                {!fb.ok && fb.ans && whyWrong(p, fb.ans) ? <p className="mt-1">🧠 <b>Por qué falla:</b> {whyWrong(p, fb.ans)}</p> : null}
              </>
            ) : t?.[2] ? (
              <p>{t[2]}</p>
            ) : null}
            {p && !fb.ok && fb.ans ? (
              <button type="button" onClick={appeal} data-testid="quest-appeal" className={cn(btn, "mt-3 mr-2 border-[var(--q-line)] bg-transparent")}>
                ⚖️ Mi comando también vale
              </button>
            ) : null}
            <button ref={nextRef} type="button" onClick={advance} data-testid="quest-next" className={cn(btn, "mt-3 border-[var(--q-gold)] bg-[var(--q-panel2)]")}>
              {last ? "Ver resultado" : "Siguiente"} →
            </button>
          </div>
        ) : null}
      </div>
    </>,
  );
}

/** Una pregunta de la revisión final: enunciado, respuesta correcta y lo que contestó la usuaria. */
function ReviewItem({ l }: { l: { item: QuestItem; ans: string; appeal?: boolean } }) {
  const it = l.item;
  const q = it.type === "t" ? it.t?.[0] : it.type === "e" ? it.e?.q : it.p?.q;
  return (
    <>
      <b className="break-words">{q}</b>
      <div className="mt-1 text-[var(--q-lin)]">
        ✔ <span className={cn("break-words", it.type !== "e" && "font-mono break-all")}>{it.type === "t" ? it.t?.[1][0] : it.type === "e" ? it.e?.model : it.p?.sol}</span>
      </div>
      {l.ans && l.ans !== "(no lo sé)" ? (
        <div className="text-[var(--q-mute)]">
          Tú: <span className="font-mono break-all">{l.ans}</span>
        </div>
      ) : null}
    </>
  );
}
