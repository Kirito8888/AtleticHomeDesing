"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client-api";
import { cn } from "@/lib/utils";

type Meal = { when: string; what: string };

/** Comida del día de competición: lo que toca ahora resaltado (si la prueba tiene hora). Editable. */
export function CompMeals({ meals: initial, current }: { meals: Meal[]; current: number | null }) {
  const [meals, setMeals] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initial);
  async function save() {
    const clean = draft.filter((m) => m.when.trim() && m.what.trim());
    try {
      await api("/api/settings/prefs", { method: "PATCH", body: { compMeals: clean } });
      setMeals(clean);
      setEditing(false);
      toast.success("Comida del día guardada");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  if (editing)
    return (
      <div className="grid gap-2 text-sm">
        {draft.map((m, i) => (
          <div key={i} className="grid grid-cols-[6rem_1fr] gap-2">
            <Input aria-label={`Cuándo ${i + 1}`} className="w-full min-w-0" value={m.when} maxLength={40} onChange={(e) => setDraft(draft.map((x, j) => (j === i ? { ...x, when: e.target.value } : x)))} />
            <Input aria-label={`Qué ${i + 1}`} className="w-full min-w-0" value={m.what} maxLength={160} onChange={(e) => setDraft(draft.map((x, j) => (j === i ? { ...x, what: e.target.value } : x)))} />
          </div>
        ))}
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setDraft([...draft, { when: "", what: "" }])}>
            + Momento
          </Button>
          <Button type="button" size="sm" onClick={save}>
            Guardar la comida del día
          </Button>
        </div>
      </div>
    );
  return (
    <div className="grid gap-2 text-sm">
      <ol className="grid gap-1.5" aria-label="Comida del día de competición">
        {meals.map((m, i) => (
          <li key={i} className={cn("grid grid-cols-[6rem_1fr] gap-2 rounded-md border px-2 py-1.5", current === i && "border-primary bg-primary/5 font-medium")}>
            <span className="text-muted-foreground">{m.when}</span>
            <span>{m.what}</span>
          </li>
        ))}
      </ol>
      <button type="button" className="justify-self-end text-xs text-muted-foreground underline-offset-2 hover:underline" onClick={() => (setDraft(meals), setEditing(true))}>
        Editar (plantilla para todas las competiciones)
      </button>
    </div>
  );
}
