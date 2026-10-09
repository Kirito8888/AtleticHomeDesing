"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Field } from "@/components/form/chips";
import { Stepper } from "@/components/form/stepper";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client-api";

/** Salud ósea: fracturas de estrés previas y raciones de calcio al día (cifrado). */
export function BoneForm({ today, initial }: { today: string; initial: { stressFractures: number; calciumServings: number } | null }) {
  const router = useRouter();
  const [f, setF] = useState(initial ?? { stressFractures: 0, calciumServings: 2 });
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      await api("/api/health/women/log", { body: { kind: "BONE", date: today, ...f } });
      toast.success("Cribado óseo guardado");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Fracturas de estrés que has tenido">
          <Stepper label="Fracturas de estrés previas" value={f.stressFractures} onChange={(v) => setF({ ...f, stressFractures: v ?? 0 })} min={0} max={20} />
        </Field>
        <Field label="Raciones de calcio al día" hint="1 = un vaso de leche, 2 yogures, 40 g de queso…">
          <Stepper label="Raciones de calcio al día" value={f.calciumServings} onChange={(v) => setF({ ...f, calciumServings: v ?? 0 })} min={0} max={10} />
        </Field>
      </div>
      <Button type="button" variant="outline" disabled={busy} onClick={save}>
        Guardar cribado óseo
      </Button>
    </div>
  );
}

type Active = { id: string; expiresAt: string };

/** Enlace temporal (7 días, revocable) para la médica o el fisio. */
export function HealthReportLinks({ kind, active, label }: { kind: "MEDICAL" | "PHYSIO"; active: Active[]; label: string }) {
  const router = useRouter();
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function create() {
    setBusy(true);
    try {
      const r = await api<{ url: string }>("/api/health/reports", { body: { kind } });
      setUrl(r.url);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function share() {
    if (!url) return;
    try {
      if (navigator.share) await navigator.share({ title: label, url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success("Enlace copiado");
      }
    } catch {
      // cancelado
    }
  }
  return (
    <div className="grid gap-3 text-sm">
      <Button type="button" variant="outline" disabled={busy} onClick={create}>
        Crear enlace para {label.toLowerCase()}
      </Button>
      {url ? (
        <div className="grid gap-2 rounded-md border p-2">
          <input readOnly aria-label="Enlace creado" value={url} className="w-full min-w-0 truncate rounded border bg-muted px-2 py-1 text-xs" onFocus={(e) => e.currentTarget.select()} />
          <Button type="button" size="sm" onClick={share}>
            Compartir
          </Button>
          <p className="text-xs text-muted-foreground">Solo se muestra ahora. Caduca en 7 días.</p>
        </div>
      ) : null}
      {active.length ? (
        <ul className="grid gap-1 text-xs" aria-label={`Enlaces activos para ${label.toLowerCase()}`}>
          {active.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2">
              <span>Activo hasta el {new Date(a.expiresAt).toLocaleDateString("es-ES")}</span>
              <button
                type="button"
                className="text-destructive underline-offset-2 hover:underline"
                onClick={async () => {
                  try {
                    await api(`/api/health/reports/${a.id}`, { method: "DELETE" });
                    toast.success("Enlace revocado");
                    router.refresh();
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }}
              >
                Revocar
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
