"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client-api";
import { MANAGED_NOTICE } from "@/lib/managed/rules";

export interface FichaData {
  id: string;
  alias: string;
  category: string | null;
  discipline: string | null;
  group: string | null;
  notes: string | null;
  archived: boolean;
}

/** Editar los datos de la ficha y archivarla o reactivarla. Solo alias, categoría, disciplina, grupo y notas. */
export function FichaEdit({ f }: { f: FichaData }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [v, setV] = useState({ alias: f.alias, category: f.category ?? "", discipline: f.discipline ?? "", group: f.group ?? "", notes: f.notes ?? "" });
  const patch = async (body: Record<string, unknown>, ok: string) => {
    setBusy(true);
    try {
      await api(`/api/coach/athletes/${f.id}`, { method: "PATCH", body });
      toast.success(ok);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const nul = (s: string) => (s.trim() ? s : null);
  return (
    <div className="grid gap-3 text-sm">
      <p className="text-xs text-muted-foreground">{MANAGED_NOTICE}</p>
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void patch({ alias: v.alias, category: nul(v.category), discipline: nul(v.discipline), group: nul(v.group), notes: nul(v.notes) }, "Ficha guardada");
        }}
      >
        <label className="grid gap-1">
          Alias
          <Input value={v.alias} onChange={(e) => setV({ ...v, alias: e.target.value })} required maxLength={40} className="h-11" />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="grid gap-1">
            Categoría
            <Input value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })} maxLength={40} className="h-11" />
          </label>
          <label className="grid gap-1">
            Grupo
            <Input value={v.group} onChange={(e) => setV({ ...v, group: e.target.value })} maxLength={40} className="h-11" />
          </label>
        </div>
        <label className="grid gap-1">
          Disciplina
          <Input value={v.discipline} onChange={(e) => setV({ ...v, discipline: e.target.value })} maxLength={60} className="h-11" />
        </label>
        <label className="grid gap-1">
          Notas
          <textarea value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} maxLength={2000} rows={3} className="rounded-md border bg-background p-2" />
        </label>
        <Button type="submit" variant="outline" disabled={busy} className="h-11">
          Guardar datos
        </Button>
      </form>
      <Button type="button" variant="outline" disabled={busy} className="h-11" data-testid="ficha-archive" onClick={() => void patch({ archived: !f.archived }, f.archived ? "Ficha reactivada" : "Ficha archivada")}>
        {f.archived ? "Reactivar ficha" : "Archivar ficha"}
      </Button>
      {f.archived ? <p className="text-xs text-muted-foreground">Archivada: solo lectura, no sale en «Planificar varios».</p> : null}
    </div>
  );
}
