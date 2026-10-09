"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Field } from "@/components/form/chips";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client-api";
import { GIRTHS, SKINFOLDS } from "@/lib/recovery/body-measures";

const num = (s: string) => (s.trim() ? Number(s.replace(",", ".")) : null);
const pick = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).flatMap(([k, v]) => (num(v) != null ? [[k, num(v)]] : [])));

export function BodyForm({ today }: { today: string }) {
  const router = useRouter();
  const [date, setDate] = useState(today);
  const [g, setG] = useState<Record<string, string>>({});
  const [s, setS] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      await api("/api/recovery/body", { body: { date, girths: pick(g), skinfolds: pick(s) } });
      toast.success("Medidas guardadas");
      setG({});
      setS({});
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="grid gap-3 text-sm">
      <Field label="Fecha" htmlFor="bm-date">
        <Input id="bm-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <p className="font-medium">Perímetros (cm)</p>
      <div className="grid grid-cols-2 gap-2">
        {Object.entries(GIRTHS).map(([k, label]) => (
          <Field key={k} label={label} htmlFor={`g-${k}`}>
            <Input id={`g-${k}`} inputMode="decimal" className="w-full min-w-0" value={g[k] ?? ""} onChange={(e) => setG({ ...g, [k]: e.target.value })} />
          </Field>
        ))}
      </div>
      <p className="font-medium">Pliegues (mm)</p>
      <div className="grid grid-cols-2 gap-2">
        {Object.entries(SKINFOLDS).map(([k, label]) => (
          <Field key={k} label={label} htmlFor={`s-${k}`}>
            <Input id={`s-${k}`} inputMode="decimal" className="w-full min-w-0" value={s[k] ?? ""} onChange={(e) => setS({ ...s, [k]: e.target.value })} />
          </Field>
        ))}
      </div>
      <Button type="button" disabled={busy} onClick={save}>
        Guardar medidas
      </Button>
    </div>
  );
}
