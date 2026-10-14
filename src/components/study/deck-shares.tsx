"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client-api";

interface Share {
  userId: string;
  name: string | null;
  email: string;
}

/** v2.0 C · La dueña gestiona quién puede ESTUDIAR el mazo (solo lectura; cada persona lleva su propio SM-2). */
export function DeckShares({ deckId }: { deckId: string }) {
  const router = useRouter();
  const [shares, setShares] = useState<Share[] | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const [tick, setTick] = useState(0);
  const load = () => setTick((t) => t + 1);
  useEffect(() => {
    let alive = true;
    api<Share[]>(`/api/ai/flashcards/decks/${deckId}/shares`)
      .then((d) => alive && setShares(d))
      .catch((e: Error) => toast.error(e.message));
    return () => {
      alive = false;
    };
  }, [deckId, tick]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/api/ai/flashcards/decks/${deckId}/shares`, { body: { email } });
      setEmail("");
      toast.success("Mazo compartido en solo lectura");
      load();
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(userId: string) {
    try {
      await api(`/api/ai/flashcards/decks/${deckId}/shares?userId=${userId}`, { method: "DELETE" });
      load();
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <div className="grid gap-3 rounded-lg border bg-muted/30 p-3" aria-label="Quién tiene acceso al mazo">
      <p className="text-xs text-muted-foreground">Pueden repasar el mazo, no editarlo. Cada persona lleva su propio progreso; tú no lo ves.</p>
      <form onSubmit={add} className="flex gap-2">
        <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email de la persona" aria-label="Email de la persona" className="h-10 min-w-0" />
        <Button type="submit" size="sm" className="h-10" disabled={busy}>
          Compartir
        </Button>
      </form>
      {shares === null ? null : shares.length ? (
        <ul className="grid gap-1">
          {shares.map((s) => (
            <li key={s.userId} className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate">{s.name ?? s.email}</span>
              <Button variant="ghost" size="sm" onClick={() => remove(s.userId)} aria-label={`Quitar acceso a ${s.name ?? s.email}`}>
                Quitar
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Aún no lo compartes con nadie.</p>
      )}
    </div>
  );
}
