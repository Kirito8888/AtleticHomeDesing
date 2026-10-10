"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { Field } from "@/components/form/chips";
import { Stepper } from "@/components/form/stepper";
import { BarcodeScanner } from "@/components/nutrition/barcode-scanner";
import { MEAL_LABEL, defaultMeal } from "@/components/nutrition/meals";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/client-api";
import { sendOrQueue } from "@/lib/offline/outbox";
import { formatNum } from "@/lib/format";

interface Food {
  id: string;
  name: string;
  brand: string | null;
  barcode: string | null;
  servingSizeG: number | null;
  kcalPer100g: number | null;
  proteinPer100g: number | null;
  carbsPer100g: number | null;
  fatPer100g: number | null;
  nutriScore: string | null;
}

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function AddFoodSheet({ date }: { date: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [meal, setMeal] = useState<string>(defaultMeal);
  const [query, setQuery] = useState("");
  const q = useDebounced(query.trim(), 450);
  const [results, setResults] = useState<Food[]>([]);
  const [warning, setWarning] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<Food | null>(null);
  const [grams, setGrams] = useState<number | null>(100);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (q.length < 2) return;
    let cancelled = false;
    // El estado de carga se actualiza dentro de la promesa, no en el cuerpo del efecto.
    Promise.resolve()
      .then(() => !cancelled && setSearching(true))
      .then(() => api<{ products: Food[]; source: string; warning?: string }>(`/api/nutrition/search?q=${encodeURIComponent(q)}`))
      .then((r) => {
        if (cancelled) return;
        setResults(r.products);
        setWarning(r.source === "cache" ? `OpenFoodFacts no disponible (${r.warning}); resultados de tu caché local.` : null);
      })
      .catch((e) => !cancelled && toast.error((e as Error).message))
      .finally(() => !cancelled && setSearching(false));
    return () => {
      cancelled = true;
    };
  }, [q]);

  const pick = (f: Food) => {
    setPicked(f);
    setGrams(f.servingSizeG ?? 100);
  };

  const onCode = useCallback(async (code: string) => {
    try {
      const f = await api<Food>(`/api/nutrition/products/${code}`);
      setPicked(f);
      setGrams(f.servingSizeG ?? 100);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, []);

  async function add(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const r = await sendOrQueue("/api/nutrition/entries", { date, mealType: meal, ...body }, `Comida: ${String(body.customName ?? picked?.name ?? "alimento")}`);
      toast.success(r === "queued" ? "Sin conexión: se añadirá al volver la cobertura" : "Añadido");
      setPicked(null);
      setOpen(false);
      if (r === "sent") router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const f = (k: FormData, n: string) => Number(String(k.get(n) ?? "0").replace(",", ".")) || 0;

  return (
    <Sheet open={open} onOpenChange={(o) => { setOpen(o); if (!o) setPicked(null); }}>
      <SheetTrigger asChild>
        <Button size="sm">
          <Plus /> Alimento
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Añadir alimento</SheetTitle>
          <SheetDescription>OpenFoodFacts España, escáner o manual.</SheetDescription>
        </SheetHeader>
        <Field label="Comida" htmlFor="meal">
          <Select id="meal" value={meal} onChange={(e) => setMeal(e.target.value)}>
            {Object.entries(MEAL_LABEL).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
        </Field>

        {picked ? (
          <div className="grid gap-3 rounded-lg border p-3">
            <div>
              <div className="font-semibold">{picked.name}</div>
              <div className="text-xs text-muted-foreground">
                {picked.brand ?? "—"} · {formatNum(picked.kcalPer100g)} kcal/100 g{picked.nutriScore ? ` · Nutri-Score ${picked.nutriScore}` : ""}
              </div>
            </div>
            <Field label="Cantidad">
              <Stepper label="Cantidad en gramos" value={grams} onChange={setGrams} step={10} max={5000} suffix="g" />
            </Field>
            {grams ? (
              <p className="text-sm tabular-nums">
                {formatNum(((picked.kcalPer100g ?? 0) * grams) / 100, 1)} kcal · P {formatNum(((picked.proteinPer100g ?? 0) * grams) / 100)} g · H{" "}
                {formatNum(((picked.carbsPer100g ?? 0) * grams) / 100)} g · G {formatNum(((picked.fatPer100g ?? 0) * grams) / 100)} g
              </p>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => setPicked(null)}>
                Volver
              </Button>
              <Button disabled={!grams || busy} onClick={() => add({ foodProductId: picked.id, quantityG: grams })}>
                Añadir
              </Button>
            </div>
          </div>
        ) : (
          <Tabs defaultValue="search">
            <TabsList>
              <TabsTrigger value="search">Buscar</TabsTrigger>
              <TabsTrigger value="scan">Escanear</TabsTrigger>
              <TabsTrigger value="manual">Manual</TabsTrigger>
            </TabsList>
            <TabsContent value="search" className="grid gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-8" placeholder="p.ej. hacendado yogur griego" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar alimento" />
              </div>
              {warning ? <p className="text-xs text-muted-foreground">{warning}</p> : null}
              {searching ? <p className="text-sm text-muted-foreground">Buscando…</p> : null}
              <ul className="grid gap-1">
                {results.map((r) => (
                  <li key={r.id}>
                    <button type="button" onClick={() => pick(r)} className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left hover:bg-accent">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{r.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{r.brand ?? "—"}</span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{r.kcalPer100g != null ? `${formatNum(r.kcalPer100g)} kcal` : "s/d"}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </TabsContent>
            <TabsContent value="scan">
              <BarcodeScanner onCode={onCode} />
            </TabsContent>
            <TabsContent value="manual">
              <form
                className="grid gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const k = new FormData(e.currentTarget);
                  void add({
                    customName: String(k.get("name") ?? ""),
                    quantityG: f(k, "qty"),
                    kcal: f(k, "kcal"),
                    proteinG: f(k, "p"),
                    carbsG: f(k, "c"),
                    fatG: f(k, "g"),
                  });
                }}
              >
                <Field label="Alimento" htmlFor="m-name">
                  <Input id="m-name" name="name" required />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    ["qty", "Cantidad (g)"],
                    ["kcal", "Kcal"],
                    ["p", "Proteína (g)"],
                    ["c", "Hidratos (g)"],
                    ["g", "Grasa (g)"],
                  ].map(([n, l]) => (
                    <Field key={n} label={l} htmlFor={`m-${n}`}>
                      <Input id={`m-${n}`} name={n} inputMode="decimal" required />
                    </Field>
                  ))}
                </div>
                <Button type="submit" disabled={busy}>
                  Añadir
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        )}
      </SheetContent>
    </Sheet>
  );
}
