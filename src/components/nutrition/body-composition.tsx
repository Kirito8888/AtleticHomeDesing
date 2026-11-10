"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Field } from "@/components/form/chips";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/client-api";
import { formatNum } from "@/lib/format";
import { type IsakInput, isakInputSchema, type IsakResult } from "@/lib/health/isak";
import type { BodyCompositionRecord } from "@/lib/health/isak-service";

type NumKey = Exclude<keyof IsakInput, "date" | "sex">;
type Spec = { key: NumKey; label: string; unit: string; required: boolean };

const GROUPS: Array<{ title: string; fields: Spec[] }> = [
  {
    title: "Básicos",
    fields: [
      { key: "weightKg", label: "Peso", unit: "kg", required: true },
      { key: "heightCm", label: "Talla", unit: "cm", required: true },
    ],
  },
  {
    title: "Pliegues (mm)",
    fields: [
      { key: "triceps", label: "Tríceps", unit: "mm", required: true },
      { key: "subscapular", label: "Subescapular", unit: "mm", required: true },
      { key: "biceps", label: "Bíceps", unit: "mm", required: true },
      { key: "iliacCrest", label: "Cresta ilíaca", unit: "mm", required: true },
      { key: "supraspinale", label: "Supraespinal", unit: "mm", required: true },
      { key: "abdominal", label: "Abdominal", unit: "mm", required: true },
      { key: "frontThigh", label: "Muslo anterior", unit: "mm", required: true },
      { key: "medialCalf", label: "Pierna medial", unit: "mm", required: true },
    ],
  },
  {
    title: "Perímetros (cm)",
    fields: [
      { key: "armFlexedGirth", label: "Brazo flexionado y contraído", unit: "cm", required: true },
      { key: "calfGirth", label: "Pierna (máximo)", unit: "cm", required: true },
      { key: "armRelaxedGirth", label: "Brazo relajado", unit: "cm", required: false },
      { key: "waistGirth", label: "Cintura", unit: "cm", required: false },
      { key: "hipGirth", label: "Cadera", unit: "cm", required: false },
      { key: "midThighGirth", label: "Muslo medio", unit: "cm", required: false },
    ],
  },
  {
    title: "Diámetros óseos (cm)",
    fields: [
      { key: "humerusBreadth", label: "Biepicondíleo del húmero", unit: "cm", required: true },
      { key: "femurBreadth", label: "Bicondíleo del fémur", unit: "cm", required: true },
      { key: "wristBreadth", label: "Biestiloideo de la muñeca", unit: "cm", required: true },
      { key: "biacromialBreadth", label: "Biacromial", unit: "cm", required: false },
      { key: "biiliocristalBreadth", label: "Biiliocrestal", unit: "cm", required: false },
    ],
  },
];

const today = () => new Date().toISOString().slice(0, 10);
const fmt = (n: number) => formatNum(n, 2);

