"use client";

import { Chips } from "@/components/form/chips";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { BODY_AREA_LABEL, type BodyAreaName } from "@/lib/recovery/injury-rules";

export type FeelingValue = { area: BodyAreaName; side: "LEFT" | "RIGHT" | "BOTH" | null; pain: number };

const PAIN = Array.from({ length: 10 }, (_, i) => ({ value: i + 1, label: String(i + 1) }));
const SIDES = [
  { value: "LEFT" as const, label: "Izq." },
  { value: "RIGHT" as const, label: "Der." },
  { value: "BOTH" as const, label: "Ambos" },
];

/** «¿Alguna molestia?»: zona, lado y dolor 1–10, sin escribir. */
export function FeelingsPicker({ value, onChange }: { value: FeelingValue[]; onChange: (v: FeelingValue[]) => void }) {
  const set = (i: number, patch: Partial<FeelingValue>) => onChange(value.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const free = (Object.keys(BODY_AREA_LABEL) as BodyAreaName[]).filter((a) => !value.some((f) => f.area === a));
  return (
    <div className="grid gap-2">
      {value.map((f, i) => (
        <div key={f.area} className="grid gap-2 rounded-md border p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{BODY_AREA_LABEL[f.area]}</span>
            <Button type="button" variant="ghost" size="sm" aria-label={`Quitar molestia en ${BODY_AREA_LABEL[f.area]}`} onClick={() => onChange(value.filter((_, j) => j !== i))}>
              ✕
            </Button>
          </div>
          <Chips label={`Lado ${BODY_AREA_LABEL[f.area]}`} options={SIDES} value={f.side} onChange={(side) => set(i, { side })} allowDeselect />
          <Chips label={`Dolor ${BODY_AREA_LABEL[f.area]}`} options={PAIN} value={f.pain} onChange={(pain) => pain != null && set(i, { pain })} />
        </div>
      ))}
      {free.length && value.length < 8 ? (
        <Select
          aria-label="Añadir molestia"
          value=""
          onChange={(e) => e.target.value && onChange([...value, { area: e.target.value as BodyAreaName, side: null, pain: 3 }])}
        >
          <option value="">+ Añadir una molestia…</option>
          {free.map((a) => (
            <option key={a} value={a}>
              {BODY_AREA_LABEL[a]}
            </option>
          ))}
        </Select>
      ) : null}
    </div>
  );
}
