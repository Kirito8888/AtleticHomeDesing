"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Chips, Field } from "@/components/form/chips";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/client-api";
import { formatDate } from "@/lib/format";
import { PLAN_MEALS, type PlanMeal } from "@/lib/nutrition/v17-nutrition";

function useRun() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<unknown>, ok?: string) {
    setBusy(true);
    try {
      const r = await fn();
      if (ok) toast.success(ok);
      router.refresh();
      return r;
    } catch (e) {
      toast.error((e as Error).message, { duration: 10_000 });
      return null;
    } finally {
      setBusy(false);
    }
  }
  return { busy, run };
}

type Entry = { id: string; date: string; mealType: PlanMeal; servings: number; recipeName: string };

/** 18 · Plan semanal: receta por día y comida, macros del día y lista de la compra de la semana. */
export function MealPlanWeek({ week, days, entries, recipes, macros }: { week: string; days: string[]; entries: Entry[]; recipes: Array<{ id: string; name: string }>; macros: Record<string, { kcal: number; proteinG: number; carbsG: number; fatG: number }> }) {
  const { busy, run } = useRun();
  const [date, setDate] = useState(days[0]);
  const [meal, setMeal] = useState<PlanMeal | null>("LUNCH");
  const [recipeId, setRecipeId] = useState(recipes[0]?.id ?? "");
  const [servings, setServings] = useState("1");
  if (!recipes.length) return <p className="text-sm text-muted-foreground">Primero crea alguna receta: el plan se monta con tus recetas.</p>;
  return (
    <div className="grid gap-4 text-sm">
      <form
        className="grid gap-3 rounded-md border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void run(() => api("/api/nutrition/plan", { body: { date, mealType: meal, recipeId, servings: Number(servings.replace(",", ".")) || 1 } }), "Añadida al plan");
        }}
      >
        <div className="grid grid-cols-2 gap-2">
          <Field label="Día" htmlFor="mp-day">
            <Select id="mp-day" value={date} onChange={(e) => setDate(e.target.value)}>
              {days.map((d) => (
                <option key={d} value={d}>
                  {formatDate(d, { weekday: "long", day: "numeric" })}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Raciones" htmlFor="mp-serv">
            <Input id="mp-serv" inputMode="decimal" value={servings} onChange={(e) => setServings(e.target.value)} />
          </Field>
        </div>
        <Chips label="Comida" options={(Object.keys(PLAN_MEALS) as PlanMeal[]).map((k) => ({ value: k, label: PLAN_MEALS[k] }))} value={meal} onChange={setMeal} />
        <Field label="Receta" htmlFor="mp-recipe">
          <Select id="mp-recipe" value={recipeId} onChange={(e) => setRecipeId(e.target.value)}>
            {recipes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit" disabled={busy || !meal || !recipeId}>
          Añadir al plan
        </Button>
      </form>
      <ol className="grid gap-2" aria-label="Plan de la semana">
        {days.map((d) => {
          const list = entries.filter((e) => e.date === d);
          const m = macros[d];
          return (
            <li key={d} className="rounded-md border p-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium capitalize">{formatDate(d, { weekday: "long", day: "numeric" })}</span>
                {m ? <span className="text-xs tabular-nums text-muted-foreground">{m.kcal} kcal · P {m.proteinG} · HC {m.carbsG} · G {m.fatG}</span> : null}
              </div>
              {list.length ? (
                <ul className="mt-1 grid gap-0.5">
                  {list.map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate">
                        {PLAN_MEALS[e.mealType]}: {e.recipeName}
                        {e.servings !== 1 ? ` ×${String(e.servings).replace(".", ",")}` : ""}
                      </span>
                      <Button type="button" size="sm" variant="ghost" aria-label={`Quitar ${e.recipeName}`} disabled={busy} onClick={() => run(() => api(`/api/nutrition/plan/${e.id}`, { method: "DELETE" }))}>
                        Quitar
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">Nada planificado.</p>
              )}
            </li>
          );
        })}
      </ol>
      <Button
        type="button"
        variant="outline"
        disabled={busy || !entries.length}
        onClick={() => run(async () => {
          const r = await api<{ added: number }>("/api/nutrition/plan/shopping", { body: { week } });
          toast.success(r.added ? `${r.added} ingredientes a la lista de la compra` : "La lista ya tenía todo");
        })}
      >
        Pasar los ingredientes a la lista de la compra
      </Button>
    </div>
  );
}

/** 21 · Prueba de sudoración. */
export function SweatForm({ today }: { today: string }) {
  const { busy, run } = useRun();
  const [f, setF] = useState({ date: today, minutes: "60", preKg: "", postKg: "", fluidMl: "", urineMl: "", tempC: "" });
  const n = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const fields: Array<[keyof typeof f, string, string]> = [
    ["minutes", "Minutos de ejercicio", "numeric"],
    ["preKg", "Peso antes (kg)", "decimal"],
    ["postKg", "Peso después (kg)", "decimal"],
    ["fluidMl", "Bebido durante (ml)", "numeric"],
    ["urineMl", "Orina durante (ml)", "numeric"],
    ["tempC", "Temperatura (°C)", "decimal"],
  ];
  return (
    <form
      className="grid gap-3 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        void run(() => api("/api/nutrition/sweat", { body: { date: f.date, minutes: n(f.minutes), preKg: n(f.preKg), postKg: n(f.postKg), fluidMl: n(f.fluidMl) ?? 0, urineMl: n(f.urineMl) ?? 0, tempC: n(f.tempC) } }), "Prueba guardada");
      }}
    >
      <p className="text-xs text-muted-foreground">Pésate sin ropa (o con la misma ropa seca) y tras orinar, antes y después de entrenar. Seca el sudor antes de la segunda pesada.</p>
      <Field label="Fecha" htmlFor="sw-date">
        <Input id="sw-date" type="date" className="w-44" value={f.date} onChange={(e) => set("date", e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        {fields.map(([k, label, mode]) => (
          <Field key={k} label={label} htmlFor={`sw-${k}`}>
            <Input id={`sw-${k}`} inputMode={mode as "numeric" | "decimal"} className="w-full min-w-0" value={f[k]} onChange={(e) => set(k, e.target.value)} />
          </Field>
        ))}
      </div>
      <Button type="submit" disabled={busy || !f.preKg || !f.postKg}>
        Calcular y guardar
      </Button>
    </form>
  );
}

export function DeleteButton({ url, label }: { url: string; label: string }) {
  const { busy, run } = useRun();
  return (
    <Button type="button" size="sm" variant="ghost" aria-label={label} disabled={busy} onClick={() => run(() => api(url, { method: "DELETE" }))}>
      Borrar
    </Button>
  );
}

/** 20 · Calendario de suplementos (sin dosis): días de cada uno y marcar las tomas de la semana. */
export function SupplementCalendar({ supplements, week }: { supplements: Array<{ id: string; name: string; days: number[] }>; week: { days: string[]; rows: Array<{ id: string; name: string; cells: Array<{ date: string; scheduled: boolean; taken: boolean }> }>; adherencePct: number | null } }) {
  const { busy, run } = useRun();
  const [editing, setEditing] = useState<string | null>(null);
  const WD = ["L", "M", "X", "J", "V", "S", "D"];
  return (
    <div className="grid gap-3 text-sm">
      <p className="text-xs text-muted-foreground">Solo recuerda qué días te toca y si lo tomaste. La cantidad la decide tu médico o dietista: la app no da dosis.</p>
      {week.rows.length ? (
        <table className="w-full text-xs" aria-label="Tomas de la semana">
          <thead>
            <tr>
              <th className="text-left font-normal text-muted-foreground"> </th>
              {week.days.map((d, i) => (
                <th key={d} className="font-normal text-muted-foreground">
                  {WD[i]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {week.rows.map((r) => (
              <tr key={r.id}>
                <td className="max-w-24 truncate py-1 pr-1">{r.name}</td>
                {r.cells.map((c) => (
                  <td key={c.date} className="text-center">
                    {c.scheduled || c.taken ? (
                      <input
                        type="checkbox"
                        className="size-4"
                        aria-label={`${r.name} ${formatDate(c.date, { weekday: "long" })}`}
                        checked={c.taken}
                        disabled={busy}
                        onChange={() => run(() => api(`/api/recovery/supplements/${r.id}/log`, { body: { date: c.date, taken: !c.taken } }))}
                      />
                    ) : (
                      <span className="text-muted-foreground">·</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-muted-foreground">Elige los días de cada suplemento para ver el calendario.</p>
      )}
      {week.adherencePct != null ? <p className="text-xs">Cumplimiento de la semana: {week.adherencePct} %</p> : null}
      <ul className="grid gap-1" aria-label="Días de cada suplemento">
        {supplements.map((s) => (
          <li key={s.id} className="grid gap-1">
            <button type="button" className="justify-self-start text-xs underline underline-offset-2" onClick={() => setEditing(editing === s.id ? null : s.id)}>
              Días de {s.name}: {s.days.length ? s.days.map((d) => WD[d - 1]).join(" ") : "sin calendario"}
            </button>
            {editing === s.id ? (
              <div className="flex flex-wrap gap-1" role="group" aria-label={`Días de ${s.name}`}>
                {WD.map((l, i) => {
                  const on = s.days.includes(i + 1);
                  return (
                    <Button
                      key={l}
                      type="button"
                      size="sm"
                      variant={on ? "default" : "outline"}
                      aria-pressed={on}
                      disabled={busy}
                      onClick={() => run(() => api(`/api/recovery/supplements/${s.id}`, { method: "PATCH", body: { days: on ? s.days.filter((d) => d !== i + 1) : [...s.days, i + 1] } }))}
                    >
                      {l}
                    </Button>
                  );
                })}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
