"use client";

import { useId, useState } from "react";

import type { PlayItem } from "@/lib/study/quest-play";

const btn = "inline-flex min-h-11 items-center justify-center rounded-[10px] border-2 px-3.5 text-sm font-semibold shadow-[0_4px_0_#0008] active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40";

/**
 * Tarjeta de desarrollo: la usuaria escribe su respuesta, ve la rúbrica (respuesta modelo + puntos clave) y marca los puntos que
 * cubrió. La nota sale de ahí (≥ 60 % acierta); no se envía nada a la IA.
 */
export function EssayCard({ item, locked, onSubmit }: { item: PlayItem; locked: boolean; onSubmit: (covered: number, total: number, text: string) => void }) {
  const e = item.e!;
  const id = useId();
  const [text, setText] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [marks, setMarks] = useState<boolean[]>(() => e.points.map(() => false));
  const covered = marks.filter(Boolean).length;
  return (
    <div>
      <span className="inline-block rounded-md bg-[#ffd23f26] px-2 py-0.5 font-mono text-[11px] font-bold text-[var(--q-gold)]">DESARROLLO · autocorrección con rúbrica</span>
      <p className="mt-2 mb-3 text-[17px] leading-snug font-semibold break-words">{e.q}</p>
      <label htmlFor={`${id}-a`} className="mb-1 block text-sm text-[var(--q-mute)]">
        Tu respuesta
      </label>
      <textarea
        id={`${id}-a`}
        value={text}
        onChange={(ev) => setText(ev.target.value)}
        disabled={locked || revealed}
        rows={5}
        maxLength={4000}
        className="min-h-28 w-full rounded-xl border-2 border-[var(--q-line)] bg-black p-2.5 text-base text-[var(--q-ink)] outline-none focus:border-[var(--q-gold)] disabled:opacity-70"
        placeholder="Escríbela con tus palabras antes de mirar la rúbrica…"
      />
      {!revealed ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={locked} onClick={() => setRevealed(true)} data-testid="essay-reveal" className={`${btn} border-[var(--q-gold)] bg-[var(--q-panel2)]`}>
            👁 Ver la rúbrica
          </button>
          <button type="button" disabled={locked} onClick={() => onSubmit(0, e.points.length, "(no lo sé)")} className={`${btn} border-[var(--q-line)] bg-transparent`}>
            🤷 No lo sé
          </button>
        </div>
      ) : (
        <div className="mt-3 grid gap-3" data-testid="essay-rubric">
          <div className="rounded-xl border-2 border-[var(--q-lin)] bg-[#12452e] p-3 text-sm">
            <b>Respuesta modelo</b>
            <p className="mt-1 break-words whitespace-pre-line">{e.model}</p>
          </div>
          <fieldset className="grid gap-1.5">
            <legend className="mb-1 text-sm font-semibold">Marca los puntos clave que tu respuesta cubría:</legend>
            {e.points.map((p, i) => (
              <label key={i} className="flex min-h-11 items-start gap-2.5 rounded-lg border-2 border-[var(--q-line)] bg-[var(--q-panel)] p-2.5 text-sm">
                <input type="checkbox" className="mt-0.5 size-5 shrink-0" checked={marks[i]} disabled={locked} onChange={() => setMarks((m) => m.map((x, j) => (j === i ? !x : x)))} />
                <span className="break-words">{p}</span>
              </label>
            ))}
          </fieldset>
          <button type="button" disabled={locked} onClick={() => onSubmit(covered, e.points.length, text.trim() || "(sin texto)")} data-testid="essay-confirm" className={`${btn} border-[var(--q-lin)] bg-[#12452e]`}>
            Confirmar ({covered}/{e.points.length})
          </button>
        </div>
      )}
    </div>
  );
}
