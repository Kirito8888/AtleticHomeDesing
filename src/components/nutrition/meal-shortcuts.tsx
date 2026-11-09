"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ListPlus, Repeat, Star, X } from "lucide-react";
import { toast } from "sonner";

import { MEAL_LABEL } from "@/components/nutrition/meals";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { api } from "@/lib/client-api";
import { confirmDialog } from "@/components/ui/confirm-dialog";

type Meal = keyof typeof MEAL_LABEL;

/** Plantilla de comida habitual tal como la da `listMealTemplates`. */
export type MealTemplateSummary = { id: string; name: string; mealType: Meal | null; items: number; kcal: number; foods: string[] };

function useRun() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return {
    busy,
    run: async (fn: () => Promise<unknown>, ok: string) => {
      setBusy(true);
      try {
        await fn();
        toast.success(ok);
        router.refresh();
        return true;
      } catch (e) {
        toast.error((e as Error).message);
        return false;
      } finally {
        setBusy(false);
      }
    },
  };
}

const MEAL_ORDER = Object.keys(MEAL_LABEL) as Meal[];

/** Agrupa las plantillas por toma (en el orden del día); las que no tienen toma van al final, en «Otras». */
export function groupByMeal(templates: MealTemplateSummary[]) {
  const groups: Array<{ key: string; label: string; items: MealTemplateSummary[] }> = [];
  for (const m of MEAL_ORDER) {
    const items = templates.filter((t) => t.mealType === m);
    if (items.length) groups.push({ key: m, label: MEAL_LABEL[m], items });
  }
  const loose = templates.filter((t) => !t.mealType);
  if (loose.length) groups.push({ key: "none", label: "Otras", items: loose });
  return groups;
}

