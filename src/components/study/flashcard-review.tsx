"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/client-api";

interface Deck {
  id: string;
  name: string;
  total: number;
  due: number;
}
interface Card {
  id: string;
  front: string;
  back: string;
}

const GRADES = [
  { grade: 1, label: "Otra vez" },
  { grade: 3, label: "Difícil" },
  { grade: 4, label: "Bien" },
  { grade: 5, label: "Fácil" },
];

export function FlashcardReview({ decks }: { decks: Deck[] }) {
  const router = useRouter();
  const [queue, setQueue] = useState<Card[] | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState(0);

  async function start(deckId: string) {
    try {
      setQueue(await api<Card[]>(`/api/ai/flashcards/due?deckId=${deckId}&limit=50`));
      setFlipped(false);
      setDone(0);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function grade(g: number) {
    if (!queue?.length) return;
    const [card, ...rest] = queue;
    try {
      await api(`/api/ai/flashcards/${card.id}/review`, { body: { grade: g } });
      setQueue(rest);
      setFlipped(false);
      setDone((d) => d + 1);
      if (!rest.length) router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (queue) {
    const card = queue[0];
    return (
      <div className="grid gap-3">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {done} repasadas · {queue.length} pendientes
          </span>
          <Button variant="ghost" size="sm" onClick={() => setQueue(null)}>
            Salir
          </Button>
        </div>
        {card ? (
          <>
            <button
              type="button"
              onClick={() => setFlipped((f) => !f)}
              className="grid min-h-56 place-items-center rounded-xl border bg-card p-6 text-center text-lg shadow-sm"
              aria-label={flipped ? "Respuesta (pulsa para ver la pregunta)" : "Pregunta (pulsa para ver la respuesta)"}
            >
              <div>
                <div className="mb-2 text-xs tracking-wide text-muted-foreground uppercase">{flipped ? "Respuesta" : "Pregunta"}</div>
                <p className="whitespace-pre-wrap">{flipped ? card.back : card.front}</p>
              </div>
            </button>
            {flipped ? (
              <div className="grid grid-cols-4 gap-2">
                {GRADES.map((g) => (
                  <Button key={g.grade} variant={g.grade === 1 ? "outline" : "secondary"} className="h-12" onClick={() => grade(g.grade)}>
                    {g.label}
                  </Button>
                ))}
              </div>
            ) : (
              <Button className="h-12" onClick={() => setFlipped(true)}>
                Mostrar respuesta
              </Button>
            )}
          </>
        ) : (
          <p className="text-sm">¡Mazo al día! 🎉</p>
        )}
      </div>
    );
  }

  return decks.length ? (
    <ul className="grid gap-2">
      {decks.map((d) => (
        <li key={d.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
          <div className="min-w-0">
            <div className="truncate font-medium">{d.name}</div>
            <div className="text-xs text-muted-foreground">
              {d.total} tarjetas · {d.due} para hoy
            </div>
          </div>
          <Button size="sm" disabled={!d.due} onClick={() => start(d.id)}>
            Repasar
          </Button>
        </li>
      ))}
    </ul>
  ) : (
    <p className="text-sm text-muted-foreground">Genera flashcards desde tus apuntes.</p>
  );
}
