"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Field } from "@/components/form/chips";
import { JumpMeter } from "@/components/training/jump-meter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client-api";
import { formatNum } from "@/lib/format";
import { computeFvProfile, FV_DEFICIT_LABEL, FV_IMBALANCE_LABEL, FV_MAX_LOADS, FV_MIN_LOADS, type FvProfile } from "@/lib/training/fv-profile";

type Row = { kg: string; h: string };
const num = (s: string) => (s.trim() === "" ? NaN : Number(s.replace(",", ".")));

/** Resultado del perfil F-V (vista previa y tarjetas del histórico). */
export function FvResultCard({ p, warnings = [] }: { p: FvProfile; warnings?: string[] }) {
  return (
    <div className="grid gap-2" aria-label="Resultado del perfil F-V">
      <dl className="grid grid-cols-2 gap-2 text-sm">
        {(
          [
            ["F0", `${formatNum(p.F0, 1)} N/kg`],
            ["V0", `${formatNum(p.V0, 2)} m/s`],
            ["Pmax", `${formatNum(p.pmax, 1)} W/kg`],
            ["Pendiente", `${formatNum(p.slope, 2)} (óptima ${formatNum(p.optimalSlope, 2)})`],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="min-w-0 rounded-md border p-2">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="font-semibold tabular-nums break-words">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="text-sm">
        <strong>{FV_IMBALANCE_LABEL[p.imbalance]}</strong> · FVimb <strong className="tabular-nums">{formatNum(p.imbalancePct, 1)} %</strong>
        {p.deficit ? <> · {FV_DEFICIT_LABEL[p.deficit]}</> : null} · r² {formatNum(p.r2, 2)}
      </p>
      {warnings.map((w) => (
        <p key={w} role="status" className="rounded-md border border-amber-500/50 p-2 text-sm">{w}</p>
      ))}
    </div>
  );
}

export function FvProfileForm({ today, defaultMassKg }: { today: string; defaultMassKg: number | null }) {
  const router = useRouter();
  const [mass, setMass] = useState(defaultMassKg ? String(defaultMassKg) : "");
  const [hpo, setHpo] = useState("");
  const [date, setDate] = useState(today);
  const [rows, setRows] = useState<Row[]>([{ kg: "0", h: "" }, { kg: "", h: "" }, { kg: "", h: "" }]);
  const [measuring, setMeasuring] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const filled = rows.filter((r) => r.kg.trim() !== "" && r.h.trim() !== "");
  const loads = filled.map((r) => ({ addedKg: num(r.kg), heightCm: num(r.h) }));
  const ready = Number.isFinite(num(mass)) && Number.isFinite(num(hpo)) && loads.every((l) => Number.isFinite(l.addedKg) && Number.isFinite(l.heightCm));
  const result = filled.length >= 1 && ready ? computeFvProfile({ bodyMassKg: num(mass), hpoCm: num(hpo), loads }) : null;

  const set = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  async function save() {
    setBusy(true);
    try {
      await api("/api/training/tests/fv", { body: { date, bodyMassKg: num(mass), hpoCm: num(hpo), loads } });
      toast.success("Perfil F-V guardado");
      setRows([{ kg: "0", h: "" }, { kg: "", h: "" }, { kg: "", h: "" }]);
      setMeasuring(null);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Peso corporal (kg)" htmlFor="fv-mass">
          <Input id="fv-mass" inputMode="decimal" value={mass} onChange={(e) => setMass(e.target.value)} placeholder="70" />
        </Field>
        <Field label="hPO (cm)" htmlFor="fv-hpo">
          <Input id="fv-hpo" inputMode="decimal" value={hpo} onChange={(e) => setHpo(e.target.value)} placeholder="40" />
        </Field>
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">hPO: recorrido del impulso, es decir, altura del trocánter de pie menos la que tiene en la posición de salida (rodillas a 90°). Se mide a mano.</p>
      <Field label="Fecha" htmlFor="fv-date">
        <Input id="fv-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>

      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm font-medium">Saltos SJ con carga ({FV_MIN_LOADS}–{FV_MAX_LOADS}, cargas distintas)</legend>
        {rows.map((r, i) => (
          <div key={i} className="grid gap-2 rounded-md border p-2">
            <div className="grid grid-cols-2 gap-2">
              <Field label={`Carga ${i + 1} (kg añadidos)`} htmlFor={`fv-kg-${i}`}>
                <Input id={`fv-kg-${i}`} inputMode="decimal" value={r.kg} onChange={(e) => set(i, { kg: e.target.value })} placeholder="0" />
              </Field>
              <Field label="Altura (cm)" htmlFor={`fv-h-${i}`}>
                <Input id={`fv-h-${i}`} inputMode="decimal" value={r.h} onChange={(e) => set(i, { h: e.target.value })} placeholder="30" />
              </Field>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="min-h-11 flex-1" aria-expanded={measuring === i} onClick={() => setMeasuring(measuring === i ? null : i)}>
                {measuring === i ? "Cerrar medidor" : "Medir con vídeo"}
              </Button>
              {rows.length > FV_MIN_LOADS ? (
                <Button type="button" variant="ghost" className="min-h-11" aria-label={`Quitar carga ${i + 1}`} onClick={() => { setRows(rows.filter((_, j) => j !== i)); setMeasuring(null); }}>
                  Quitar
                </Button>
              ) : null}
            </div>
            {measuring === i ? (
              <div className="border-t pt-3">
                <JumpMeter today={date} onUseHeight={(cm) => { set(i, { h: String(cm).replace(".", ",") }); setMeasuring(null); }} />
              </div>
            ) : null}
          </div>
        ))}
        {rows.length < FV_MAX_LOADS ? (
          <Button type="button" variant="outline" className="min-h-11" onClick={() => setRows([...rows, { kg: "", h: "" }])}>
            Añadir carga
          </Button>
        ) : null}
      </fieldset>

      {result ? (
        result.ok ? (
          <FvResultCard p={result.profile} warnings={result.warnings} />
        ) : (
          <p role="alert" className="rounded-md border border-destructive/40 p-2 text-sm">{result.error}</p>
        )
      ) : (
        <p className="text-sm text-muted-foreground">Rellena peso, hPO y al menos {FV_MIN_LOADS} saltos para ver F0, V0, Pmax y el desequilibrio.</p>
      )}

      <Button type="button" className="min-h-11" onClick={save} disabled={busy || !result?.ok}>
        Guardar perfil
      </Button>
    </div>
  );
}
