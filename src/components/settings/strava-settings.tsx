"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/client-api";

type Status = { configured: boolean; connected: boolean; connectedAt: string | null; lastSyncAt: string | null; lastError: string | null; sessions: number };

const RESULT: Record<string, string> = {
  ok: "Strava conectado: se han importado tus actividades recientes.",
  denied: "Has cancelado la conexión con Strava.",
  scope: "Hace falta el permiso de leer tus actividades para importarlas.",
  taken: "Esa cuenta de Strava ya está conectada a otra cuenta de Atlenza.",
};

/** v1.10 · Conectar Strava (OAuth): las actividades nuevas se importan solas cada hora. */
export function StravaSettings({ status, result }: { status: Status; result?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (!status.configured) return <p className="text-sm text-muted-foreground">Strava no está activado en este servidor (lo configura la administración).</p>;
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
  return (
    <div className="grid gap-3 text-sm">
      {result && RESULT[result] ? <p role="status" className="rounded-md border p-2">{RESULT[result]}</p> : null}
      {status.connected ? (
        <>
          <p>
            Conectado desde el {when(status.connectedAt)} · {status.sessions} sesiones importadas · última revisión {when(status.lastSyncAt)}
          </p>
          {status.lastError ? <p className="text-destructive">{status.lastError}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const r = await api<{ imported: number }>("/api/strava/sync", { method: "POST" });
                  toast.success(r.imported ? `${r.imported} actividades nuevas` : "No hay actividades nuevas");
                  router.refresh();
                } catch (e) {
                  toast.error((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Importar ahora
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={async () => {
                if (!confirm("¿Desconectar Strava?")) return;
                const del = confirm(`¿Borrar también las ${status.sessions} sesiones importadas de Strava? (Cancelar = conservarlas)`);
                setBusy(true);
                try {
                  await api(`/api/strava${del ? "?deleteSessions=1" : ""}`, { method: "DELETE" });
                  toast.success("Strava desconectado");
                  router.refresh();
                } catch (e) {
                  toast.error((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Desconectar
            </Button>
          </div>
        </>
      ) : (
        <a href="/api/strava/connect" className="justify-self-start rounded-md bg-[#FC4C02] px-3 py-2 font-medium text-white">
          Conectar con Strava
        </a>
      )}
      <p className="text-xs text-muted-foreground">
        Por las condiciones de Strava, lo que importes de allí solo lo ves tú: no se envía a la IA ni lo ve tu entrenador/a (la carga acumulada que la incluye tampoco va a la IA). Puedes revocar el permiso también en strava.com → Ajustes → Mis aplicaciones.
      </p>
    </div>
  );
}
