"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/client-api";
import { cn } from "@/lib/utils";

export type CommentView = { id: string; body: string; createdAt: string; author: string; mine: boolean; fromCoach: boolean };

const when = (iso: string) => new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }).format(new Date(iso));

/** Hilo de comentarios de una sesión entre atleta y entrenador/a. */
export function CommentThread({ sessionId, athleteId, initial }: { sessionId: string; athleteId?: string; initial: CommentView[] }) {
  const [items, setItems] = useState(initial);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const qs = athleteId ? `?athleteId=${encodeURIComponent(athleteId)}` : "";

  async function reload() {
    setItems(await api<CommentView[]>(`/api/training/sessions/${sessionId}/comments${qs}`));
  }

  async function send() {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await api(`/api/training/sessions/${sessionId}/comments${qs}`, { body: { body: text } });
      setText("");
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    try {
      await api(`/api/training/sessions/${sessionId}/comments?commentId=${encodeURIComponent(id)}`, { method: "DELETE" });
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="grid gap-3 text-sm">
      {items.length ? (
        <ul className="grid gap-2" aria-label="Comentarios">
          {items.map((c) => (
            <li key={c.id} className={cn("grid gap-0.5 rounded-md border p-2", c.fromCoach ? "border-primary/40 bg-primary/5" : "")}>
              <div className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  <span className="font-medium text-foreground">{c.author}</span>
                  {c.fromCoach ? " · entrenador/a" : ""} · {when(c.createdAt)}
                </span>
                {c.mine ? (
                  <button type="button" className="underline-offset-2 hover:underline" onClick={() => remove(c.id)} aria-label="Borrar mi comentario">
                    borrar
                  </button>
                ) : null}
              </div>
              <p className="whitespace-pre-wrap">{c.body}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">Sin comentarios todavía.</p>
      )}
      <Textarea aria-label="Escribe un comentario" value={text} maxLength={2000} rows={2} onChange={(e) => setText(e.target.value)} />
      <Button type="button" variant="outline" onClick={send} disabled={busy || !text.trim()} className="justify-self-end">
        Enviar
      </Button>
    </div>
  );
}