export function MassTable({ r }: { r: IsakResult }) {
  const rows: Array<[string, { kg: number; pct: number }]> = [
    ["Masa grasa", r.masses.fat],
    ["Masa muscular", r.masses.muscle],
    ["Masa ósea", r.masses.bone],
    ["Masa residual", r.masses.residual],
  ];
  return (
    <div className="grid gap-2 text-sm" aria-label="Resultado ISAK">
      <p>
        Somatotipo (endo-meso-ecto):{" "}
        <strong className="tabular-nums">
          {fmt(r.somatotype.endo)} – {fmt(r.somatotype.meso)} – {fmt(r.somatotype.ecto)}
        </strong>{" "}
        · {r.somatotype.label}
      </p>
      <table className="w-full max-w-md text-left tabular-nums">
        <thead>
          <tr className="text-xs text-muted-foreground">
            <th className="font-medium">Masa</th>
            <th className="font-medium">kg</th>
            <th className="font-medium">%</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([n, m]) => (
            <tr key={n}>
              <td>{n}</td>
              <td>{fmt(m.kg)}</td>
              <td>{fmt(m.pct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-muted-foreground">
        Σ8 pliegues {fmt(r.sum8)} mm · Σ6 {fmt(r.sum6)} mm · IMC {fmt(r.bmi)}. Modelo De Rose-Guimarães (Faulkner, Rocha, Würch) y Heath-Carter.
      </p>
      {r.warnings.map((w) => (
        <p key={w} role="alert" className="text-sm text-destructive">
          {w}
        </p>
      ))}
    </div>
  );
}

/** Formulario manual ISAK: valida rangos en el cliente, calcula en el servidor y guarda tras confirmar. */
export function BodyCompositionForm({ defaults }: { defaults: { sex: "M" | "F"; heightCm?: number; weightKg?: number } }) {
  const router = useRouter();
  const [date, setDate] = useState(today());
  const [sex, setSex] = useState<"M" | "F">(defaults.sex);
  const [vals, setVals] = useState<Record<string, string>>({ ...(defaults.heightCm ? { heightCm: String(defaults.heightCm) } : {}), ...(defaults.weightKg ? { weightKg: String(defaults.weightKg) } : {}) });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<IsakResult | null>(null);
  const [busy, setBusy] = useState(false);

  function build(): IsakInput | null {
    const raw: Record<string, unknown> = { date, sex };
    for (const g of GROUPS) for (const f of g.fields) if (vals[f.key]?.trim()) raw[f.key] = Number(vals[f.key].replace(",", "."));
    const p = isakInputSchema.safeParse(raw);
    if (p.success) {
      setErrors({});
      return p.data;
    }
    const e: Record<string, string> = {};
    for (const i of p.error.issues) {
      const k = String(i.path[0]);
      e[k] = raw[k] === undefined ? "Obligatorio" : i.message.replace(/^Too (small|big).*/, "Fuera del rango fisiológico").replace(/^Invalid input.*/, "Valor no válido");
    }
    setErrors(e);
    return null;
  }

  async function calc() {
    const input = build();
    if (!input) return toast.error("Revisa los campos marcados");
    setBusy(true);
    try {
      setResult(await api<IsakResult>("/api/health/body-composition/preview", { body: input }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    const input = build();
    if (!input || !result) return;
    if (!(await confirmDialog({ title: "¿Guardar esta medición?", description: `Se guardará cifrada con fecha ${input.date} en tu histórico.`, confirmLabel: "Guardar" }))) return;
    setBusy(true);
    try {
      await api("/api/health/body-composition", { body: input });
      toast.success("Medición guardada");
      setResult(null);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 text-sm">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Fecha" htmlFor="isak-date" hint={errors.date}>
          <Input id="isak-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Sexo para el cálculo" htmlFor="isak-sex" hint="La masa residual usa coeficientes de hombre o mujer.">
          <Select id="isak-sex" value={sex} onChange={(e) => setSex(e.target.value as "M" | "F")}>
            <option value="F">Mujer</option>
            <option value="M">Hombre</option>
          </Select>
        </Field>
      </div>
      {GROUPS.map((g) => (
        <fieldset key={g.title} className="grid gap-2">
          <legend className="mb-1 font-medium">{g.title}</legend>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {g.fields.map((f) => (
              <Field key={f.key} label={`${f.label}${f.required ? "" : " (opcional)"}`} htmlFor={`isak-${f.key}`} hint={errors[f.key]}>
                <Input
                  id={`isak-${f.key}`}
                  inputMode="decimal"
                  placeholder={f.unit}
                  value={vals[f.key] ?? ""}
                  aria-invalid={errors[f.key] ? true : undefined}
                  onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })}
                />
              </Field>
            ))}
          </div>
        </fieldset>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={calc}>
          Calcular
        </Button>
        <Button type="button" disabled={busy || !result} onClick={save}>
          Guardar medición
        </Button>
      </div>
      {result ? <MassTable r={result} /> : null}
    </div>
  );
}

/** Histórico de mediciones: tabla simple con borrado confirmado (las gráficas llegan en el Bloque B). */
export function BodyCompositionHistory({ records }: { records: BodyCompositionRecord[] }) {
  const router = useRouter();
  async function del(id: string, date: string) {
    if (!(await confirmDialog({ title: "¿Borrar esta medición?", description: `Se eliminará la del ${date} de forma definitiva.`, confirmLabel: "Borrar", destructive: true }))) return;
    try {
      await api(`/api/health/body-composition?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      toast.success("Medición borrada");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  if (!records.length) return <p className="text-sm text-muted-foreground">Aún no hay mediciones guardadas.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] text-left text-sm tabular-nums">
        <thead>
          <tr className="text-xs text-muted-foreground">
            {["Fecha", "Peso (kg)", "Σ8 (mm)", "Somatotipo", "Grasa %", "Músculo %", ""].map((h, i) => (
              <th key={i} className="py-1 pr-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...records].reverse().map((r) => (
            <tr key={r.id} className="border-t">
              <td className="py-1 pr-2">{r.date}</td>
              <td className="pr-2">{fmt(r.input.weightKg)}</td>
              <td className="pr-2">{fmt(r.result.sum8)}</td>
              <td className="pr-2">
                {fmt(r.result.somatotype.endo)}-{fmt(r.result.somatotype.meso)}-{fmt(r.result.somatotype.ecto)}
              </td>
              <td className="pr-2">{fmt(r.result.masses.fat.pct)}</td>
              <td className="pr-2">{fmt(r.result.masses.muscle.pct)}</td>
              <td>
                <Button type="button" variant="ghost" size="sm" aria-label={`Borrar la medición del ${r.date}`} onClick={() => del(r.id, r.date)}>
                  Borrar
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function BodyCompositionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-4">{children}</CardContent>
    </Card>
  );
}
