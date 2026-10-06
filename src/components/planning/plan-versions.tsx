"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client-api";
import { formatDate } from "@/lib/format";

export type PlanMesoItem = {
  code: string;
  name: string;
  start: string;
  end: string;
  version: string | null;
  days: number;
  variant: string | null;
  anchorDate: string | null;
  variants: Array<{ code: string; label: string; needsAnchor: boolean }>;
};
export type VariantDay = { id: string; meso: string; variant: string; date: string | null; relDay: number | null; title: string };

function DeleteMeso({ code }: { code: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className="text-xs text-muted-foreground underline-offset-2 hover:underline"
      onClick={async () => {
        if (!confirm(`¿Borrar el bloque ${code} importado? Se quitan sus sesiones planificadas; las hechas se quedan.`)) return;
        try {
          await api(`/api/planning/plan/${encodeURIComponent(code)}`, { method: "DELETE" });
          router.refresh();
        } catch (e) {
          toast.error((e as Error).message);
        }
      }}
    >
      Borrar bloque
    </button>
  );
}

/** Activo si el día es de la opción elegida o de un prefijo suyo («A» vale para «A-V»). */
const belongs = (dayVariant: string, option: string) => option === dayVariant || option.startsWith(`${dayVariant}-`);

function MesoVersions({ meso, days }: { meso: PlanMesoItem; days: VariantDay[] }) {
  const router = useRouter();
  const [choice, setChoice] = useState(meso.variant ?? meso.variants[0]?.code ?? "");
  const [anchor, setAnchor] = useState(meso.anchorDate ?? "");
  const [busy, setBusy] = useState(false);
  const option = meso.variants.find((v) => v.code === choice);
  const dirty = choice !== meso.variant || (option?.needsAnchor && anchor !== (meso.anchorDate ?? ""));

  async function apply() {
    setBusy(true);
    try {
      const r = await api<{ sessionsCreated: number; sessionsRemoved: number; keptDone: number }>("/api/planning/plan/variant", {
        body: { code: meso.code, variant: choice, anchorDate: option?.needsAnchor ? anchor || null : null },
      });
      toast.success(`${meso.code}: ${option?.label}. ${r.sessionsCreated} sesiones añadidas, ${r.sessionsRemoved} retiradas${r.keptDone ? `, ${r.keptDone} hechas sin tocar` : ""}.`);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <fieldset className="grid gap-2 rounded-md border p-3">
      <legend className="px-1 text-sm font-medium">
        <Link href={`/planning/meso/${meso.code}`} className="underline-offset-2 hover:underline">
          {meso.code} · {meso.name}
        </Link>
      </legend>
      {meso.variants.map((v) => {
        const vDays = days.filter((d) => belongs(d.variant, v.code));
        return (
          <div key={v.code} className="grid gap-1">
            <label className="flex items-start gap-2 text-sm">
              <input type="radio" className="mt-0.5 size-4" name={`variant-${meso.code}`} value={v.code} checked={choice === v.code} onChange={() => setChoice(v.code)} />
              <span>
                {v.label}
                {meso.variant === v.code ? <span className="ml-1 text-xs text-muted-foreground">(activa)</span> : null}
              </span>
            </label>
            {vDays.length ? (
              <details className="ml-6 text-xs text-muted-foreground">
                <summary className="cursor-pointer">Ver sus {vDays.length} días</summary>
                <ul className="mt-1 grid gap-0.5">
                  {vDays.map((d) => (
                    <li key={d.id}>
                      <Link href={`/planning/plan/${d.id}`} className="hover:text-foreground hover:underline">
                        {d.date ? formatDate(d.date, { weekday: "short", day: "numeric", month: "short" }) : d.relDay === 0 ? "Día D" : `D${d.relDay}`} · {d.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
        );
      })}
      {option?.needsAnchor ? (
        <label className="grid gap-1 text-sm">
          Fecha de la competición (cuenta los días hacia atrás)
          <Input type="date" value={anchor} onChange={(e) => setAnchor(e.target.value)} required />
        </label>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <DeleteMeso code={meso.code} />
        <Button type="button" size="sm" disabled={busy || !dirty || (option?.needsAnchor && !anchor)} onClick={() => void apply()}>
          {busy ? "Aplicando…" : "Usar esta versión"}
        </Button>
      </div>
    </fieldset>
  );
}

/** Tarjeta «Versiones del plan»: elegir A/B, el día de competición o la rama «Si me clasifico». */
export function PlanVersions({ mesos, days }: { mesos: PlanMesoItem[]; days: VariantDay[] }) {
  const withVariants = mesos.filter((m) => m.variants.length);
  const plain = mesos.filter((m) => !m.variants.length);
  return (
    <div className="grid gap-3">
      {withVariants.map((m) => (
        <MesoVersions key={m.code} meso={m} days={days.filter((d) => d.meso === m.code)} />
      ))}
      {plain.length ? (
        <ul className="grid gap-1.5" aria-label="Bloques sin versiones">
          {plain.map((m) => (
            <li key={m.code} className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate">
                <Link href={`/planning/meso/${m.code}`} className="underline-offset-2 hover:underline">
                  {m.code} · {m.name}
                </Link>
                <span className="ml-1 text-xs text-muted-foreground">
                  {m.days} días{m.version ? ` · v${m.version}` : ""}
                </span>
              </span>
              <DeleteMeso code={m.code} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
