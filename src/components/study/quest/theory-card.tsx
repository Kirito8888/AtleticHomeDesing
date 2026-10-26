"use client";

import { useEffect, useMemo } from "react";

import { cn } from "@/lib/utils";
import type { PlayItem } from "@/lib/study/quest-play";

/** Tarjeta de teoría: 4 botones (teclas 1–4). Tras responder se marcan la correcta y, si falló, la elegida. */
export function TheoryCard({ item, picked, onPick }: { item: PlayItem; picked: number | null; onPick: (k: number) => void }) {
  const opts = useMemo(() => item.opts ?? [], [item.opts]);
  const answered = picked !== null;
  useEffect(() => {
    if (answered) return;
    const on = (e: KeyboardEvent) => {
      if (/^[1-4]$/.test(e.key) && opts[Number(e.key) - 1]) onPick(Number(e.key) - 1);
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [answered, opts, onPick]);
  return (
    <>
      <span className="inline-block rounded-md bg-[#6d7cff33] px-2 py-0.5 font-mono text-[11px] font-bold text-[#aab4ff]">TEORÍA</span>
      <p className="mt-2 mb-3 text-[17px] leading-snug font-semibold break-words">{item.t?.[0]}</p>
      <div className="grid gap-2">
        {opts.map((o, k) => (
          <button
            key={k}
            type="button"
            disabled={answered}
            data-opt={k}
            onClick={() => onPick(k)}
            className={cn(
              "flex min-h-12 w-full items-center gap-3 rounded-xl border-2 border-[var(--q-line)] bg-[var(--q-panel2)] p-2.5 text-left text-[15px] shadow-[0_3px_0_#0008] enabled:hover:border-[var(--q-lin)]",
              answered && o.ok && "border-[var(--q-lin)] bg-[#12452e] disabled:opacity-100",
              answered && picked === k && !o.ok && "border-[var(--q-bad)] bg-[#5a1a28] disabled:opacity-100",
              answered && !o.ok && picked !== k && "opacity-60",
            )}
          >
            <span className="grid size-7 shrink-0 place-items-center rounded-md bg-[var(--q-bg)] font-mono text-[13px]">{k + 1}</span>
            <span className="min-w-0 break-words">{o.t}</span>
          </button>
        ))}
      </div>
      {!answered ? <p className="mt-2 hidden font-mono text-[11px] text-[var(--q-mute)] md:block">Teclas 1-4 para responder · Intro para seguir</p> : null}
    </>
  );
}
