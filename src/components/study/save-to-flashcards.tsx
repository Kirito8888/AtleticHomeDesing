"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Layers } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client-api";

export type CardSource = { kind: "adapt"; content: unknown } | { kind: "pack"; topicId: string };
interface Preview {
  deck: string;
  isNew: boolean;
  create: number;
  duplicates: number;
}
const OTHER = "__other__";

/**
 * v2.8 · N2 · «Crear flashcards»: elige el mazo (propio o uno nuevo con nombre sugerido), previsualiza cuántas se crean y cuántas
 * se descartan por duplicadas, y solo tras confirmar escribe. `suggested` = nombres de mazo vinculados (asignatura, título).
 */
export function SaveToFlashcards({ source, suggested, subject, label = "Crear flashcards", testId = "cards-open" }: { source: CardSource; suggested: string[]; subject?: string | null; label?: string; testId?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [owned, setOwned] = useState<string[]>([]);
  const names = Array.from(new Set(suggested.map((s) => s.trim().slice(0, 60)).filter(Boolean)));
  const [choice, setChoice] = useState(names[0] ?? OTHER);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    api<Array<{ name: string; shared: boolean }>>("/api/ai/flashcards/decks")
      .then((d) => setOwned(d.filter((x) => !x.shared).map((x) => x.name)))
      .catch(() => setOwned([]));
  }, [open]);

  const deck = (choice === OTHER ? custom : choice).trim();
  const options = [...owned, ...names.filter((n) => !owned.includes(n))];

  async function review() {
    setBusy(true);
    try {
      const body = { deck, subject: subject ?? null, source };
      const p = await api<Preview>("/api/study/cards/import", { body: { ...body, dryRun: true } });
      if (!p.create) {
        toast.message(`Todas las tarjetas (${p.duplicates}) ya están en «${deck}»`);
        return;
      }
      const ok = await confirmDialog({
        title: `¿Crear ${p.create} ${p.create === 1 ? "flashcard" : "flashcards"} en «${deck}»?`,
        description: `${p.create} ${p.create === 1 ? "nueva" : "nuevas"} · ${p.duplicates} ${p.duplicates === 1 ? "se descarta" : "se descartan"} por duplicadas. ${p.isNew ? "El mazo se crea ahora. " : ""}Las verás en Flashcards.`,
        confirmLabel: "Crear",
      });
      if (!ok) return;
      const r = await api<{ added: number }>("/api/study/cards/import", { body });
      toast.success(`${r.added} flashcards creadas en «${deck}»`);
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!open)
    return (
      <Button type="button" variant="outline" className="min-h-11" onClick={() => setOpen(true)} data-testid={testId}>
        <Layers /> {label}
      </Button>
    );
  return (
    <div className="grid min-w-0 max-w-full gap-2 rounded-md border p-3" data-testid="cards-form">
      <label htmlFor={`${testId}-deck`} className="text-sm font-medium">Mazo de destino</label>
      <select id={`${testId}-deck`} className="min-h-11 w-full min-w-0 truncate rounded-md border bg-background px-2 text-base" value={choice} onChange={(e) => setChoice(e.target.value)}>
        {options.map((n) => (
          <option key={n} value={n}>{owned.includes(n) ? n : `Nuevo: ${n}`}</option>
        ))}
        <option value={OTHER}>Otro nombre…</option>
      </select>
      {choice === OTHER ? <Input aria-label="Nombre del mazo" className="w-full min-w-0" maxLength={60} value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Nombre del mazo" /> : null}
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" className="min-h-11" disabled={busy || !deck} onClick={review} data-testid="cards-review">
          Revisar
        </Button>
        <Button type="button" variant="ghost" className="min-h-11" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">No se crea nada hasta que confirmes; las que ya existan en el mazo se omiten.</p>
    </div>
  );
}
