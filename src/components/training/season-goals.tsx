"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client-api";
import { formatNum } from "@/lib/format";

type Goal = { label: string; markM: number };

/** Objetivos de la temporada (mínimas, marca objetivo…): líneas en la gráfica. Los pone el usuario. */
export function SeasonGoals({ goals: initial }: { goals: Goal[] }) {
  const router = useRouter();
  const [goals, setGoals] = useState(initial);
  const [label, setLabel] = useState("");
  const [mark, setMark] = useState("");

  async function save(next: Goal[]) {
    try {
      await api("/api/settings/prefs", { method: "PATCH", body: { seasonGoals: next } });
      setGoals(next);
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <div className="grid gap-2 text-sm">
      {goals.length ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Objetivos de la temporada">
          {goals.map((g) => (
            <li key={g.label} className="flex items-center gap-1 rounded-full border px-3 py-1 text-xs">
              {g.label}: <span className="tabular-nums">{formatNum(g.markM, 2)} m</span>
              <button type="button" aria-label={`Quitar ${g.label}`} className="ml-1 text-muted-foreground" onClick={() => save(goals.filter((x) => x !== g))}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const m = Number(mark.replace(",", "."));
          if (!label.trim() || !(m > 0)) return toast.error("Pon un nombre y una marca");
          if (goals.length >= 6) return toast.error("Máximo 6 objetivos");
          void save([...goals.filter((g) => g.label !== label.trim()), { label: label.trim().slice(0, 40), markM: m }]);
          setLabel("");
          setMark("");
        }}
      >
        <Input aria-label="Nombre del objetivo" className="min-w-0 flex-1" value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} placeholder="p. ej. Mínima" />
        <Input aria-label="Marca objetivo (m)" className="w-24" inputMode="decimal" value={mark} onChange={(e) => setMark(e.target.value)} placeholder="m" />
        <Button type="submit" size="sm" variant="outline">
          Añadir objetivo
        </Button>
      </form>
    </div>
  );
}
