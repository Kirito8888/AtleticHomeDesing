import Link from "next/link";

import { formatInt } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Run } from "@/lib/study/quest-play";

const chip = "inline-flex min-h-9 items-center rounded-[10px] border-2 border-[var(--q-line)] bg-[var(--q-panel)] px-2.5 font-mono text-[13px] whitespace-nowrap";

/** Cabecera de la partida: salir, título, combo, corazones y contador; debajo, la barra de progreso. */
export function QuestHud({ run, title, icon, mapHref, lostHeart }: { run: Run; title: string; icon: string; mapHref: string; lostHeart: boolean }) {
  const total = run.items.length;
  const pct = Math.round((run.i / total) * 100);
  const infinite = run.maxLives === Infinity;
  return (
    <>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Link href={mapHref} className={cn(chip, "min-h-11 border-[var(--q-line)] bg-transparent font-sans text-sm font-semibold")}>
          ← Mapa
        </Link>
        <div className="mr-auto min-w-0 text-[15px] font-bold break-words">
          <span aria-hidden>{icon}</span> {title}
        </div>
        {run.combo >= 3 ? (
          <span className="font-mono font-extrabold text-[var(--q-gold)]" data-testid="quest-combo">
            🔥 x{run.combo}
          </span>
        ) : null}
        {infinite ? (
          <span className={chip} aria-label="Vidas infinitas">
            ❤️ ∞
          </span>
        ) : (
          <span className="text-xl tracking-wider" role="img" aria-label={`${run.lives} de ${run.maxLives} vidas`} data-testid="quest-hearts" data-lives={run.lives}>
            {Array.from({ length: run.maxLives }, (_, k) => (
              <span key={k} className={cn("inline-block", lostHeart && k === run.lives && "quest-shake")} data-testid={k < run.lives ? "quest-heart-full" : "quest-heart-empty"}>
                {k < run.lives ? "❤️" : "🖤"}
              </span>
            ))}
          </span>
        )}
        <span className={chip}>
          {formatInt(Math.min(run.i + 1, total))}/{formatInt(total)}
        </span>
      </div>
      <div role="progressbar" aria-label="Progreso del nivel" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="mb-3 h-2.5 overflow-hidden rounded-full bg-[var(--q-panel2)]">
        <i className="block h-full bg-gradient-to-r from-[var(--q-lin)] to-[var(--q-gold)] transition-[width]" style={{ width: `${pct}%` }} />
      </div>
    </>
  );
}
