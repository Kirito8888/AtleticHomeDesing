"use client";

import { Check, Flame, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client-api";
import { cn } from "@/lib/utils";

export type HabitView = { id: string; name: string; current: number; best: number; doneToday: boolean; last7: Array<{ date: string; done: boolean }> };

/** Hábitos de hoy: un toque marca o desmarca. La racha se actualiza al momento. */
export function HabitsCard({ habits: initial, today }: { habits: HabitView[]; today: string }) {
  const [habits, setHabits] = useState(initial);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState(false);

  async function toggle(h: HabitView) {
    const done = !h.doneToday;
    // Optimista: la racha de hoy suma o resta 1
    setHabits((xs) =>
      xs.map((x) =>
        x.id === h.id
          ? { ...x, doneToday: done, current: x.current + (done ? 1 : -1), best: Math.max(x.best, x.current + (done ? 1 : 0)), last7: x.last7.map((d) => (d.date === today ? { ...d, done } : d)) }
          : x,
      ),
    );
    try {
      await api(`/api/habits/${h.id}/toggle`, { body: { date: today } });
    } catch (e) {
      toast.error((e as Error).message);
      setHabits((xs) => xs.map((x) => (x.id === h.id ? h : x)));
    }
  }

  async function add() {
    if (!name.trim()) return;
    try {
      await api("/api/habits", { body: { name } });
      setName("");
      setHabits(await api<HabitView[]>("/api/habits"));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function archive(h: HabitView) {
    try {
      await api(`/api/habits/${h.id}`, { method: "PATCH", body: { archived: true } });
      setHabits((xs) => xs.filter((x) => x.id !== h.id));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="grid gap-2 text-sm">
      {habits.length ? (
        <ul className="grid gap-1.5" aria-label="Hábitos de hoy">
          {habits.map((h) => (
            <li key={h.id} className="flex items-center gap-2">
              <button
                type="button"
                role="checkbox"
                aria-checked={h.doneToday}
                aria-label={h.name}
                onClick={() => toggle(h)}
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-full border transition-colors",
                  h.doneToday ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent",
                )}
              >
                {h.doneToday ? <Check className="size-4" /> : null}
              </button>
              <span className="min-w-0 flex-1 truncate">{h.name}</span>
              <span className="flex gap-0.5" aria-hidden>
                {h.last7.map((d) => (
                  <span key={d.date} className={cn("size-1.5 rounded-full", d.done ? "bg-primary" : "bg-muted")} />
                ))}
              </span>
              <span className="flex w-10 shrink-0 items-center justify-end gap-0.5 text-xs tabular-nums text-muted-foreground" title={`Racha actual (mejor: ${h.best})`}>
                {h.current ? (
                  <>
                    <Flame className="size-3.5" /> {h.current}
                  </>
                ) : null}
              </span>
              {editing ? (
                <Button type="button" variant="ghost" size="icon" className="size-7" aria-label={`Archivar ${h.name}`} onClick={() => archive(h)}>
                  <X />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">Crea un hábito diario: estiramientos, lectura, 8 h de sueño…</p>
      )}
      {editing || !habits.length ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <Input aria-label="Nuevo hábito" placeholder="Nuevo hábito" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          <Button type="submit" variant="outline">
            Añadir
          </Button>
        </form>
      ) : null}
      {habits.length ? (
        <button type="button" className="justify-self-end text-xs text-muted-foreground underline-offset-2 hover:underline" onClick={() => setEditing((x) => !x)}>
          {editing ? "Listo" : "Editar hábitos"}
        </button>
      ) : null}
    </div>
  );
}
