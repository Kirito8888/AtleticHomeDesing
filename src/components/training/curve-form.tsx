"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/client-api";
import { parsePointsText } from "@/lib/training/reference-curves";

const TESTS = [
  ["cmj", "CMJ", "cm", true],
  ["sj", "SJ", "cm", true],
  ["sprint30", "30 m", "s", false],
  ["sprint60", "60 m", "s", false],
  ["standingLong", "Salto horizontal", "m", true],
  ["medBallBack", "Balón medicinal atrás", "m", true],
] as const;

/** Alta de curva: la cita es obligatoria. Los valores se copian a mano de la tabla del artículo. */
export function CurveForm() {
  const router = useRouter();
  const [f, setF] = useState({ test: "cmj", title: "", level: "", sex: "", study: "", authors: "", year: "", citation: "", doi: "", sourceUrl: "", points: "" });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  const t = TESTS.find((x) => x[0] === f.test)!;
  return (
    <form
      className="grid gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await api("/api/training/reference-curves", {
            body: { testKey: t[0], unit: t[2], higherIsBetter: t[3], title: f.title, level: f.level || null, sex: f.sex || null, study: f.study, authors: f.authors, year: Number(f.year), citation: f.citation, doi: f.doi, sourceUrl: f.sourceUrl, points: parsePointsText(f.points) },
          });
          toast.success("Curva guardada");
          setF({ ...f, title: "", study: "", authors: "", year: "", citation: "", doi: "", sourceUrl: "", points: "" });
          router.refresh();
        } catch (err) {
          toast.error((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="cf-test">Test</Label>
        <select id="cf-test" value={f.test} onChange={set("test")} className="min-h-11 rounded-md border bg-background px-3 text-sm">
          {TESTS.map((x) => (
            <option key={x[0]} value={x[0]}>{x[1]} ({x[2]})</option>
          ))}
        </select>
      </div>
      <Field id="cf-title" label="Título de la curva" value={f.title} onChange={set("title")} max={120} required />
      <div className="grid grid-cols-2 gap-2">
        <Field id="cf-level" label="Nivel (opcional)" value={f.level} onChange={set("level")} max={60} />
        <div className="grid gap-1.5">
          <Label htmlFor="cf-sex">Sexo</Label>
          <select id="cf-sex" value={f.sex} onChange={set("sex")} className="min-h-11 rounded-md border bg-background px-3 text-sm">
            <option value="">Mixta</option>
            <option value="FEMALE">Mujeres</option>
            <option value="MALE">Hombres</option>
          </select>
        </div>
      </div>
      <Field id="cf-study" label="Estudio" value={f.study} onChange={set("study")} max={200} required />
      <Field id="cf-authors" label="Autores" value={f.authors} onChange={set("authors")} max={200} required />
      <Field id="cf-year" label="Año" value={f.year} onChange={set("year")} max={4} inputMode="numeric" required />
      <div className="grid gap-1.5">
        <Label htmlFor="cf-citation">Cita completa</Label>
        <Textarea id="cf-citation" value={f.citation} onChange={set("citation")} maxLength={500} rows={3} required />
      </div>
      <Field id="cf-doi" label="DOI (opcional, 10.xxxx/…)" value={f.doi} onChange={set("doi")} max={120} />
      <Field id="cf-url" label="Enlace https (opcional)" value={f.sourceUrl} onChange={set("sourceUrl")} max={300} />
      <div className="grid gap-1.5">
        <Label htmlFor="cf-points">Valores de la tabla (edad;mediana;bajo;alto, uno por línea)</Label>
        <Textarea id="cf-points" value={f.points} onChange={set("points")} rows={5} placeholder={"14;40;36;44\n16;48;42;54"} required />
      </div>
      <Button type="submit" disabled={busy}>Guardar curva</Button>
    </form>
  );
}

function Field({ id, label, value, onChange, max, required, inputMode }: { id: string; label: string; value: string; onChange: (e: { target: { value: string } }) => void; max: number; required?: boolean; inputMode?: "numeric" }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={onChange} maxLength={max} required={required} inputMode={inputMode} />
    </div>
  );
}
