"use client";

import Link from "next/link";
import { useCallback, useMemo, useSyncExternalStore, type CSSProperties } from "react";

import { formatInt } from "@/lib/format";
import { cn } from "@/lib/utils";
import { TAG_EMOJI, type Tag } from "@/lib/study/adhd-report";
import { buildQuestMap, currentIndex, isUnlocked, maxStars, parseQuest, questKey, rankFor, starsOf, totalStars, type QuestState } from "@/lib/study/quest";

// Paleta de ASO_Quest.html: el mapa es oscuro en ambos temas, como el juego original.
const PALETTE = {
  "--q-bg": "#0d1020",
  "--q-bg2": "#141a33",
  "--q-panel": "#1a2142",
  "--q-panel2": "#222b55",
  "--q-line": "#2f3a6e",
  "--q-ink": "#eef1ff",
  "--q-mute": "#9aa4d4",
  "--q-lin": "#3dff9a",
  "--q-gold": "#ffd23f",
  "--q-bad": "#ff5470",
  "--q-fin": "#c084fc",
} as CSSProperties;

const EVENT = "atlenza-quest";
const subscribe = (cb: () => void) => {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENT, cb);
  };
};

/** v2.5 · Modo Juego, parte 3: mapa de aventura con un nivel por tema. Aún sin preguntas: pulsar un nivel solo avisa. */
export function QuestMap({ moduleId, moduleName, topics }: { moduleId: string; moduleName: string; topics: { id: string; name: string; tag: Tag; minutes: number }[] }) {
  const key = questKey(moduleId);
  // Lectura de localStorage sin romper la hidratación: en el servidor es null (partida vacía).
  const raw = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    () => null,
  );
  const s = useMemo(() => parseQuest(raw), [raw]);
  const nodes = useMemo(() => buildQuestMap(topics), [topics]);

  const save = useCallback(
    (next: QuestState) => {
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* sin almacenamiento: el cambio no se conserva */
      }
      window.dispatchEvent(new Event(EVENT));
    },
    [key],
  );

  if (!nodes.length)
    return (
      <p role="status" className="rounded-lg border p-3 text-sm text-muted-foreground">
        Esta asignatura aún no tiene temas, y cada tema es un nivel del mapa.{" "}
        <Link href={`/study/modules/${moduleId}`} className="underline underline-offset-4">
          Añade temas
        </Link>
        .
      </p>
    );

  const stars = totalStars(nodes, s);
  const max = maxStars(nodes);
  const cur = currentIndex(nodes, s);
  const chip = "inline-flex min-h-9 items-center rounded-[10px] border-2 border-[var(--q-line)] bg-[var(--q-panel)] px-2.5 font-mono text-[13px] whitespace-nowrap";
  const btn = "inline-flex min-h-11 items-center justify-center rounded-[10px] border-2 px-3.5 text-sm font-semibold shadow-[0_4px_0_#0008] active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div style={PALETTE} className="rounded-2xl bg-[var(--q-bg)] p-3 text-[var(--q-ink)]" data-testid="quest">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="mr-auto min-w-0 font-mono text-xl font-black tracking-wider break-words [text-shadow:0_0_12px_#6d7cff,3px_3px_0_#000]">
          {moduleName.toUpperCase()}
          <span className="text-[var(--q-lin)]">_</span>QUEST
        </div>
        <div className={chip} data-testid="quest-rank">{rankFor(stars, max)}</div>
        <div className={chip}>
          ★ <b className="mx-1 text-[var(--q-gold)]">{formatInt(stars)}</b>/{formatInt(max)}
        </div>
        <div className={chip}>
          XP <b className="ml-1 text-[var(--q-gold)]" data-testid="quest-xp">{formatInt(s.xp)}</b>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!s.fails.length}
          onClick={() => window.alert(`Mazmorra de fallos: ${s.fails.length} pregunta(s). Aún no hay preguntas en este bloque.`)}
          className={cn(btn, "border-[var(--q-bad)] bg-[#6b1a2a]")}
        >
          💀 Mazmorra de fallos ({formatInt(s.fails.length)})
        </button>
        <button
          type="button"
          aria-pressed={s.free}
          onClick={() => save({ ...s, free: !s.free })}
          className={cn(btn, "border-[var(--q-line)] bg-transparent")}
        >
          {s.free ? "🔓 Modo libre: ON" : "🔒 Modo libre: OFF"}
        </button>
      </div>

      <div className="mb-2 flex items-center gap-2.5 font-mono text-[15px] font-extrabold tracking-wide">
        📚 MAPA DE TEMAS
        <span className="h-0.5 flex-1 bg-gradient-to-r from-[var(--q-line)] to-transparent" />
      </div>
      <ol className="grid gap-3">
        {nodes.map((n, i) => {
          const locked = !isUnlocked(nodes, i, s);
          const st = starsOf(s, n.id);
          const best = s.lv[n.id]?.best;
          const boss = n.kind === "boss";
          const acc = boss ? "var(--q-fin)" : "var(--q-lin)";
          return (
            <li key={n.id}>
              <button
                type="button"
                disabled={locked}
                data-node={n.id}
                aria-label={`${boss ? "Jefe Final" : `Nivel ${n.n}: ${n.title}`}${locked ? " (bloqueado)" : ""}, ${st} de 3 estrellas`}
                style={{ "--acc": acc } as CSSProperties}
                onClick={() => window.alert(`${boss ? "Jefe Final" : `Nivel ${n.n} · ${n.title}`}: las preguntas llegan en el siguiente bloque.`)}
                className={cn(
                  "relative block min-h-11 w-full rounded-[14px] border-2 border-[var(--q-line)] bg-[var(--q-panel)] p-3 text-left shadow-[0_5px_0_#0009] enabled:hover:border-[var(--acc)] disabled:cursor-not-allowed disabled:opacity-40 disabled:grayscale-[.6]",
                  boss && "bg-gradient-to-br from-[#2f1a52] to-[var(--q-panel)]",
                  i === cur && "border-[var(--acc)] shadow-[0_0_18px_color-mix(in_srgb,var(--acc)_45%,transparent),0_5px_0_#0009]",
                )}
              >
                {locked ? (
                  <span aria-hidden className="absolute top-2.5 right-3 text-base" data-testid="quest-lock">
                    🔒
                  </span>
                ) : null}
                <span className="block font-mono text-[11px] text-[var(--q-mute)]">{boss ? "FINAL" : `NIVEL ${n.n}`}</span>
                <span aria-hidden className="block text-2xl leading-none">
                  {boss ? "🐉" : "📘"}
                </span>
                <span className="mt-1.5 mb-1 block text-[15px] font-bold break-words">{n.title}</span>
                <span className="block min-h-5 font-mono text-[11px] text-[var(--q-mute)]">
                  {boss ? "Mezcla de todos los temas" : `${TAG_EMOJI[n.tag as Tag]} · ${formatInt(n.minutes)} min`}
                </span>
                <span className="flex items-center justify-between">
                  <span aria-hidden className="text-lg tracking-widest text-[#3a4377]">
                    {[1, 2, 3].map((k) => (
                      <span key={k} className={k <= st ? "text-[var(--q-gold)] [text-shadow:0_0_8px_#ffd23f88]" : ""}>
                        ★
                      </span>
                    ))}
                  </span>
                  {best != null ? <span className="font-mono text-[11px] text-[var(--q-mute)]">mejor {formatInt(best)}%</span> : null}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="mt-4 text-sm leading-relaxed text-[var(--q-mute)]">
        Tu progreso se guarda en este dispositivo. Para pasar de nivel necesitas <b className="text-[var(--q-ink)]">★★ (80 %)</b>. El modo libre desbloquea todos los niveles.
      </p>
    </div>
  );
}
