"use client";

import { useRef, useState } from "react";

import { PROMPT } from "@/lib/study/quest-engine";
import type { PlayItem } from "@/lib/study/quest-play";

const btn = "inline-flex min-h-11 items-center justify-center rounded-[10px] border-2 px-3.5 text-sm font-semibold shadow-[0_4px_0_#0008] active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40";

/** Tarjeta de práctica: terminal simulada. Intro comprueba; la pista (no en el Jefe) descubre el principio y vale ½ punto. */
export function PracticeCard({ item, locked, noHelp, onSubmit }: { item: PlayItem; locked: boolean; noHelp: boolean; onSubmit: (value: string | null, hinted: boolean) => void }) {
  const p = item.p!;
  const ref = useRef<HTMLInputElement>(null);
  const [hint, setHint] = useState(false);
  const words = p.sol.split(" ");
  const start = words.slice(0, Math.max(1, Math.ceil(words.length / 3))).join(" ");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const v = ref.current?.value ?? "";
        if (!v.trim()) return ref.current?.focus();
        onSubmit(v, hint);
      }}
    >
      <span className="inline-block rounded-md bg-[#3dff9a26] px-2 py-0.5 font-mono text-[11px] font-bold text-[var(--q-lin)]">PRÁCTICA · escribe el comando</span>
      <p className="mt-2 mb-3 text-[17px] leading-snug font-semibold break-words">{p.q}</p>
      <div className="overflow-hidden rounded-xl border-2 border-[var(--q-line)] bg-black">
        <div className="flex gap-1.5 bg-[var(--q-panel2)] px-2.5 py-1.5" aria-hidden>
          <i className="size-2.5 rounded-full bg-[#ff5f56]" />
          <i className="size-2.5 rounded-full bg-[#ffbd2e]" />
          <i className="size-2.5 rounded-full bg-[#27c93f]" />
        </div>
        <label className="flex flex-wrap items-center gap-x-2 p-2.5 font-mono">
          <span className="text-[13px] font-bold whitespace-nowrap text-[var(--q-lin)]">{PROMPT[p.sh]}</span>
          <input
            ref={ref}
            name="cmd"
            aria-label="Comando"
            disabled={locked}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="escribe aquí…"
            className="min-h-11 min-w-0 flex-1 basis-40 bg-transparent text-base text-[var(--q-ink)] outline-none placeholder:text-[var(--q-mute)]/60 disabled:opacity-60"
          />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="submit" disabled={locked} className={`${btn} border-[var(--q-lin)] bg-[#12452e]`}>
          Comprobar ⏎
        </button>
        {noHelp ? null : (
          <button type="button" disabled={locked || hint} onClick={() => setHint(true)} className={`${btn} border-[var(--q-line)] bg-[var(--q-panel2)]`}>
            💡 Pista
          </button>
        )}
        <button type="button" disabled={locked} onClick={() => onSubmit(null, hint)} className={`${btn} border-[var(--q-line)] bg-transparent`}>
          🤷 No lo sé
        </button>
      </div>
      {hint && !locked ? (
        <p className="mt-2 rounded-lg border border-dashed border-[var(--q-gold)] p-2 text-sm" data-testid="quest-hint">
          💡 Empieza por: <b className="font-mono">{start}</b> …
        </p>
      ) : null}
    </form>
  );
}
