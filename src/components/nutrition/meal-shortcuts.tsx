"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Repeat, Star, X } from "lucide-react";
import { toast } from "sonner";

import { MEAL_LABEL } from "@/components/nutrition/meals";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client-api";

type Meal = keyof typeof MEAL_LABEL;

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
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
  };
}

/** Atajos: repetir comidas de ayer y registrar favoritas en un toque. */
export function MealShortcuts({
  date,
  yesterday,
  favorites,
}: {
  date: string;
  yesterday: { fromDay: string; meals: Array<{ mealType: Meal; items: number; kcal: number }> };
  favorites: Array<{ id: string; name: string; mealType: Meal | null; items: number; kcal: number }>;
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
        <section aria-label="Comidas favoritas" className="grid gap-1.5">
          <h2 className="text-xs font-medium text-muted-foreground">Favoritas</h2>
          <div className="flex flex-wrap gap-1.5">
            {favorites.map((f) => (
              <span key={f.id} className="inline-flex items-center rounded-md border text-sm">
                <button
                  type="button"
                  disabled={busy}
                  className="flex items-center gap-1.5 py-1.5 pr-1 pl-3"
                  onClick={() => run(() => api(`/api/nutrition/meal-templates/${f.id}/apply`, { body: { date } }), `«${f.name}» añadida`)}
                >
                  <Star className="size-3.5 fill-current text-amber-500" /> {f.name} · {f.kcal} kcal
                </button>
                <button
                  type="button"
                  aria-label={`Borrar favorita ${f.name}`}
                  className="p-1.5 text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    if (confirm(`¿Borrar la comida favorita «${f.name}»?`)) {
                      void run(() => api(`/api/nutrition/meal-templates/${f.id}`, { method: "DELETE" }), "Favorita borrada");
                    }
                  }}
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

/** Botón ★ de cada comida del día: la guarda como favorita. */
export function SaveMealFavorite({ date, mealType }: { date: string; mealType: Meal }) {
  const { busy, run } = useRun();
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-7"
      disabled={busy}
      aria-label={`Guardar ${MEAL_LABEL[mealType].toLowerCase()} como favorita`}
      onClick={() => {
        const name = prompt("Nombre de la comida favorita", `${MEAL_LABEL[mealType]} habitual`)?.trim();
        if (name) void run(() => api("/api/nutrition/meal-templates", { body: { name, date, mealType } }), `«${name}» guardada en favoritas`);
      }}
    >
      <Star className="size-4" />
    </Button>
  );
}
