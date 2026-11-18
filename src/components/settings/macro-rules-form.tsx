"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Field } from "@/components/form/chips";
import { Stepper } from "@/components/form/stepper";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client-api";
import { SESSION_KIND_LABEL, WEEKDAY_LABEL } from "@/lib/nutrition/macro-rules";
import type { MacroRule } from "@/lib/rules/prefs";

type Kind = keyof typeof SESSION_KIND_LABEL;
type Rules = { bySession: Partial<Record<Kind, MacroRule>>; byWeekday: Partial<Record<string, MacroRule>> };
type Thresholds = { longRunMinKm: number; longRunMinMin: number; highLoadRpe: number };

const EMPTY: MacroRule = { mode: "delta", kcal: null, proteinG: null, carbsG: null, fatG: null };
const FIELDS = [
  ["kcal", "Energía", "kcal", 50],
  ["proteinG", "Proteína", "g", 5],
  ["carbsG", "Hidratos", "g", 10],
  ["fatG", "Grasa", "g", 5],
] as const;
const hasEffect = (r: MacroRule) => r.kcal != null || r.proteinG != null || r.carbsG != null || r.fatG != null;

function RuleRow({ title, rule, onChange }: { title: string; rule: MacroRule; onChange: (r: MacroRule) => void }) {
  return (
    <details className="rounded-md border px-3 py-2" open={hasEffect(rule)}>
      <summary className="flex min-h-11 cursor-pointer items-center justify-between text-sm font-medium">
        <span>{title}</span>
        <span className="text-xs text-muted-foreground">{hasEffect(rule) ? (rule.mode === "set" ? "Fija" : "Suma") : "Sin cambio"}</span>
      </summary>
      <div className="grid gap-3 pb-2">
        <div className="flex gap-2" role="group" aria-label={`Modo de ${title}`}>
          {(["delta", "set"] as const).map((m) => (
            <Button key={m} type="button" size="sm" variant={rule.mode === m ? "default" : "outline"} className="min-h-11 flex-1" aria-pressed={rule.mode === m} onClick={() => onChange({ ...rule, mode: m })}>
              {m === "delta" ? "Suma o resta" : "Fija"}
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {FIELDS.map(([k, label, unit, step]) => (
            <Field key={k} label={label} hint="Vacío = sin cambio">
              <Stepper label={`${label} · ${title}`} value={rule[k]} min={rule.mode === "delta" ? -5000 : 0} max={10000} step={step} suffix={unit} onChange={(x) => onChange({ ...rule, [k]: x == null ? null : Math.round(x) })} />
            </Field>
          ))}
        </div>
      </div>
    </details>
  );
}

/** Reglas de kcal y macros por tipo de sesión y por día de la semana (vacío = objetivo general). */
export function MacroRulesForm({ initial, thresholds, legacy }: { initial: Rules | null; thresholds: Thresholds; legacy: { throwG: number | null; heavyG: number | null; restG: number | null } }) {
  const fromLegacy = (): Rules => {
    const set = (g: number | null): MacroRule | undefined => (g == null ? undefined : { ...EMPTY, mode: "set", carbsG: g });
    return { bySession: { high: set(legacy.throwG), strength: set(legacy.heavyG), rest: set(legacy.restG) }, byWeekday: {} };
  };
  const [rules, setRules] = useState<Rules>(initial ?? fromLegacy());
  const [th, setTh] = useState(thresholds);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const clean = <T extends string>(rec: Partial<Record<T, MacroRule>>) => Object.fromEntries(Object.entries<MacroRule | undefined>(rec).filter(([, r]) => r && hasEffect(r)));
      await api("/api/settings/prefs", {
        method: "PATCH",
        body: { macroRules: { bySession: clean(rules.bySession), byWeekday: clean(rules.byWeekday) }, ...th, carbsThrowDayG: null, carbsHeavyDayG: null, carbsRestDayG: null },
      });
      toast.success("Reglas de macros guardadas");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        Ajusta energía y macros según la sesión del día (planificada o hecha) o el día de la semana. Gana la regla de la sesión; si no hay, la del día de la semana; si no, tu objetivo general. Un objetivo marcado a mano en Nutrición prevalece sobre todo.
      </p>
      <h3 className="text-sm font-semibold">Por tipo de sesión</h3>
      {(Object.keys(SESSION_KIND_LABEL) as Kind[]).map((k) => (
        <RuleRow key={k} title={SESSION_KIND_LABEL[k]} rule={rules.bySession[k] ?? EMPTY} onChange={(r) => setRules((c) => ({ ...c, bySession: { ...c.bySession, [k]: r } }))} />
      ))}
      <h3 className="text-sm font-semibold">Por día de la semana</h3>
      {WEEKDAY_LABEL.map((name, i) => (
        <RuleRow key={name} title={name.charAt(0).toUpperCase() + name.slice(1)} rule={rules.byWeekday[String(i + 1)] ?? EMPTY} onChange={(r) => setRules((c) => ({ ...c, byWeekday: { ...c.byWeekday, [String(i + 1)]: r } }))} />
      ))}
      <details className="rounded-md border px-3 py-2">
        <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">Cómo se decide el tipo de sesión</summary>
        <div className="grid grid-cols-1 gap-3 pb-2">
          <p className="text-xs text-muted-foreground">Tirada / competición: hay una competición ese día o una tirada de al menos estos km o minutos. Alta carga: series, velocidad, lanzamientos o esfuerzo percibido desde el valor indicado.</p>
          <Field label="Tirada desde (km)">
            <Stepper label="Tirada desde km" value={th.longRunMinKm} min={1} max={100} step={1} suffix="km" onChange={(x) => x != null && setTh((c) => ({ ...c, longRunMinKm: x }))} />
          </Field>
          <Field label="Tirada desde (minutos)">
            <Stepper label="Tirada desde minutos" value={th.longRunMinMin} min={10} max={600} step={5} suffix="min" onChange={(x) => x != null && setTh((c) => ({ ...c, longRunMinMin: Math.round(x) }))} />
          </Field>
          <Field label="Alta carga desde (esfuerzo 1-10)">
            <Stepper label="Alta carga desde esfuerzo" value={th.highLoadRpe} min={1} max={10} step={0.5} decimals={1} onChange={(x) => x != null && setTh((c) => ({ ...c, highLoadRpe: x }))} />
          </Field>
        </div>
      </details>
      <Button type="button" variant="outline" className="min-h-11" onClick={save} disabled={saving}>
        Guardar reglas de macros
      </Button>
    </div>
  );
}
