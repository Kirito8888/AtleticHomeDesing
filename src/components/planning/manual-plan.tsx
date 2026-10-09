"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Chips, Field, MultiChips } from "@/components/form/chips";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/client-api";

const TYPES = [
  { value: "STRENGTH", label: "Fuerza" },
  { value: "TECHNICAL", label: "Técnica" },
  { value: "TRACK", label: "Pista" },
  { value: "MIXED", label: "Mixta" },
] as const;
type Kind = (typeof TYPES)[number]["value"];
const DAYS = ["L", "M", "X", "J", "V", "S", "D"].map((label, value) => ({ value, label }));

/** Crear un plan propio (sin PDF ni IA): nombre, inicio, semanas y días. */
export function ManualPlanForm({ today }: { today: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [start, setStart] = useState(today);
  const [weeks, setWeeks] = useState<number | null>(4);
  const [weekdays, setWeekdays] = useState<number[]>([0, 2, 4]);
  const [type, setType] = useState<Kind>("STRENGTH");
  const [busy, setBusy] = useState(false);
  async function create() {
    setBusy(true);
    try {
      const r = await api<{ code: string }>("/api/planning/manual", { body: { name, start, weeks, weekdays, type } });
      toast.success("Plan creado: rellena cada día");
      router.push(`/planning/meso/${r.code}`);
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <div className="grid gap-4">
      <Field label="Nombre del plan" htmlFor="mp-name">
        <Input id="mp-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="p. ej. Pretemporada gimnasio" />
      </Field>
      <Field label="Empieza" htmlFor="mp-start">
        <Input id="mp-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
      </Field>
      <Field label="Semanas">
        <Chips label="Semanas" options={[2, 3, 4, 6, 8, 12].map((w) => ({ value: w, label: String(w) }))} value={weeks} onChange={setWeeks} />
      </Field>
      <Field label="Días de entreno">
        <MultiChips label="Días de entreno" options={DAYS} value={weekdays} onChange={setWeekdays} />
      </Field>
      <Field label="Tipo de sesión por defecto">
        <Chips label="Tipo de sesión" options={[...TYPES]} value={type} onChange={(v) => v && setType(v)} />
      </Field>
      <Button type="button" disabled={busy || !name.trim() || !weeks || !weekdays.length} onClick={create}>
        Crear plan
      </Button>
    </div>
  );
}

type Row = { exercise: string; sets: string; load: string; rir: string; rest: string; how: string };

/** Editar un día del plan propio: ejercicios con series × reps, carga (kg o %RM), RIR y descanso. */
export function ManualDayEditor({
  dayId,
  backHref,
  initial,
  exercises,
}: {
  dayId: string;
  backHref: string;
  initial: { title: string; durationMin: number | null; type: Kind; notes: string; rows: Row[] };
  exercises: string[];
}) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  const setRow = (i: number, p: Partial<Row>) => setV((c) => ({ ...c, rows: c.rows.map((r, j) => (j === i ? { ...r, ...p } : r)) }));
  async function save() {
    setBusy(true);
    try {
      await api(`/api/planning/manual/day/${dayId}`, { method: "PUT", body: { ...v, rows: v.rows.filter((r) => r.exercise.trim()) } });
      toast.success("Día guardado");
      router.push(backHref);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <div className="grid gap-4">
      <datalist id="ex-list">
        {exercises.map((e) => (
          <option key={e} value={e} />
        ))}
      </datalist>
      <div className="grid gap-3 sm:grid-cols-[1fr_8rem_10rem]">
        <Field label="Título" htmlFor="md-title">
          <Input id="md-title" value={v.title} maxLength={120} onChange={(e) => setV({ ...v, title: e.target.value })} />
        </Field>
        <Field label="Minutos" htmlFor="md-min">
          <Input id="md-min" inputMode="numeric" value={v.durationMin ?? ""} onChange={(e) => setV({ ...v, durationMin: Number(e.target.value) || null })} />
        </Field>
        <Field label="Tipo" htmlFor="md-type">
          <Select id="md-type" value={v.type} onChange={(e) => setV({ ...v, type: e.target.value as Kind })}>
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Notas (calentamiento, objetivos…)" htmlFor="md-notes">
        <Textarea id="md-notes" value={v.notes} maxLength={2000} onChange={(e) => setV({ ...v, notes: e.target.value })} />
      </Field>
      <div className="grid gap-2" aria-label="Ejercicios del día">
        {v.rows.map((r, i) => (
          <div key={i} className="grid gap-2 rounded-md border p-2">
            <div className="flex gap-2">
              <Input aria-label={`Ejercicio ${i + 1}`} list="ex-list" value={r.exercise} onChange={(e) => setRow(i, { exercise: e.target.value })} placeholder="Ejercicio" />
              <Button type="button" variant="ghost" size="sm" aria-label={`Quitar ejercicio ${i + 1}`} onClick={() => setV({ ...v, rows: v.rows.filter((_, j) => j !== i) })}>
                ✕
              </Button>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <Input aria-label={`Series ${i + 1}`} value={r.sets} onChange={(e) => setRow(i, { sets: e.target.value })} placeholder="3 × 5" />
              <Input aria-label={`Carga ${i + 1}`} value={r.load} onChange={(e) => setRow(i, { load: e.target.value })} placeholder="80 % o 60 kg" />
              <Input aria-label={`RIR ${i + 1}`} value={r.rir} onChange={(e) => setRow(i, { rir: e.target.value })} placeholder="RIR 2" />
              <Input aria-label={`Descanso ${i + 1}`} value={r.rest} onChange={(e) => setRow(i, { rest: e.target.value })} placeholder="2′" />
            </div>
            <Input aria-label={`Cómo ${i + 1}`} value={r.how} onChange={(e) => setRow(i, { how: e.target.value })} placeholder="Cómo lo hago (opcional)" />
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" className="justify-self-start" disabled={v.rows.length >= 40} onClick={() => setV({ ...v, rows: [...v.rows, { exercise: "", sets: "", load: "", rir: "", rest: "", how: "" }] })}>
          + Ejercicio
        </Button>
        <p className="text-xs text-muted-foreground">Usa «3 × 5» en series y «80 %» en carga: así salen los kg con tu tabla de RM y el registro llega precargado.</p>
      </div>
      <Button type="button" disabled={busy || !v.title.trim()} onClick={save}>
        Guardar día
      </Button>
    </div>
  );
}

/** Copiar una semana en la siguiente. */
export function DuplicateWeek({ code, weeks }: { code: string; weeks: number[] }) {
  const router = useRouter();
  const [from, setFrom] = useState(weeks[0]);
  const [busy, setBusy] = useState(false);
  if (weeks.length < 2) return null;
  return (
    <div className="flex flex-wrap items-end gap-2 text-sm">
      <Field label="Copiar la semana" htmlFor="dup-from">
        <Select id="dup-from" value={from} onChange={(e) => setFrom(Number(e.target.value))}>
          {weeks.slice(0, -1).map((w) => (
            <option key={w} value={w}>
              S{w} → S{w + 1}
            </option>
          ))}
        </Select>
      </Field>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={async () => {
          if (!confirm(`Se sustituyen los días de la semana ${from + 1} por una copia de la ${from}. ¿Seguir?`)) return;
          setBusy(true);
          try {
            const r = await api<{ copied: number }>(`/api/planning/manual/${code}/duplicate`, { body: { from } });
            toast.success(`${r.copied} días copiados`);
            router.refresh();
          } catch (e) {
            toast.error((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        Duplicar semana
      </Button>
    </div>
  );
}

/** v1.6 · Semanas tipo: guardar una semana del plan propio y aplicarla a otra. */
export function WeekTemplates({ code, weeks, templates }: { code: string; weeks: number[]; templates: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [week, setWeek] = useState(weeks[0]);
  const [name, setName] = useState("");
  const [tpl, setTpl] = useState(templates[0]?.id ?? "");
  const [target, setTarget] = useState(weeks[0]);
  const [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<string>) {
    setBusy(true);
    try {
      toast.success(await fn());
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!weeks.length) return null;
  return (
    <div className="grid gap-3 border-t pt-3 text-sm">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Guardar la semana" htmlFor="wt-week">
          <Select id="wt-week" value={week} onChange={(e) => setWeek(Number(e.target.value))}>
            {weeks.map((w) => (
              <option key={w} value={w}>
                S{w}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="como semana tipo" htmlFor="wt-name">
          <Input id="wt-name" value={name} maxLength={60} placeholder="Semana de carga" onChange={(e) => setName(e.target.value)} />
        </Field>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy || !name.trim()}
          onClick={() => run(async () => (await api(`/api/planning/manual/${code}/week-template`, { body: { name, week } }), setName(""), "Semana tipo guardada"))}
        >
          Guardar
        </Button>
      </div>
      {templates.length ? (
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Aplicar la semana tipo" htmlFor="wt-tpl">
            <Select id="wt-tpl" value={tpl} onChange={(e) => setTpl(e.target.value)}>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="a la semana" htmlFor="wt-target">
            <Select id="wt-target" value={target} onChange={(e) => setTarget(Number(e.target.value))}>
              {weeks.map((w) => (
                <option key={w} value={w}>
                  S{w}
                </option>
              ))}
            </Select>
          </Field>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy || !tpl}
            onClick={() => {
              if (!confirm(`Se sustituyen los días de la semana ${target} (salvo los ya hechos). ¿Seguir?`)) return;
              void run(async () => `${(await api<{ applied: number }>(`/api/planning/manual/${code}/week-template`, { method: "PUT", body: { week: target, templateId: tpl } })).applied} días aplicados`);
            }}
          >
            Aplicar
          </Button>
        </div>
      ) : null}
    </div>
  );
}
