"use client";

import Link from "next/link";
import { useMemo, useRef, useState, type CSSProperties } from "react";
import { toast } from "sonner";

import { PALETTE } from "@/components/study/quest/palette";
import { useQuestStore } from "@/components/study/quest/use-quest-store";
import { confirmDialog } from "@/components/ui/confirm-dialog";

import { formatDateTime, formatDec, formatInt } from "@/lib/format";
import { cn } from "@/lib/utils";
import { TAG_EMOJI, type Tag } from "@/lib/study/adhd-report";
import { BOSS_ID, buildQuestMap, currentIndex, FINAL_ID, isUnlocked, maxStars, rankFor, starsOf, totalStars, UNLOCK_STARS } from "@/lib/study/quest";

const NODE_PROPS = {
  className:
    "relative block min-h-11 w-full rounded-[14px] border-2 border-[var(--q-line)] bg-[var(--q-panel)] p-3 text-left shadow-[0_5px_0_#0009] hover:border-[var(--acc)] disabled:cursor-not-allowed disabled:opacity-40 disabled:grayscale-[.6] disabled:hover:border-[var(--q-line)]",
};

/** v2.5 · Modo Juego, partes 3 y 4: mapa de aventura con un nivel por tema; cada nodo desbloqueado abre la partida. */
export function QuestMap({ moduleId, moduleName, topics }: { moduleId: string; moduleName: string; topics: { id: string; name: string; tag: Tag; minutes: number }[] }) {
  // Partida en localStorage sincronizada con el servidor (en el servidor de render es la partida vacía, sin romper la hidratación).
  const [s, save, reset] = useQuestStore(moduleId);
  const [howOpen, setHowOpen] = useState(false);
  const howRef = useRef<HTMLElement>(null);
  const nodes = useMemo(() => buildQuestMap(topics), [topics]);
  const [view, setView] = useState<"map" | "appeals">("map");

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

  const playBase = `/study/modules/${moduleId}/quest/play`;
  const stars = totalStars(nodes, s);
  const max = maxStars(nodes);
  const cur = currentIndex(nodes, s);
  const chip = "inline-flex min-h-9 items-center rounded-[10px] border-2 border-[var(--q-line)] bg-[var(--q-panel)] px-2.5 font-mono text-[13px] whitespace-nowrap";
  const btn =
    "inline-flex min-h-11 items-center justify-center rounded-[10px] border-2 px-3.5 text-sm font-semibold shadow-[0_4px_0_#0008] active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40";

  if (view === "appeals")
    return (
      <div style={PALETTE} className="rounded-2xl bg-[var(--q-bg)] p-3 text-[var(--q-ink)]" data-testid="quest-appeals-view">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setView("map")} className={cn(btn, "border-[var(--q-line)] bg-transparent")}>
            ← Mapa
          </button>
          <h2 className="text-lg font-bold">⚖️ Apelaciones</h2>
        </div>
        <p className="mb-3 text-sm text-[var(--q-mute)]">
          Comandos que diste por buenos aunque no coincidían con la referencia. <b className="text-[var(--q-ink)]">Pruébalos en la máquina virtual</b>: si hacen lo mismo, bórralos de la lista; si no, apréndete la referencia.
        </p>
        <ul className="grid gap-2">
          {(s.appeals ?? []).map((a, i) => (
            <li key={`${a.q}-${i}`} className="rounded-xl border-2 border-[var(--q-line)] bg-[var(--q-panel)] p-3 text-sm">
              <b className="break-words">{a.q}</b>
              <div className="mt-1">
                Tú: <span className="font-mono break-all text-[var(--q-gold)]">{a.ans}</span>
              </div>
              <div>
                Referencia: <span className="font-mono break-all text-[var(--q-lin)]">{a.sol}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  const rest = (s.appeals ?? []).filter((_, j) => j !== i);
                  const { appeals: _drop, ...others } = s;
                  void _drop;
                  save(rest.length ? { ...others, appeals: rest } : others);
                  if (!rest.length) setView("map");
                }}
                className={cn(btn, "mt-2 border-[var(--q-lin)] bg-[#12452e]")}
              >
                ✔ Comprobado, funciona
              </button>
            </li>
          ))}
        </ul>
      </div>
    );

  return (
    <div style={PALETTE} className="rounded-2xl bg-[var(--q-bg)] p-3 text-[var(--q-ink)]" data-testid="quest">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="mr-auto min-w-0 font-mono text-xl font-black tracking-wider break-words [text-shadow:0_0_12px_#6d7cff,3px_3px_0_#000]">
          {moduleName.toUpperCase()}
          <span className="text-[var(--q-lin)]">_</span>QUEST
        </div>
        <div className={chip} data-testid="quest-rank">
          {rankFor(stars, max)}
        </div>
        <div className={chip}>
          ★ <b className="mx-1 text-[var(--q-gold)]">{formatInt(stars)}</b>/{formatInt(max)}
        </div>
        <div className={chip}>
          XP{" "}
          <b className="ml-1 text-[var(--q-gold)]" data-testid="quest-xp">
            {formatInt(s.xp)}
          </b>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {s.fails.length ? (
          <Link href={`${playBase}?mode=dungeon`} data-testid="quest-dungeon" className={cn(btn, "border-[var(--q-bad)] bg-[#6b1a2a]")}>
            💀 Mazmorra de fallos ({formatInt(s.fails.length)})
          </Link>
        ) : (
          <button type="button" disabled data-testid="quest-dungeon" className={cn(btn, "border-[var(--q-bad)] bg-[#6b1a2a]")}>
            💀 Mazmorra de fallos (0)
          </button>
        )}
        <button type="button" disabled={!s.appeals?.length} onClick={() => setView("appeals")} data-testid="quest-appeals" className={cn(btn, "border-[var(--q-line)] bg-[var(--q-panel2)]")}>
          ⚖️ Apelaciones ({formatInt(s.appeals?.length ?? 0)})
        </button>
        <button type="button" aria-pressed={s.free} onClick={() => save({ ...s, free: !s.free })} className={cn(btn, "border-[var(--q-line)] bg-transparent")}>
          {s.free ? "🔓 Modo libre: ON" : "🔒 Modo libre: OFF"}
        </button>
        <button
          type="button"
          data-testid="quest-how-open"
          aria-expanded={!s.seen || howOpen}
          aria-controls="quest-how"
          onClick={() => {
            setHowOpen(true);
            setTimeout(() => howRef.current?.focus(), 0);
          }}
          className={cn(btn, "border-[var(--q-line)] bg-transparent")}
        >
          ❓ Cómo se juega
        </button>
        <button
          type="button"
          data-testid="quest-reset"
          onClick={async () => {
            if (
              await confirmDialog({
                title: "¿Reiniciar la partida de esta asignatura?",
                description: "Se borran estrellas, XP, mazmorra, apelaciones e historial de exámenes, en este dispositivo y en tu cuenta (todos tus dispositivos). No se puede deshacer.",
                confirmLabel: "Reiniciar partida",
                destructive: true,
              })
            ) {
              setHowOpen(false);
              if (!(await reset())) toast.info("Se reinició en este dispositivo; se sincronizará al volver la conexión.");
            }
          }}
          className={cn(btn, "border-[var(--q-bad)] bg-transparent")}
        >
          ↺ Reiniciar partida
        </button>
      </div>

      {!s.seen || howOpen ? (
        <section id="quest-how" ref={howRef} tabIndex={-1} aria-label="Cómo se juega" className="mb-4 rounded-2xl border-2 border-[var(--q-gold)] bg-[var(--q-panel)] p-4 text-sm leading-relaxed" data-testid="quest-how">
          <b className="text-[17px]">Cómo se juega</b>
          <ul className="mt-2 grid gap-1.5">
            <li>• Cada <b>nivel</b> es un tema: preguntas de <b>teoría</b> (test, teclas 1–4), de <b>desarrollo</b> (te autocorriges con una rúbrica) y <b>prácticas</b> donde escribes el comando en una terminal.</li>
            <li>• Tienes <b>3 ❤️</b> por nivel. Cada fallo quita una; con 0, game over.</li>
            <li>• <b>★ 60 % · ★★ 80 % · ★★★ 100 %</b>. Necesitas ★★ para desbloquear el siguiente nivel.</li>
            <li>• <b>Pista</b> = enseña el inicio del comando, pero el acierto vale la mitad. <b>No lo sé</b> = te enseña la solución y cuenta como fallo.</li>
            <li>• <b>Combo</b>: los aciertos seguidos suman; desde ×3 ganas +5 XP extra por acierto. Un fallo lo rompe.</li>
            <li>• Todo lo que fallas va a la <b>💀 Mazmorra de fallos</b>. Vacíala: ahí está tu 10.</li>
            <li>• El <b>Jefe</b> mezcla los temas y no tiene pistas. El <b>Examen final</b> es un simulacro cronometrado con nota sobre 10.</li>
            <li>• Se aceptan <b>formas equivalentes</b> de un comando: opciones en otro orden, juntas o separadas, largas o cortas, con o sin <code>sudo</code>, con o sin comillas.</li>
            <li>• Si estás seguro de que tu comando también vale, pulsa <b>⚖️ Mi comando también vale</b>: cuenta como acierto y queda en <b>Apelaciones</b> para que lo pruebes en la máquina virtual.</li>
            <li>• <b>Modo libre</b> desbloquea todo, para repasar un tema concreto la víspera.</li>
          </ul>
          <button type="button" onClick={() => {
              setHowOpen(false);
              if (!s.seen) save({ ...s, seen: true });
            }}
            data-testid="quest-how-ok" className={cn(btn, "mt-3 border-[var(--q-lin)] bg-[#12452e]")}>
            ¡Entendido, a jugar!
          </button>
        </section>
      ) : null}

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
          const label = `${boss ? "Jefe Final" : `Nivel ${n.n}: ${n.title}`}${locked ? " (bloqueado)" : ""}, ${st} de 3 estrellas`;
          const nodeProps = {
            ...NODE_PROPS,
            className: cn(
              NODE_PROPS.className,
              boss && "bg-gradient-to-br from-[#2f1a52] to-[var(--q-panel)]",
              i === cur && "border-[var(--acc)] shadow-[0_0_18px_color-mix(in_srgb,var(--acc)_45%,transparent),0_5px_0_#0009]",
            ),
          };
          const content = (
            <>
              {" "}
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
            </>
          );
          return (
            <li key={n.id}>
              {locked ? (
                <button type="button" disabled data-node={n.id} aria-label={label} style={{ "--acc": acc } as CSSProperties} {...nodeProps}>
                  {content}
                </button>
              ) : (
                <Link href={`${playBase}?level=${n.id}`} data-node={n.id} aria-label={label} style={{ "--acc": acc } as CSSProperties} {...nodeProps}>
                  {content}
                </Link>
              )}
            </li>
          );
        })}
      </ol>

      {(() => {
        const unlocked = s.free || starsOf(s, BOSS_ID) >= UNLOCK_STARS;
        const r = s.lv[FINAL_ID];
        const label = `Examen final${unlocked ? "" : " (bloqueado)"}${r?.best != null ? `, mejor nota ${formatDec(r.best, 1)}` : ""}`;
        const body = (
          <>
            {unlocked ? null : (
              <span aria-hidden className="absolute top-2.5 right-3 text-base">
                🔒
              </span>
            )}
            <span className="block font-mono text-[11px] text-[var(--q-mute)]">CASTILLO FINAL</span>
            <span aria-hidden className="block text-2xl leading-none">
              🏆
            </span>
            <span className="mt-1.5 mb-1 block text-[15px] font-bold">Examen final</span>
            <span className="block font-mono text-[11px] text-[var(--q-mute)]">Simulacro cronometrado · nota sobre 10 · sin vidas ni pistas</span>
            {r?.best != null ? (
              <span className="mt-1 block font-mono text-sm text-[var(--q-gold)]" data-testid="quest-final-best">
                mejor nota {formatDec(r.best, 1)}/10
              </span>
            ) : null}
          </>
        );
        const cls = cn(NODE_PROPS.className, "mt-4 bg-gradient-to-br from-[#4a3a0e] to-[var(--q-panel)]");
        return unlocked ? (
          <Link href={`${playBase}?level=${FINAL_ID}`} data-final="1" aria-label={label} className={cls} style={{ "--acc": "var(--q-gold)" } as CSSProperties}>
            {body}
          </Link>
        ) : (
          <button type="button" disabled data-final="1" aria-label={label} className={cls}>
            {body}
          </button>
        );
      })()}

      {s.exams?.length ? (
        <details className="mt-3 text-sm" data-testid="quest-exams">
          <summary className="min-h-11 cursor-pointer py-2 font-semibold">Historial de exámenes ({formatInt(s.exams.length)})</summary>
          <ul className="grid gap-1 font-mono text-[13px]">
            {s.exams.map((e) => (
              <li key={e.at} className="flex flex-wrap justify-between gap-2 rounded-lg border border-[var(--q-line)] bg-[var(--q-panel)] px-2.5 py-1.5">
                <span>{formatDateTime(e.at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                <span>
                  <b className="text-[var(--q-gold)]">{formatDec(e.nota, 1)}</b>/10
                  {e.theory !== null ? ` · T ${formatDec(e.theory, 1)}` : ""}
                  {e.practical !== null ? ` · P ${formatDec(e.practical, 1)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <p className="mt-4 text-sm leading-relaxed text-[var(--q-mute)]">
        Tu progreso se guarda en tu cuenta y en este dispositivo. Para pasar de nivel necesitas <b className="text-[var(--q-ink)]">★★ (80 %)</b>. El modo libre desbloquea todos los niveles.
      </p>
    </div>
  );
}
