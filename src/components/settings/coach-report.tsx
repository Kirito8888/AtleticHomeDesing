"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Chips } from "@/components/form/chips";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client-api";

type Period = { key: string; label: string; from: string; to: string };
type Active = { id: string; from: string; to: string; includeInjuries: boolean; expiresAt: string };

/** Enlace de solo lectura (7 días) con planificado frente a hecho, lanzamientos, marcas y controles. */
export function CoachReport({ periods, active }: { periods: Period[]; active: Active[] }) {
  const router = useRouter();
  const [period, setPeriod] = useState(periods[0].key);
  const [injuries, setInjuries] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create() {
    const p = periods.find((x) => x.key === period)!;
    setBusy(true);
    try {
      const r = await api<{ url: string }>("/api/reports", { body: { from: p.from, to: p.to, includeInjuries: injuries } });
      setUrl(r.url);
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    try {
      await api(`/api/reports/${id}`, { method: "DELETE" });
      toast.success("Enlace revocado");
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function share() {
    if (!url) return;
    try {
      if (navigator.share) await navigator.share({ title: "Mi informe de entrenamiento", url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success("Enlace copiado");
      }
    } catch {
      // cancelado por el usuario
    }
  }

  return (
    <div className="grid gap-3 text-sm">
      <Chips label="Periodo del informe" options={periods.map((p) => ({ value: p.key, label: p.label }))} value={period} onChange={(v) => v && setPeriod(v)} />
      <label className="flex items-center gap-2">
        <input type="checkbox" className="size-4" checked={injuries} onChange={(e) => setInjuries(e.target.checked)} />
        Incluir mis molestias y lesiones
      </label>
      <p className="text-xs text-muted-foreground">Nunca incluye el ciclo menstrual, el peso, las notas ni la nutrición. El enlace caduca a los 7 días.</p>
      <Button type="button" onClick={create} disabled={busy}>
        Crear enlace del informe
      </Button>
      {url ? (
        <div className="grid gap-2">
          <Input aria-label="Enlace del informe" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
          <Button type="button" variant="outline" size="sm" onClick={share}>
            Compartir enlace
          </Button>
        </div>
      ) : null}
      {active.length ? (
        <ul className="grid gap-1" aria-label="Enlaces activos">
          {active.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs">
              <span>
                {a.from} → {a.to}
                {a.includeInjuries ? " · con molestias" : ""} · caduca {a.expiresAt}
              </span>
              <Button type="button" variant="ghost" size="sm" onClick={() => revoke(a.id)}>
                Revocar
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
