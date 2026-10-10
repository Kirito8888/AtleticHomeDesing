"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { MEAL_LABEL } from "@/components/nutrition/meals";
import { OcrFill } from "@/components/ocr-fill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/client-api";
import { PLAN_MEALS } from "@/lib/nutrition/planning";

type Item = { name: string; grams: number; match: { id: string; name: string; brand: string | null; kcalPer100g: number | null } | null };

/** v1.10 · Comida desde una foto (IA del usuario): propone alimentos y gramos; confirmas antes de anotar. */
export function FoodPhoto({ date }: { date: string }) {
  const router = useRouter();
  const [items, setItems] = useState<Item[] | null>(null);
  const [meal, setMeal] = useState("LUNCH");
  const [busy, setBusy] = useState(false);
  return (
    <div className="mb-4 grid gap-2 text-sm">
      <OcrFill<{ items: Item[] }>
        endpoint="/api/nutrition/photo"
        accept="image/*"
        label="Anotar desde una foto (IA)"
        onResult={(r) => {
          if (!r.items.length) return toast.error("No he reconocido comida en la foto");
          setItems(r.items);
        }}
      />
      {items ? (
        <div role="group" aria-label="Alimentos de la foto" className="grid gap-2 rounded-md border p-3">
          <p className="text-xs text-muted-foreground">Revisa nombres y gramos: es una estimación. La foto no se ha guardado.</p>
          <ul className="grid gap-2">
            {items.map((it, i) => (
              <li key={i} className="grid grid-cols-[1fr_5.5rem] items-center gap-2">
                <span className="min-w-0">
                  <span className="block truncate">{it.match ? it.match.name : it.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{it.match ? `${it.match.brand ? `${it.match.brand} · ` : ""}${it.match.kcalPer100g ?? "—"} kcal/100 g` : "Sin coincidencia en el catálogo: añádelo a mano"}</span>
                </span>
                <Input aria-label={`Gramos de ${it.name}`} inputMode="numeric" value={String(it.grams)} onChange={(e) => setItems(items.map((x, k) => (k === i ? { ...x, grams: Number(e.target.value.replace(/\D/g, "")) || 0 } : x)))} />
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            <Select aria-label="Comida" value={meal} onChange={(e) => setMeal(e.target.value)} className="w-auto">
              {Object.entries(MEAL_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
            <Button
              type="button"
              disabled={busy || !items.some((i) => i.match && i.grams > 0)}
              onClick={async () => {
                setBusy(true);
                try {
                  const ok = items.filter((i) => i.match && i.grams > 0);
                  for (const it of ok) await api("/api/nutrition/entries", { body: { date, mealType: meal, foodProductId: it.match!.id, quantityG: it.grams } });
                  toast.success(`${ok.length} alimentos anotados`);
                  setItems(null);
                  router.refresh();
                } catch (e) {
                  toast.error((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Anotar {items.filter((i) => i.match && i.grams > 0).length}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setItems(null)}>
              Descartar
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

type Draft = { days: Array<{ date: string; meals: Array<{ mealType: keyof typeof PLAN_MEALS; recipeId: string; recipe: string; servings: number; kcal: number; proteinG: number }>; kcal: number; proteinG: number }>; goal: { kcal: number; proteinG: number } | null; dropped: number };

/** v1.10 · Propuesta de la semana con tus recetas (IA): la revisas y aceptas los días que quieras. */
export function PlanSuggest({ weekStart }: { weekStart: string }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [keep, setKeep] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid gap-3 text-sm">
      <Button
        type="button"
        variant="outline"
        className="justify-self-start"
        disabled={busy}
        onClick={() =>
          run(async () => {
            const d = await api<Draft>("/api/nutrition/plan/suggest", { body: { weekStart } });
            setDraft(d);
            setKeep(new Set(d.days.filter((x) => x.meals.length).map((x) => x.date)));
          })
        }
      >
        {busy && !draft ? "Pensando…" : "Proponer la semana con IA"}
      </Button>
      {draft ? (
        <div role="group" aria-label="Propuesta de la semana" className="grid gap-2 rounded-md border p-3">
          <p className="text-xs text-muted-foreground">
            Borrador con tus recetas{draft.goal ? `; objetivo ${draft.goal.kcal} kcal y ${draft.goal.proteinG} g de proteína al día` : ""}. Marca los días que quieras añadir.
            {draft.dropped ? ` (${draft.dropped} propuestas descartadas: no eran recetas tuyas)` : ""}
          </p>
          <ul className="grid gap-2">
            {draft.days.map((d) => (
              <li key={d.date} className="grid gap-1">
                <label className="flex items-center gap-2 font-medium">
                  <input type="checkbox" className="size-4" checked={keep.has(d.date)} disabled={!d.meals.length} onChange={(e) => setKeep((s) => { const n = new Set(s); if (e.target.checked) n.add(d.date); else n.delete(d.date); return n; })} />
                  {new Date(`${d.date}T12:00:00Z`).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "short" })} · {d.kcal} kcal · {d.proteinG} g prot.
                </label>
                <span className="pl-6 text-xs text-muted-foreground">{d.meals.map((m) => `${PLAN_MEALS[m.mealType]}: ${m.recipe}${m.servings !== 1 ? ` ×${m.servings}` : ""}`).join(" · ") || "Sin propuesta"}</span>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Button
              type="button"
              disabled={busy || !keep.size}
              onClick={() =>
                run(async () => {
                  const entries = draft.days.filter((d) => keep.has(d.date)).flatMap((d) => d.meals.map((m) => ({ date: d.date, mealType: m.mealType, recipeId: m.recipeId, servings: m.servings })));
                  const r = await api<{ added: number }>("/api/nutrition/plan/accept", { body: { entries } });
                  toast.success(`${r.added} comidas añadidas al plan`);
                  setDraft(null);
                  router.refresh();
                })
              }
            >
              Añadir {keep.size} {keep.size === 1 ? "día" : "días"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setDraft(null)}>
              Descartar
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
