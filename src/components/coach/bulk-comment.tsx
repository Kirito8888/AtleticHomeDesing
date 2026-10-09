"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/client-api";

type Item = { id: string; athleteId: string; label: string };

/** Un mismo comentario en varias sesiones (de uno o varios atletas). Cada atleta recibe su push. */
export function BulkComment({ items }: { items: Item[] }) {
  const router = useRouter();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  if (!items.length) return null;
  async function send() {
    setBusy(true);
    let ok = 0;
    for (const it of items.filter((x) => picked.has(x.id))) {
      try {
        await api(`/api/training/sessions/${it.id}/comments?athleteId=${encodeURIComponent(it.athleteId)}`, { body: { body: text } });
        ok++;
      } catch (e) {
        toast.error(`${it.label}: ${(e as Error).message}`);
      }
    }
    if (ok) toast.success(`Comentario enviado a ${ok} sesión(es)`);
    setPicked(new Set());
    setText("");
    setBusy(false);
    router.refresh();
  }
  return (
    <details className="rounded-md border p-3 text-sm">
      <summary className="cursor-pointer font-medium">Comentar varias sesiones a la vez</summary>
      <div className="mt-2 grid gap-2">
        <ul className="grid max-h-56 gap-1 overflow-y-auto" aria-label="Sesiones para comentar">
          {items.map((it) => (
            <li key={it.id}>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={picked.has(it.id)}
                  onChange={(e) => {
                    const next = new Set(picked);
                    if (e.target.checked) next.add(it.id);
                    else next.delete(it.id);
                    setPicked(next);
                  }}
                />
                <span className="min-w-0 truncate">{it.label}</span>
              </label>
            </li>
          ))}
        </ul>
        <Textarea aria-label="Comentario para todas" rows={2} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} />
        <Button type="button" disabled={busy || !picked.size || !text.trim()} onClick={send}>
          Enviar a {picked.size} sesión(es)
        </Button>
      </div>
    </details>
  );
}
