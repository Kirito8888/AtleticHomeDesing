"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Chips, Field } from "@/components/form/chips";
import { MODULE_LABEL, type ModuleKey } from "@/components/layout/nav-items";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client-api";

function usePrefs() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function save(patch: Record<string, unknown>, ok = "Guardado") {
    setBusy(true);
    try {
      await api("/api/settings/prefs", { method: "PATCH", body: patch });
      toast.success(ok);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return { busy, save };
}

/** v1.8 · Ocultar módulos que no usas (navegación y panel). Los datos no se tocan. */
export function ModulesSettings({ hidden }: { hidden: string[] }) {
  const { busy, save } = usePrefs();
  const keys = Object.keys(MODULE_LABEL) as ModuleKey[];
  return (
    <ul className="grid gap-2 text-sm" aria-label="Módulos">
      {keys.map((k) => {
        const on = !hidden.includes(k);
        return (
          <li key={k}>
            <label className="flex min-h-11 items-center gap-2">
              <input type="checkbox" className="size-4" checked={on} disabled={busy} onChange={() => save({ hiddenModules: on ? [...hidden, k] : hidden.filter((x) => x !== k) }, on ? `${MODULE_LABEL[k]} oculto` : `${MODULE_LABEL[k]} visible`)} />
              {MODULE_LABEL[k]}
            </label>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * v3.0 G (V3-D01) · Los 3 destinos de la barra inferior del móvil. Sin elección (`null`) manda el uso;
 * al guardar queda fija hasta que se vuelva a la sugerida.
 */
export function MobileBarSettings({ chosen, suggested, candidates }: { chosen: string[] | null; suggested: string[]; candidates: Array<{ href: string; label: string }> }) {
  const { busy, save } = usePrefs();
  const [slots, setSlots] = useState<string[]>(() => {
    const start = (chosen ?? suggested).filter((h) => candidates.some((c) => c.href === h));
    for (const c of [...suggested, ...candidates.map((x) => x.href)]) if (start.length < 3 && !start.includes(c)) start.push(c);
    return start.slice(0, 3);
  });
  const label = (h: string) => candidates.find((c) => c.href === h)?.label ?? h;
  const repeated = new Set(slots).size !== slots.length;
  return (
    <div className="grid gap-3 text-sm">
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {chosen ? "Barra elegida por ti." : `Sugerida por tu uso: ${suggested.map(label).join(", ")}.`}
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        {slots.map((v, i) => (
          <Field key={i} label={`Hueco ${i + 1}`} htmlFor={`bar-slot-${i}`}>
            <select
              id={`bar-slot-${i}`}
              className="h-11 w-full rounded-md border bg-transparent px-2 text-sm text-foreground"
              value={v}
              disabled={busy}
              onChange={(e) => setSlots(slots.map((x, k) => (k === i ? e.target.value : x)))}
            >
              {candidates.map((c) => (
                <option key={c.href} value={c.href}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
        ))}
      </div>
      {repeated ? (
        <p role="alert" className="text-xs text-destructive">
          Hay un destino repetido: elige tres distintos.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={busy || repeated} onClick={() => save({ mobileBar: slots }, "Barra guardada")}>
          Guardar barra
        </Button>
        {chosen ? (
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => save({ mobileBar: null }, "Barra sugerida por el uso")}>
            Volver a la sugerida por el uso
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** v1.8 · Tamaño de letra y contraste alto. */
export function AccessibilitySettings({ fontScale, highContrast }: { fontScale: 100 | 115 | 130; highContrast: boolean }) {
  const { busy, save } = usePrefs();
  return (
    <div className="grid gap-3 text-sm">
      <Field label="Tamaño de letra">
        <Chips
          label="Tamaño de letra"
          options={[
            { value: 100 as const, label: "Normal" },
            { value: 115 as const, label: "Grande" },
            { value: 130 as const, label: "Muy grande" },
          ]}
          value={fontScale}
          onChange={(v) => v && save({ fontScale: v })}
        />
      </Field>
      <label className="flex min-h-11 items-center gap-2">
        <input type="checkbox" className="size-4" checked={highContrast} disabled={busy} onChange={() => save({ highContrast: !highContrast })} />
        Contraste alto (texto secundario y bordes más marcados)
      </label>
    </div>
  );
}

/** v1.8 · Uso local: activar o no y ver lo más y menos usado. */
export function UsageSettings({ enabled, summary }: { enabled: boolean; summary: { top: Array<{ path: string; count: number }>; total: number; unused: string[]; weeks: number } }) {
  const { busy, save } = usePrefs();
  return (
    <div className="grid gap-3 text-sm">
      <label className="flex min-h-11 items-center gap-2">
        <input type="checkbox" className="size-4" checked={enabled} disabled={busy} onChange={() => save({ usageStats: !enabled })} />
        Contar qué páginas abro (solo en este servidor)
      </label>
      {summary.total ? (
        <>
          <ol className="grid gap-0.5 text-xs tabular-nums" aria-label="Lo que más usas">
            {summary.top.map((r) => (
              <li key={r.path} className="flex justify-between gap-2">
                <span className="min-w-0 truncate font-mono">{r.path}</span>
                <span>{r.count}</span>
              </li>
            ))}
          </ol>
          {summary.unused.length ? <p className="text-xs">Sin abrir en {summary.weeks} semanas: {summary.unused.join(", ")}. Si no las echas de menos, ocúltalas en «Módulos».</p> : null}
        </>
      ) : (
        <p className="text-xs text-muted-foreground">Aún no hay datos.</p>
      )}
    </div>
  );
}

/** v1.8 · Horas sin notificaciones (las de seguridad y «entreno sola» llegan igual). */
export function QuietHoursSettings({ quietHours, weeklyReviewPush = true }: { quietHours: { from: string; to: string } | null; weeklyReviewPush?: boolean }) {
  const { busy, save } = usePrefs();
  const [review, setReview] = useState(weeklyReviewPush);
  const [from, setFrom] = useState(quietHours?.from ?? "22:30");
  const [to, setTo] = useState(quietHours?.to ?? "07:30");
  return (
    <div className="grid gap-2 text-sm">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Silencio desde" htmlFor="qh-from">
          <Input id="qh-from" type="time" className="w-full min-w-0" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="Hasta" htmlFor="qh-to">
          <Input id="qh-to" type="time" className="w-full min-w-0" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => save({ quietHours: { from, to } }, "Horas de silencio guardadas")}>
          Guardar horas de silencio
        </Button>
        {quietHours ? (
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => save({ quietHours: null }, "Sin horas de silencio")}>
            Quitar
          </Button>
        ) : null}
      </div>
      <label className="flex min-h-11 items-center gap-2">
        <input
          type="checkbox"
          className="size-4"
          checked={review}
          disabled={busy}
          onChange={() => {
            setReview(!review);
            void save({ weeklyReviewPush: !review }, !review ? "Aviso de la revisión semanal activado" : "Aviso de la revisión semanal desactivado");
          }}
        />
        Aviso del domingo para la revisión semanal
      </label>
    </div>
  );
}

/** v1.8 · Meses de gastos que quieres tener cubiertos (fondo de emergencia). */
export function EmergencyMonthsSelect({ value }: { value: number }) {
  const { busy, save } = usePrefs();
  return (
    <label className="flex min-h-11 items-center gap-2 text-xs text-muted-foreground">
      Objetivo
      <select
        aria-label="Meses del fondo de emergencia"
        className="h-8 max-md:h-11 rounded-md border bg-transparent px-2 text-sm text-foreground"
        value={value}
        disabled={busy}
        onChange={(e) => void save({ emergencyMonths: Number(e.target.value) }, "Objetivo del fondo guardado")}
      >
        {[1, 2, 3, 4, 6, 9, 12].map((n) => (
          <option key={n} value={n}>
            {n} {n === 1 ? "mes" : "meses"}
          </option>
        ))}
      </select>
    </label>
  );
}
