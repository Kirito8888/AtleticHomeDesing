"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { PALETTE } from "@/components/study/quest/palette";
import { PracticeCard } from "@/components/study/quest/practice-card";
import { QuestHud } from "@/components/study/quest/quest-hud";
import { TheoryCard } from "@/components/study/quest/theory-card";
import { useQuestStore } from "@/components/study/quest/use-quest-store";
import type { Tag } from "@/lib/study/adhd-report";
import { formatInt } from "@/lib/format";
import { cn } from "@/lib/utils";
import { buildQuestMap, isUnlocked } from "@/lib/study/quest";
import { check, whyWrong } from "@/lib/study/quest-engine";
import { BOSS_COUNTS, bossPool, itemById, levelItems, type QuestItem } from "@/lib/study/quest-mock";
import { answerRun, currentItem, finishRun, isDead, next, shuffle, startRun, type Run, type RunMode, type Summary } from "@/lib/study/quest-play";

interface Feedback {
  ok: boolean;
  pts: number;
  ans: string | null;
  picked: number | null;
  hinted: boolean;
}

const btn = "inline-flex min-h-11 items-center justify-center rounded-[10px] border-2 px-3.5 text-sm font-semibold shadow-[0_4px_0_#0008] active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40";
const panel = "rounded-2xl border-2 border-[var(--q-line)] bg-[var(--q-panel)] p-4";

/** v2.5 · Modo Juego, parte 4: la partida (teoría, terminal de práctica, vidas, combos y mazmorra). Preguntas mock; todo en cliente. */
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
  const [run, setRun] = useState<Run | null>(null);
  const [fb, setFb] = useState<Feedback | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (fb) nextRef.current?.focus();
  }, [fb]);

  const idx = mode === "dungeon" ? -1 : nodes.findIndex((n) => n.id === nodeId);
  const node = idx >= 0 ? nodes[idx] : null;
  const title = mode === "dungeon" ? "Mazmorra de fallos" : mode === "boss" ? "Jefe Final" : (node?.title ?? "");
  const icon = mode === "dungeon" ? "💀" : mode === "boss" ? "🐉" : "📘";

  // Ids guardados que ya no existen en el banco se ignoran.
  const dungeonItems = useMemo(() => s.fails.map(itemById).filter((x): x is QuestItem => !!x), [s.fails]);

  const begin = useCallback(() => {
    let items: QuestItem[] = [];
    if (mode === "dungeon") items = dungeonItems;
    else if (mode === "boss") {
      const pool = bossPool();
      items = shuffle([...shuffle(pool.filter((x) => x.type === "t")).slice(0, BOSS_COUNTS.t), ...shuffle(pool.filter((x) => x.type === "p")).slice(0, BOSS_COUNTS.p)]);
    } else if (node) items = shuffle(levelItems(node.n));
    if (!items.length) return;
    setRun(startRun(mode === "dungeon" ? "dungeon" : nodeId, mode, items));
    setFb(null);
    setSummary(null);
  }, [mode, node, nodeId, dungeonItems]);

  const answer = (ok: boolean, pts: number, ans: string | null, picked: number | null, hinted: boolean) => {
    if (!run || fb) return;
    const r = answerRun(run, s.fails, ok, pts, ans ?? "(no lo sé)");
    save({ ...s, fails: r.fails });
    setRun(r.run);
    setFb({ ok, pts, ans, picked, hinted });
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

  if (mode !== "dungeon" && !node)
    return wrap(
      <p role="status" className={panel}>
        Ese nivel no existe en esta asignatura. {toMap}
      </p>,
    );
  if (mode !== "dungeon" && !isUnlocked(nodes, idx, s))
    return wrap(
      <div role="status" className={panel} data-testid="quest-locked">
        <p className="mb-3">🔒 Este nivel sigue bloqueado: necesitas ★★ (80 %) en el anterior, o activar el modo libre en el mapa.</p>
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
            : `${mode === "boss" ? "Sin pistas. " : ""}Tienes 3 ❤️: cada fallo te quita una. Con 80 % consigues ★★. Preguntas de ejemplo (mock) hasta que lleguen las de tus apuntes.`}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" onClick={begin} data-testid="quest-start" className={cn(btn, "border-[var(--q-lin)] bg-[#12452e]")}>
            ▶ Empezar
          </button>
          {toMap}
        </div>
      </div>,
    );

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
                  <b className="break-words">{l.item.type === "t" ? l.item.t?.[0] : l.item.p?.q}</b>
                  <div className="mt-1 text-[var(--q-lin)]">
                    ✔ <span className="font-mono break-all">{l.item.type === "t" ? l.item.t?.[1][0] : l.item.p?.sol}</span>
                  </div>
                  {l.ans && l.ans !== "(no lo sé)" ? (
                    <div className="text-[var(--q-mute)]">
                      Tú: <span className="font-mono break-all">{l.ans}</span>
                    </div>
                  ) : null}
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
  return wrap(
    <>
      <QuestHud run={run} title={title} icon={icon} mapHref={mapHref} lostHeart={lost} />
      <div key={run.i} className={cn(panel, "quest-pop", fb && !fb.ok && "quest-shake")} data-testid="quest-card" data-fail={fb && !fb.ok ? "1" : undefined}>
        {item.type === "t" && t ? (
          <TheoryCard item={item} picked={fb?.picked ?? null} onPick={(k) => answer(!!item.opts?.[k]?.ok, 1, item.opts?.[k]?.t ?? null, k, false)} />
        ) : p ? (
          <PracticeCard
            item={item}
            locked={!!fb}
            noHelp={mode === "boss"}
            onSubmit={(v, hinted) => {
              const ok = v !== null && check(p, v);
              answer(ok, ok ? (hinted ? 0.5 : 1) : 0, v, null, hinted);
            }}
          />
        ) : null}
        {fb ? (
          <div role="status" className={cn("mt-3 rounded-xl border-2 p-3 text-sm", fb.ok ? "border-[var(--q-lin)] bg-[#12452e]" : "border-[var(--q-bad)] bg-[#5a1a28]")} data-testid="quest-feedback">
            <h4 className="mb-1 font-bold">{fb.ok ? (fb.hinted ? "✔ Correcto (con pista: ½ punto)" : "✔ ¡Correcto!") : p ? "✘ Respuesta esperada:" : `✘ No. Era: ${t?.[1][0]}`}</h4>
            {p ? (
              <>
                <code className="block font-mono break-all">{p.sol}</code>
                {p.exp ? <p className="mt-1">{p.exp}</p> : null}
                {!fb.ok && fb.ans ? <p className="mt-1 text-[var(--q-mute)]">Tú escribiste: <span className="font-mono break-all">{fb.ans}</span></p> : null}
                {!fb.ok && fb.ans && whyWrong(p, fb.ans) ? <p className="mt-1">🧠 <b>Por qué falla:</b> {whyWrong(p, fb.ans)}</p> : null}
              </>
            ) : t?.[2] ? (
              <p>{t[2]}</p>
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
