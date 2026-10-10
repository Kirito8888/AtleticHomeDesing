"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Field } from "@/components/form/chips";
import { OcrFill } from "@/components/ocr-fill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client-api";
import { MICRO_INFO, MICROS, type Micro } from "@/lib/nutrition/micros";

const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));

/** Objetivos diarios propios; vacío = referencia general. */
export function MicroTargetsForm({ custom, refs }: { custom: Partial<Record<Micro, number>>; refs: Record<Micro, number> }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="grid gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const microTargets: Partial<Record<Micro, number>> = {};
        for (const m of MICROS) {
          const v = num(String(f.get(m) ?? ""));
          if (v != null && Number.isFinite(v)) microTargets[m] = v;
        }
        setBusy(true);
        try {
          await api("/api/settings/prefs", { method: "PATCH", body: { microTargets } });
          toast.success("Objetivos guardados");
          router.refresh();
        } catch (err) {
          toast.error((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {MICROS.map((m) => (
          <Field key={m} label={`${MICRO_INFO[m].label} (${MICRO_INFO[m].unit}/día)`} htmlFor={`mt-${m}`}>
            <Input id={`mt-${m}`} name={m} inputMode="decimal" defaultValue={custom[m] ?? ""} placeholder={String(refs[m])} />
          </Field>
        ))}
      </div>
      <Button type="submit" disabled={busy} className="justify-self-start">
        Guardar objetivos
      </Button>
    </form>
  );
}

const FIELDS: Array<[string, string, boolean]> = [
  ["kcalPer100g", "Energía (kcal)", true],
  ["proteinPer100g", "Proteínas (g)", true],
  ["carbsPer100g", "Hidratos (g)", true],
  ["sugarsPer100g", "de los cuales azúcares (g)", false],
  ["fatPer100g", "Grasas (g)", true],
  ["satFatPer100g", "de las cuales saturadas (g)", false],
  ["fiberPer100g", "Fibra (g)", false],
  ["saltPer100g", "Sal (g)", false],
  ["calciumPer100g", "Calcio (mg)", false],
  ["ironPer100g", "Hierro (mg)", false],
  ["vitDPer100g", "Vitamina D (µg)", false],
  ["b12Per100g", "Vitamina B12 (µg)", false],
  ["magnesiumPer100g", "Magnesio (mg)", false],
  ["potassiumPer100g", "Potasio (mg)", false],
];

export type OwnFoodDraft = Partial<Record<string, number | string | null>>;

/** Alimento propio por 100 g (a mano o con los valores que propone la lectura de la etiqueta). */
export function OwnFoodForm({ draft, onSaved }: { draft?: OwnFoodDraft; onSaved?: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <form
      key={JSON.stringify(draft ?? {})}
      className="grid gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const body: Record<string, unknown> = { name: String(f.get("name") ?? ""), brand: String(f.get("brand") ?? "") || null };
        for (const [k, , req] of FIELDS) {
          const v = num(String(f.get(k) ?? ""));
          if (v != null) body[k] = v;
          else if (req) body[k] = 0;
        }
        setBusy(true);
        try {
          await api("/api/nutrition/foods", { body });
          toast.success("Alimento guardado: ya aparece en la búsqueda");
          (e.target as HTMLFormElement).reset();
          onSaved?.();
          router.refresh();
        } catch (err) {
          toast.error((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre" htmlFor="of-name">
          <Input id="of-name" name="name" required maxLength={120} defaultValue={String(draft?.name ?? "")} />
        </Field>
        <Field label="Marca (opcional)" htmlFor="of-brand">
          <Input id="of-brand" name="brand" maxLength={80} defaultValue={String(draft?.brand ?? "")} />
        </Field>
      </div>
      <p className="text-xs text-muted-foreground">Valores por 100 g, como en la etiqueta.</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {FIELDS.map(([k, label, req]) => (
          <Field key={k} label={label} htmlFor={`of-${k}`}>
            <Input id={`of-${k}`} name={k} inputMode="decimal" required={req} defaultValue={draft?.[k] != null ? String(draft[k]) : ""} />
          </Field>
        ))}
      </div>
      <Button type="submit" disabled={busy} className="justify-self-start">
        Guardar alimento
      </Button>
    </form>
  );
}

export function DeleteOwnFood({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      aria-label={`Borrar ${name}`}
      onClick={async () => {
        try {
          await api(`/api/nutrition/foods/${id}`, { method: "DELETE" });
          router.refresh();
        } catch (e) {
          toast.error((e as Error).message);
        }
      }}
    >
      Borrar
    </Button>
  );
}

/** v1.10 · «Leer la etiqueta» (OCR del servidor) + formulario del alimento propio con lo leído. */
export function OwnFoodWithLabel() {
  const [draft, setDraft] = useState<OwnFoodDraft | undefined>();
  return (
    <div className="grid gap-3">
      <OcrFill<{ values: Record<string, number>; found: number }>
        endpoint="/api/ocr/label"
        accept="image/*"
        label="Leer la etiqueta con la cámara"
        onResult={(r) => {
          if (!r.found) return toast.error("No he podido leer la tabla nutricional: rellénala a mano");
          setDraft((d) => ({ ...d, ...r.values }));
          toast.success(`He leído ${r.found} valores: revísalos antes de guardar`);
        }}
      />
      <OwnFoodForm draft={draft} onSaved={() => setDraft(undefined)} />
    </div>
  );
}
