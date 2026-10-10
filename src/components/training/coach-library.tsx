"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/client-api";

/** v1.8 · Plantillas que tu entrenadora ha compartido: «Copiar» las añade a las tuyas. */
export function CoachLibrary({ templates }: { templates: Array<{ id: string; name: string; coach: string }> }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  if (!templates.length) return null;
  return (
    <section aria-label="De tu entrenadora" className="mb-4 grid gap-1.5 text-sm">
      <h2 className="text-xs font-medium text-muted-foreground">De tu entrenadora</h2>
      <ul className="flex flex-wrap gap-1.5">
        {templates.map((t) => (
          <li key={t.id} className="inline-flex items-center gap-1 rounded-full border py-1 pr-1 pl-3 text-xs">
            <span className="font-medium">{t.name}</span>
            <span className="text-muted-foreground">· {t.coach}</span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs"
              disabled={busy === t.id}
              aria-label={`Copiar ${t.name}`}
              onClick={async () => {
                setBusy(t.id);
                try {
                  const r = await api<{ id: string; name: string }>(`/api/training/templates/${t.id}/copy`, { method: "POST" });
                  toast.success(`Copiada como «${r.name}»`);
                  router.push(`/training/new?template=${r.id}`);
                  router.refresh();
                } catch (e) {
                  toast.error((e as Error).message);
                } finally {
                  setBusy(null);
                }
              }}
            >
              Copiar
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Para cuentas de entrenador: compartir cada plantilla con sus atletas. */
export function ShareTemplates({ templates }: { templates: Array<{ id: string; name: string; shared: boolean }> }) {
  const router = useRouter();
  if (!templates.length) return null;
  return (
    <details className="mb-4 rounded-md border p-3 text-sm">
      <summary className="cursor-pointer font-medium">Compartir plantillas con tus atletas</summary>
      <ul className="mt-2 grid gap-1">
        {templates.map((t) => (
          <li key={t.id}>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="size-4"
                checked={t.shared}
                onChange={async () => {
                  try {
                    await api(`/api/training/templates/${t.id}`, { method: "PATCH", body: { shared: !t.shared } });
                    toast.success(t.shared ? `«${t.name}» ya no se comparte` : `«${t.name}» compartida`);
                    router.refresh();
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }}
              />
              {t.name}
            </label>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">La ven los atletas que te han dado acceso a sus sesiones.</p>
    </details>
  );
}
