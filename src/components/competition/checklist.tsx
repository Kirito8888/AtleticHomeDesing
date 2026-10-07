"use client";

import { useState, useSyncExternalStore } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client-api";

const storeKey = (eventId: string) => `lifeos:checklist:${eventId}`;

// Lo marcado vive en este navegador. useSyncExternalStore evita el desajuste
// de hidratación (en el servidor no hay localStorage: nada marcado).
const listeners = new Set<() => void>();
function readRaw(eventId: string): string {
  try {
    return localStorage.getItem(storeKey(eventId)) ?? "[]";
  } catch {
    return "[]";
  }
}
function writeDone(eventId: string, done: string[]) {
  try {
    localStorage.setItem(storeKey(eventId), JSON.stringify(done));
  } catch {
    // sin almacenamiento: no se recuerda lo marcado
  }
  listeners.forEach((l) => l());
}
function parseDone(raw: string): string[] {
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Checklist de la bolsa. La lista se guarda en «Mis reglas» (vale para todas
 * las competiciones); lo marcado, solo en este dispositivo.
 */
export function CompetitionChecklist({ eventId, items: initial }: { eventId: string; items: string[] }) {
  const [items, setItems] = useState(initial);
  const raw = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => readRaw(eventId),
    () => "[]",
  );
  const done = parseDone(raw);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  function toggle(item: string) {
    writeDone(eventId, done.includes(item) ? done.filter((x) => x !== item) : [...done, item]);
  }

  async function save(next: string[]) {
    try {
      await api("/api/settings/prefs", { method: "PATCH", body: { checklist: next } });
      setItems(next);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <div className="grid gap-3">
      <ul className="grid gap-1.5" aria-label="Checklist de la bolsa">
        {items.map((item) => (
          <li key={item} className="flex items-center gap-2">
            <label className="flex min-h-10 flex-1 items-center gap-3 rounded-md border px-3 text-sm">
              <input type="checkbox" className="size-5" checked={done.includes(item)} onChange={() => toggle(item)} />
              <span className={done.includes(item) ? "text-muted-foreground line-through" : ""}>{item}</span>
            </label>
            {editing ? (
              <Button type="button" variant="ghost" size="sm" aria-label={`Quitar ${item}`} onClick={() => save(items.filter((x) => x !== item))}>
                ✕
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground tabular-nums">
        {done.filter((d) => items.includes(d)).length} de {items.length} en la bolsa
      </p>
      {editing ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const v = draft.trim();
            if (!v || items.includes(v)) return;
            void save([...items, v]);
            setDraft("");
          }}
        >
          <Input aria-label="Nuevo elemento" value={draft} maxLength={60} onChange={(e) => setDraft(e.target.value)} placeholder="p. ej. Crema solar" />
          <Button type="submit" size="sm">
            Añadir
          </Button>
        </form>
      ) : null}
      <Button type="button" variant="ghost" size="sm" className="justify-self-start" onClick={() => setEditing(!editing)}>
        {editing ? "Listo" : "Editar la lista"}
      </Button>
    </div>
  );
}
