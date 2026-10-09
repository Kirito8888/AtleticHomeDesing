"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Field } from "@/components/form/chips";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/client-api";
import { TEST_CATALOG } from "@/lib/training/physical-tests";

/** Anotar un resultado de la batería de tests (del catálogo o propio). */
export function TestForm({ today }: { today: string }) {
  const router = useRouter();
  const [test, setTest] = useState<string>("sprint30");
  const [value, setValue] = useState("");
  const [date, setDate] = useState(today);
  const [custom, setCustom] = useState({ name: "", unit: "m", higher: true });
  const [busy, setBusy] = useState(false);
  const unit = test === "custom" ? custom.unit : TEST_CATALOG[test as keyof typeof TEST_CATALOG].unit;

  async function save() {
    const v = Number(value.replace(",", "."));
    if (!(v > 0)) return toast.error("Pon el resultado");
    setBusy(true);
    try {
      await api("/api/training/tests", {
        body: { test, value: v, date, ...(test === "custom" ? { customName: custom.name, customUnit: custom.unit, customHigherIsBetter: custom.higher } : {}) },
      });
      toast.success("Resultado guardado");
      setValue("");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-3">
      <Field label="Test" htmlFor="t-test">
        <Select id="t-test" value={test} onChange={(e) => setTest(e.target.value)}>
          {Object.entries(TEST_CATALOG).map(([k, t]) => (
            <option key={k} value={k}>
              {t.name} ({t.unit})
            </option>
          ))}
          <option value="custom">Otro test…</option>
        </Select>
      </Field>
      {test === "custom" ? (
        <div className="grid grid-cols-[1fr_5rem] gap-2">
          <Field label="Nombre" htmlFor="t-cname">
            <Input id="t-cname" value={custom.name} maxLength={60} onChange={(e) => setCustom({ ...custom, name: e.target.value })} />
          </Field>
          <Field label="Unidad" htmlFor="t-cunit">
            <Input id="t-cunit" value={custom.unit} maxLength={10} onChange={(e) => setCustom({ ...custom, unit: e.target.value })} />
          </Field>
          <label className="col-span-2 flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4" checked={!custom.higher} onChange={(e) => setCustom({ ...custom, higher: !e.target.checked })} />
            Menos es mejor (tiempos)
          </label>
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <Field label={`Resultado (${unit})`} htmlFor="t-value">
          <Input id="t-value" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
        </Field>
        <Field label="Fecha" htmlFor="t-date">
          <Input id="t-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <Button type="button" onClick={save} disabled={busy}>
        Guardar resultado
      </Button>
    </div>
  );
}
