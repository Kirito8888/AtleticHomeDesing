"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Field } from "@/components/form/chips";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/client-api";
import { examScore } from "@/lib/study/mock-exam";

type Card = { id: string; front: string; back: string };

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** v1.8 · Examen simulado: tarjetas al azar, tiempo límite y autoevaluación. */
export function MockExam({ decks }: { decks: Array<{ id: string; name: string; total: number }> }) {
  const [deckId, setDeckId] = useState(decks[0]?.id ?? "");
  const [count, setCount] = useState(10);
  const [minutes, setMinutes] = useState(10);
  const [cards, setCards] = useState<Card[] | null>(null);
  const [i, setI] = useState(0);
  const [shown, setShown] = useState(false);
  const [failed, setFailed] = useState<Card[]>([]);
  const [left, setLeft] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!cards || done) return;
    const t = setInterval(() => setLeft((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(t);
  }, [cards, done]);
  useEffect(() => {
    if (cards && !done && left === 0) finish(failed, i);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al agotarse el tiempo
  }, [left]);

  async function start() {
    try {
      const r = await api<{ cards: Card[] }>("/api/study/mock-exam", { body: { deckId, count } });
      setCards(r.cards);
      setI(0);
      setShown(false);
      setFailed([]);
      setDone(false);
      setLeft(minutes * 60);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function finish(f: Card[], answered: number) {
    if (!cards) return;
    // Lo que quedó sin responder cuenta como fallo
    const all = [...f, ...cards.slice(answered)];
    setFailed(all);
    setDone(true);
    if (all.length) await api("/api/study/mock-exam", { method: "PUT", body: { deckId, failed: all.map((c) => c.id) } }).catch(() => undefined);
  }

  function answer(ok: boolean) {
    if (!cards) return;
    const f = ok ? failed : [...failed, cards[i]];
    setFailed(f);
    setShown(false);
    if (i + 1 >= cards.length) void finish(f, i + 1);
    else setI(i + 1);
  }

  if (!decks.length) return <p className="text-sm text-muted-foreground">Crea antes un mazo de flashcards (Estudio → Flashcards).</p>;

  if (cards && done) {
    const { score, passed } = examScore(cards.length - failed.length, cards.length);
    return (
      <div className="grid gap-3 text-sm" role="status" aria-label="Resultado del examen">
        <p className="text-3xl font-semibold tabular-nums">{score.toLocaleString("es-ES")} / 10</p>
        <p>
          {passed ? "Aprobado" : "Suspenso"} · {cards.length - failed.length} de {cards.length} bien
        </p>
        {failed.length ? (
          <>
            <p className="text-muted-foreground">Estas vuelven hoy al repaso de flashcards:</p>
            <ul className="grid gap-1" aria-label="Tarjetas falladas">
              {failed.map((c) => (
                <li key={c.id} className="rounded border p-2">
                  <span className="font-medium">{c.front}</span>
                  <span className="block text-muted-foreground">{c.back}</span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
        <Button type="button" onClick={() => setCards(null)} className="justify-self-start">
          Otro examen
        </Button>
      </div>
    );
  }

  if (cards) {
    const c = cards[i];
    return (
      <div className="grid gap-3 text-sm">
        <div className="flex justify-between text-muted-foreground">
          <span>
            Pregunta {i + 1} de {cards.length}
          </span>
          <span aria-label="Tiempo restante" className={left < 60 ? "font-semibold text-destructive tabular-nums" : "tabular-nums"}>
            {mmss(left)}
          </span>
        </div>
        <p className="rounded-md border p-4 text-base font-medium">{c.front}</p>
        {shown ? (
          <>
            <p className="rounded-md bg-muted p-4">{c.back}</p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => answer(false)}>
                La fallé
              </Button>
              <Button type="button" onClick={() => answer(true)}>
                La sabía
              </Button>
            </div>
          </>
        ) : (
          <Button type="button" onClick={() => setShown(true)} className="justify-self-start">
            Ver respuesta
          </Button>
        )}
        <Button type="button" variant="ghost" className="justify-self-start" onClick={() => finish(failed, i)}>
          Entregar ya
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-3 text-sm">
      <Field label="Mazo" htmlFor="exam-deck">
        <Select id="exam-deck" value={deckId} onChange={(e) => setDeckId(e.target.value)}>
          {decks.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name} ({d.total})
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Preguntas" htmlFor="exam-n">
          <Select id="exam-n" value={String(count)} onChange={(e) => setCount(Number(e.target.value))}>
            {[5, 10, 20, 30].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Minutos" htmlFor="exam-min">
          <Select id="exam-min" value={String(minutes)} onChange={(e) => setMinutes(Number(e.target.value))}>
            {[5, 10, 20, 30, 60].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Button type="button" onClick={start} disabled={!deckId} className="justify-self-start">
        Empezar examen
      </Button>
    </div>
  );
}
