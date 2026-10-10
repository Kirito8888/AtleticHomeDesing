"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client-api";

const SUGGESTIONS = [
  "¿Cuántos lanzamientos hice por semana el último mes?",
  "¿Cómo ha evolucionado mi carga semanal?",
  "¿Cuáles son mis mejores marcas y cuándo las hice?",
  "¿Qué semana entrené más y cuál menos?",
  "¿Cómo van mis tests físicos?",
];

/** Pregunta a tus datos de entreno: la IA solo ve un resumen numérico (sin salud). */
export function AskData() {
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function ask(question: string) {
    setQ(question);
    setBusy(true);
    setAnswer(null);
    try {
      const r = await api<{ answer: string }>("/api/ai/ask", { body: { question } });
      setAnswer(r.answer);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-1.5" aria-label="Preguntas sugeridas">
        {SUGGESTIONS.map((s) => (
          <button key={s} type="button" disabled={busy} onClick={() => void ask(s)} className="rounded-full border px-3 py-1 text-xs hover:bg-accent">
            {s}
          </button>
        ))}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim().length >= 3) void ask(q.trim());
        }}
      >
        <Input aria-label="Tu pregunta" value={q} maxLength={500} onChange={(e) => setQ(e.target.value)} placeholder="O escribe tu pregunta" />
        <Button type="submit" disabled={busy}>
          {busy ? "Pensando…" : "Preguntar"}
        </Button>
      </form>
      {answer ? (
        <div role="status" aria-label="Respuesta" className="rounded-md border p-3 text-sm whitespace-pre-line">
          {answer}
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">
        A tu IA solo le llega un resumen numérico de 8 semanas: sesiones, minutos, carga, lanzamientos, marcas, RM y tests. Nunca tu recuperación, tu ciclo, tus molestias, tus notas ni tu nombre.
      </p>
    </div>
  );
}