/** Atajos: repetir comidas de ayer y cargar plantillas (comidas habituales) por toma en un toque. */
export function MealShortcuts({
  date,
  yesterday,
  favorites,
}: {
  date: string;
  yesterday: { fromDay: string; meals: Array<{ mealType: Meal; items: number; kcal: number }> };
  favorites: MealTemplateSummary[];
}) {
  const { busy, run } = useRun();
  if (!yesterday.meals.length && !favorites.length) return null;
  return (
    <div className="mb-4 grid gap-3">
      {yesterday.meals.length ? (
        <section aria-label="Repetir de ayer" className="grid gap-1.5">
          <h2 className="text-xs font-medium text-muted-foreground">Repetir de ayer</h2>
          <div className="flex flex-wrap gap-1.5">
            {yesterday.meals.map((m) => (
              <Button
                key={m.mealType}
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  run(
                    () => api("/api/nutrition/meals/copy", { body: { fromDate: yesterday.fromDay, toDate: date, mealType: m.mealType } }),
                    `${MEAL_LABEL[m.mealType]} de ayer añadido`,
                  )
                }
              >
                <Repeat /> {MEAL_LABEL[m.mealType]} · {m.kcal} kcal
              </Button>
            ))}
          </div>
        </section>
      ) : null}
      {favorites.length ? (
        <section aria-label="Plantillas de comidas" className="grid gap-1.5">
          <h2 className="text-xs font-medium text-muted-foreground">Plantillas · un toque las añade a su toma</h2>
          {groupByMeal(favorites).map((g) => (
            <div key={g.key} role="group" aria-label={`Plantillas de ${g.label.toLowerCase()}`} className="flex flex-wrap items-center gap-1.5">
              <span className="w-full text-xs text-muted-foreground">{g.label}</span>
              {g.items.map((f) => (
                <span key={f.id} className="inline-flex items-center rounded-md border text-sm">
                  <button
                    type="button"
                    disabled={busy}
                    title={f.foods.join(", ")}
                    className="flex min-h-9 items-center gap-1.5 py-1.5 pr-1 pl-3"
                    onClick={() => run(() => api(`/api/nutrition/meal-templates/${f.id}/apply`, { body: { date } }), `«${f.name}» añadida`)}
                  >
                    <Star className="size-3.5 fill-current text-amber-500" /> {f.name} · {f.kcal} kcal
                  </button>
                  <button
                    type="button"
                    aria-label={`Borrar plantilla ${f.name}`}
                    className="p-1.5 text-muted-foreground hover:text-foreground"
                    onClick={async () => {
                      if (await confirmDialog({ title: `¿Borrar la plantilla «${f.name}»?`, description: "Lo ya registrado no cambia.", confirmLabel: "Borrar", destructive: true })) {
                        void run(() => api(`/api/nutrition/meal-templates/${f.id}`, { method: "DELETE" }), "Plantilla borrada");
                      }
                    }}
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}

/** Botón ★ de cada toma del día: guarda sus alimentos y cantidades como plantilla habitual. */
export function SaveMealFavorite({ date, mealType, existing = [] }: { date: string; mealType: Meal; existing?: string[] }) {
  const { busy, run } = useRun();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(`${MEAL_LABEL[mealType]} habitual`);
  const clean = name.trim();
  const replaces = existing.includes(clean);
  const label = MEAL_LABEL[mealType].toLowerCase();
  return (
    <Sheet open={open} onOpenChange={(o) => { setOpen(o); if (o) setName(`${MEAL_LABEL[mealType]} habitual`); }}>
      <SheetTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="size-7" aria-label={`Guardar ${label} como plantilla`}>
          <Star className="size-4" />
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Guardar {label} como plantilla</SheetTitle>
          <SheetDescription>Se guardan los alimentos y cantidades de esta toma. Otro día la cargas en un toque.</SheetDescription>
        </SheetHeader>
        <form
          className="grid gap-3 px-4 pb-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!clean) return;
            const ok = await run(() => api("/api/nutrition/meal-templates", { body: { name: clean, date, mealType } }), `«${clean}» guardada en plantillas`);
            if (ok) setOpen(false);
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor={`tpl-name-${mealType}`}>Nombre de la plantilla</Label>
            <Input id={`tpl-name-${mealType}`} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} autoComplete="off" />
            {replaces ? <p className="text-xs text-amber-600 dark:text-amber-400">Ya tienes una plantilla con ese nombre: se sustituirá.</p> : null}
          </div>
          <Button type="submit" disabled={busy || !clean}>
            {replaces ? "Sustituir" : "Guardar plantilla"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

/** «Cargar plantilla» en una toma: vuelca cualquier plantilla en esta toma (primero las suyas). */
export function LoadTemplate({ date, mealType, templates }: { date: string; mealType: Meal; templates: MealTemplateSummary[] }) {
  const { busy, run } = useRun();
  const [open, setOpen] = useState(false);
  if (!templates.length) return null;
  const label = MEAL_LABEL[mealType].toLowerCase();
  const sorted = [...templates.filter((t) => t.mealType === mealType), ...templates.filter((t) => t.mealType !== mealType)];
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="size-7" aria-label={`Cargar plantilla en ${label}`}>
          <ListPlus className="size-4" />
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Cargar plantilla en {label}</SheetTitle>
          <SheetDescription>Sus alimentos se añaden a esta toma con las mismas cantidades.</SheetDescription>
        </SheetHeader>
        <ul className="grid gap-2 overflow-y-auto px-4 pb-4">
          {sorted.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                disabled={busy}
                className="grid w-full gap-0.5 rounded-md border p-3 text-left text-sm hover:bg-accent disabled:opacity-50"
                onClick={async () => {
                  const ok = await run(
                    () => api(`/api/nutrition/meal-templates/${t.id}/apply`, { body: { date, mealType } }),
                    `«${t.name}» añadida a ${label}`,
                  );
                  if (ok) setOpen(false);
                }}
              >
                <span className="font-medium">
                  {t.name} · {t.kcal} kcal
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {t.mealType ? `${MEAL_LABEL[t.mealType]} · ` : ""}
                  {t.foods.join(", ")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  );
}
