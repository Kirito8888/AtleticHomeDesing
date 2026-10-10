"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/client-api";

/** v1.8 · Poner categoría a un movimiento sin ella, con «aplicar a los parecidos» (aprende la regla). */
export function CategorizeTx({ id, description, categories }: { id: string; description: string; categories: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [cat, setCat] = useState("");
  const [similar, setSimilar] = useState(true);
  const [busy, setBusy] = useState(false);
  if (!open) {
    return (
      <button type="button" className="text-xs underline underline-offset-2" onClick={() => setOpen(true)} aria-label={`Categorizar ${description}`}>
        Sin categoría
      </button>
    );
  }
  return (
    <span className="mt-1 flex flex-wrap items-center gap-2">
      <span className="w-40">
        <Select aria-label={`Categoría de ${description}`} value={cat} onChange={(e) => setCat(e.target.value)} className="h-8">
          <option value="">Elige…</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </span>
      <label className="flex items-center gap-1 text-xs">
        <input type="checkbox" className="size-3.5" checked={similar} onChange={() => setSimilar(!similar)} /> Aplicar a los parecidos
      </label>
      <Button
        type="button"
        size="sm"
        className="h-8"
        disabled={!cat || busy}
        onClick={async () => {
          setBusy(true);
          try {
            const r = await api<{ pattern: string | null; applied: number }>(`/api/finance/transactions/${id}/category`, { method: "PUT", body: { categoryId: cat, similar } });
            toast.success(r.pattern ? `Regla «${r.pattern}» guardada · ${r.applied} movimiento${r.applied === 1 ? "" : "s"}` : "Categoría guardada");
            router.refresh();
          } catch (e) {
            toast.error((e as Error).message);
            setBusy(false);
          }
        }}
      >
        Guardar
      </Button>
    </span>
  );
}

/** Reglas aprendidas, con borrar. */
export function CategoryRules({ rules }: { rules: Array<{ id: string; pattern: string; category: string }> }) {
  const router = useRouter();
  return (
    <ul className="grid gap-1 text-sm" aria-label="Reglas de categoría">
      {rules.map((r) => (
        <li key={r.id} className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate">
            «{r.pattern}» → {r.category}
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label={`Borrar la regla ${r.pattern}`}
            onClick={async () => {
              try {
                await api(`/api/finance/category-rules/${r.id}`, { method: "DELETE" });
                router.refresh();
              } catch (e) {
                toast.error((e as Error).message);
              }
            }}
          >
            Borrar
          </Button>
        </li>
      ))}
    </ul>
  );
}
