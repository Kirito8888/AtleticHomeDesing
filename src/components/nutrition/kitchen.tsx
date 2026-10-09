"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Field } from "@/components/form/chips";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { BarcodeScanner } from "@/components/nutrition/barcode-scanner";
import { api } from "@/lib/client-api";
import { recipeMacros, type RecipeItem } from "@/lib/nutrition/kitchen";
import { cn } from "@/lib/utils";

// ---------- Lista de la compra ----------
export function ShoppingList({ items: initial, favorites }: { items: Array<{ id: string; name: string; qty: string | null; done: boolean }>; favorites: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [name, setName] = useState("");
  const [fav, setFav] = useState<string[]>([]);
  async function call(fn: () => Promise<unknown>, ok?: string) {
    try {
      await fn();
      if (ok) toast.success(ok);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  async function reload() {
    setItems(await api("/api/nutrition/shopping"));
  }
  return (
    <div className="grid gap-4 text-sm">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) void call(async () => (await api("/api/nutrition/shopping", { body: { name } }), setName(""), await reload()));
        }}
      >
        <Input aria-label="Añadir a la lista" placeholder="Añadir…" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        <Button type="submit" variant="outline">
          Añadir
        </Button>
      </form>
      <ul className="grid gap-1" aria-label="Lista de la compra">
        {items.map((it) => (
          <li key={it.id}>
            <label className={cn("flex items-center gap-2 rounded-md border px-2 py-1.5", it.done && "text-muted-foreground line-through")}>
              <input
                type="checkbox"
                className="size-4"
                checked={it.done}
                onChange={async () => {
                  setItems(items.map((x) => (x.id === it.id ? { ...x, done: !x.done } : x)));
                  await call(() => api(`/api/nutrition/shopping/${it.id}`, { method: "PATCH", body: { done: !it.done } }));
                }}
              />
              <span className="min-w-0 flex-1 truncate">{it.name}</span>
              {it.qty ? <span className="shrink-0 text-xs text-muted-foreground">{it.qty}</span> : null}
            </label>
          </li>
        ))}
      </ul>
      <details className="rounded-md border p-2">
        <summary className="cursor-pointer text-sm font-medium">Escanear en el súper</summary>
        <div className="mt-2 grid gap-2">
          <p className="text-xs text-muted-foreground">Si el producto está en la lista se tacha; si no, se añade. Datos de Open Food Facts.</p>
          <BarcodeScanner
            onCode={(code) =>
              call(async () => {
                const p = await api<{ name: string; brand: string | null; nutriScore: string | null }>(`/api/nutrition/products/${encodeURIComponent(code)}`);
                const key = p.name.trim().toLowerCase();
                const hit = items.find((x) => !x.done && (key.includes(x.name.trim().toLowerCase()) || x.name.trim().toLowerCase().includes(key)));
                const score = p.nutriScore ? ` · Nutri-Score ${p.nutriScore}` : "";
                if (hit) {
                  await api(`/api/nutrition/shopping/${hit.id}`, { method: "PATCH", body: { done: true } });
                  toast.success(`Tachado: ${hit.name}${score}`);
                } else {
                  await api("/api/nutrition/shopping", { body: { name: p.name.slice(0, 80), qty: p.brand?.slice(0, 40) ?? null } });
                  toast.success(`Añadido: ${p.name}${score}`);
                }
                await reload();
              })
            }
          />
        </div>
      </details>
      {items.some((x) => x.done) ? (
        <Button type="button" variant="ghost" size="sm" className="justify-self-start" onClick={() => call(async () => (await api("/api/nutrition/shopping?done=1", { method: "DELETE" }), await reload()), "Lista limpia")}>
          Quitar lo comprado
        </Button>
      ) : null}
      {favorites.length ? (
        <div className="grid gap-2 border-t pt-3">
          <p className="font-medium">Desde tus comidas favoritas</p>
          <div className="flex flex-wrap gap-1.5">
            {favorites.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={fav.includes(f.id)}
                onClick={() => setFav(fav.includes(f.id) ? fav.filter((x) => x !== f.id) : [...fav, f.id])}
                className={cn("h-8 rounded-full border px-3 text-xs", fav.includes(f.id) ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent")}
              >
                {f.name}
              </button>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={!fav.length}
            onClick={() =>
              call(async () => {
                const r = await api<{ added: number }>("/api/nutrition/shopping", { body: { favorites: fav } });
                toast.success(`${r.added} ingredientes añadidos`);
                setFav([]);
                await reload();
              })
            }
          >
            Añadir sus ingredientes
          </Button>
        </div>
      ) : null}
    </div>
  );
}

// ---------- Recetas ----------
type Row = { name: string; grams: string; kcal100: string; protein100: string; carbs100: string; fat100: string };
const emptyRow = (): Row => ({ name: "", grams: "", kcal100: "", protein100: "", carbs100: "", fat100: "" });
const n = (s: string) => Number(s.replace(",", ".")) || 0;
type Found = { name: string; kcalPer100g: number | null; proteinPer100g: number | null; carbsPer100g: number | null; fatPer100g: number | null };

export function RecipeBuilder() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [servings, setServings] = useState("2");
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Found[]>([]);
  const items: RecipeItem[] = rows
    .filter((r) => r.name.trim() && n(r.grams) > 0)
    .map((r) => ({ name: r.name.trim(), grams: n(r.grams), kcal100: n(r.kcal100), protein100: n(r.protein100), carbs100: n(r.carbs100), fat100: n(r.fat100) }));
  const m = items.length ? recipeMacros(items, Math.max(1, n(servings))) : null;
  const set = (i: number, k: keyof Row, v: string) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));

  async function search() {
    if (q.trim().length < 2) return;
    try {
      const r = await api<{ products?: Found[] } | Found[]>(`/api/nutrition/search?q=${encodeURIComponent(q)}`);
      setFound((Array.isArray(r) ? r : (r.products ?? [])).slice(0, 6));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  function pick(f: Found) {
    const row: Row = { name: f.name, grams: "100", kcal100: String(f.kcalPer100g ?? 0), protein100: String(f.proteinPer100g ?? 0), carbs100: String(f.carbsPer100g ?? 0), fat100: String(f.fatPer100g ?? 0) };
    const empty = rows.findIndex((r) => !r.name.trim());
    setRows(empty >= 0 ? rows.map((r, j) => (j === empty ? row : r)) : [...rows, row]);
    setFound([]);
    setQ("");
  }
  async function save() {
    try {
      await api("/api/nutrition/recipes", { body: { name, servings: Math.max(1, n(servings)), items } });
      toast.success("Receta guardada");
      setName("");
      setRows([emptyRow()]);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  return (
    <div className="grid gap-3 text-sm">
      <div className="grid grid-cols-[1fr_5rem] gap-2">
        <Field label="Receta" htmlFor="rc-name">
          <Input id="rc-name" className="w-full min-w-0" value={name} maxLength={80} placeholder="Arroz con pollo" onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Raciones" htmlFor="rc-serv">
          <Input id="rc-serv" inputMode="numeric" className="w-full min-w-0" value={servings} onChange={(e) => setServings(e.target.value)} />
        </Field>
      </div>
      <div className="flex gap-2">
        <Input aria-label="Buscar ingrediente" placeholder="Buscar ingrediente (OpenFoodFacts)" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), void search())} />
        <Button type="button" variant="outline" onClick={search}>
          Buscar
        </Button>
      </div>
      {found.length ? (
        <ul className="grid gap-1 rounded-md border p-1">
          {found.map((f, i) => (
            <li key={i}>
              <button type="button" className="w-full truncate rounded px-2 py-1 text-left hover:bg-accent" onClick={() => pick(f)}>
                {f.name} · {f.kcalPer100g ?? "?"} kcal/100 g
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="grid gap-2" aria-label="Ingredientes">
        {rows.map((r, i) => (
          <div key={i} className="grid gap-1 rounded-md border p-2">
            <div className="grid grid-cols-[1fr_5rem] gap-2">
              <Input aria-label={`Ingrediente ${i + 1}`} className="w-full min-w-0" value={r.name} onChange={(e) => set(i, "name", e.target.value)} placeholder="Ingrediente" />
              <Input aria-label={`Gramos ${i + 1}`} inputMode="decimal" className="w-full min-w-0" value={r.grams} onChange={(e) => set(i, "grams", e.target.value)} placeholder="g" />
            </div>
            <div className="grid grid-cols-4 gap-1">
              {(["kcal100", "protein100", "carbs100", "fat100"] as const).map((k) => (
                <Input key={k} aria-label={`${{ kcal100: "kcal", protein100: "Proteína", carbs100: "Hidratos", fat100: "Grasa" }[k]} por 100 g ${i + 1}`} inputMode="decimal" className="w-full min-w-0 px-1 text-xs" value={r[k]} onChange={(e) => set(i, k, e.target.value)} placeholder={{ kcal100: "kcal", protein100: "P", carbs100: "H", fat100: "G" }[k]} />
              ))}
            </div>
          </div>
        ))}
        <Button type="button" variant="ghost" size="sm" className="justify-self-start" onClick={() => setRows([...rows, emptyRow()])}>
          + Ingrediente
        </Button>
      </div>
      {m ? (
        <p className="rounded-md bg-muted p-2 tabular-nums" aria-label="Macros por ración">
          Por ración ({m.perServing.grams} g): {m.perServing.kcal} kcal · P {m.perServing.proteinG} · H {m.perServing.carbsG} · G {m.perServing.fatG}
        </p>
      ) : null}
      <Button type="button" disabled={!name.trim() || !items.length} onClick={save}>
        Guardar receta
      </Button>
    </div>
  );
}

export function RecipeActions({ id, name, today }: { id: string; name: string; today: string }) {
  const router = useRouter();
  const [meal, setMeal] = useState("LUNCH");
  const [servings, setServings] = useState("1");
  async function use(body: unknown, ok: string) {
    try {
      await api(`/api/nutrition/recipes/${id}/use`, { body });
      toast.success(ok);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  return (
    <div className="flex flex-wrap items-end gap-2 text-xs">
      <Select aria-label={`Comida para ${name}`} className="h-8 w-28" value={meal} onChange={(e) => setMeal(e.target.value)}>
        {[
          ["BREAKFAST", "Desayuno"],
          ["LUNCH", "Comida"],
          ["SNACK", "Merienda"],
          ["DINNER", "Cena"],
        ].map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </Select>
      <Input aria-label={`Raciones de ${name}`} inputMode="decimal" className="h-8 w-14" value={servings} onChange={(e) => setServings(e.target.value)} />
      <Button type="button" size="sm" onClick={() => use({ as: "entry", date: today, mealType: meal, servings: n(servings) || 1 }, "Anotada en el día")}>
        Anotar hoy
      </Button>
      <Button type="button" size="sm" variant="outline" onClick={() => use({ as: "favorite", mealType: meal }, "Guardada en favoritas")}>
        A favoritas
      </Button>
      <button
        type="button"
        className="text-destructive underline-offset-2 hover:underline"
        onClick={async () => {
          if (!confirm(`¿Borrar «${name}»?`)) return;
          await api(`/api/nutrition/recipes/${id}`, { method: "DELETE" }).catch((e: Error) => toast.error(e.message));
          router.refresh();
        }}
      >
        Borrar
      </button>
    </div>
  );
}
