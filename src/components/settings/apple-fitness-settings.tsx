"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { api } from "@/lib/client-api";
import { formatDateTime } from "@/lib/format";

type Status = { active: boolean; createdAt: string | null; lastUsedAt: string | null };

/** Plantilla del cuerpo (las fechas llevan zona horaria; la duración sale de start/end, o añade `durationMin`/`durationSec`). */
export const APPLE_TEMPLATE = `{
  "type": "Correr",
  "start": "2026-11-21T08:30:00+01:00",
  "end": "2026-11-21T09:15:00+01:00",
  "distanceKm": 7.2,
  "kcal": 480,
  "hrAvg": 148,
  "hrMax": 171
}`;

const STEPS = [
  "Genera el token aquí abajo y cópialo: solo se muestra una vez.",
  "En la app Atajos crea un atajo nuevo (p. ej. «Enviar entreno a Atlenza»).",
  "Añade «Buscar entrenamientos» (Salud): ordena por fecha de inicio, el más reciente primero, y límite 1.",
  "Añade «Obtener contenido de URL»: pega la URL de envío, método POST, cabecera Authorization = «Bearer » + tu token, y cuerpo JSON con la plantilla (arrastra las variables del entreno: tipo, inicio, fin, distancia, energía activa, frecuencia cardiaca).",
  "Prueba el atajo y mira /training: el entreno aparece como borrador, nunca entra solo en tu diario.",
  "Opcional: en Automatización, «Al terminar un entrenamiento» → ejecutar ese atajo.",
];

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copiado`);
  } catch {
    toast.error("No se pudo copiar: selecciónalo a mano");
  }
}

/** v3.1 · Token personal de envío + guía del Atajo de iOS para Apple Fitness (revocable). */
export function AppleFitnessSettings({ initial, baseUrl }: { initial: Status; baseUrl: string }) {
  const [status, setStatus] = useState<Status>(initial);
  const [fresh, setFresh] = useState<{ token: string; endpoint: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setStatus(await api<Status>("/api/settings/apple-fitness/token"));
    } catch {
      setStatus({ active: false, createdAt: null, lastUsedAt: null });
    }
  }, []);
  const when = (iso: string | null) => (iso ? formatDateTime(iso, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "nunca");
  // Antes de generar, la ruta relativa basta para la guía; con el token se da la URL completa
  const url = fresh?.endpoint ?? `${baseUrl || "https://TU_ATLENZA"}/api/training/apple-fitness`;

  return (
    <div className="grid gap-3 text-sm" data-testid="apple-settings">
      {status?.active ? (
        <p>
          Token activo desde el {when(status.createdAt)} · último envío: {when(status.lastUsedAt)}
        </p>
      ) : (
        <p className="text-muted-foreground">No hay token: genera uno para que el Atajo pueda enviar entrenos.</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          className="min-h-11"
          data-testid="apple-token-create"
          disabled={busy}
          onClick={async () => {
            if (status?.active && !(await confirmDialog({ title: "¿Generar un token nuevo?", description: "El anterior dejará de funcionar: tendrás que actualizar el Atajo.", confirmLabel: "Generar" }))) return;
            setBusy(true);
            try {
              setFresh(await api<{ token: string; endpoint: string }>("/api/settings/apple-fitness/token", { method: "POST" }));
              await load();
            } catch (e) {
              toast.error((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {status?.active ? "Generar token nuevo" : "Generar token"}
        </Button>
        {status?.active ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11"
            data-testid="apple-token-revoke"
            disabled={busy}
            onClick={async () => {
              if (!(await confirmDialog({ title: "¿Revocar el token?", description: "El Atajo dejará de poder enviar. Lo ya recibido se queda en la bandeja.", confirmLabel: "Revocar", destructive: true }))) return;
              setBusy(true);
              try {
                await api("/api/settings/apple-fitness/token", { method: "DELETE" });
                setFresh(null);
                await load();
                toast.success("Token revocado");
              } catch (e) {
                toast.error((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Revocar
          </Button>
        ) : null}
      </div>
      {fresh ? (
        <div role="status" className="grid gap-2 rounded-md border p-3" data-testid="apple-token-fresh">
          <p className="font-medium">Copia el token ahora: no se volverá a mostrar.</p>
          <code className="[overflow-wrap:anywhere] rounded bg-muted p-2 text-xs" data-testid="apple-token-value">
            {fresh.token}
          </code>
          <Button type="button" variant="outline" size="sm" className="min-h-11 justify-self-start" onClick={() => copy(fresh.token, "Token")}>
            Copiar token
          </Button>
        </div>
      ) : null}
      <div className="grid gap-1">
        <p className="font-medium">URL de envío</p>
        <code className="[overflow-wrap:anywhere] rounded bg-muted p-2 text-xs">{url}</code>
        <Button type="button" variant="outline" size="sm" className="min-h-11 justify-self-start" onClick={() => copy(url, "URL")}>
          Copiar URL
        </Button>
      </div>
      <details className="rounded-md border p-3">
        <summary className="min-h-11 cursor-pointer py-2 font-medium">Cómo configurar el Atajo (6 pasos)</summary>
        <ol className="ml-5 mt-2 list-decimal space-y-1.5">
          {STEPS.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        <p className="mt-3 font-medium">Plantilla JSON del cuerpo</p>
        <pre className="mt-1 max-w-full overflow-x-auto rounded bg-muted p-2 text-xs">{APPLE_TEMPLATE}</pre>
        <Button type="button" variant="outline" size="sm" className="mt-2 min-h-11" onClick={() => copy(APPLE_TEMPLATE, "Plantilla")}>
          Copiar plantilla
        </Button>
        <p className="mt-2 text-xs text-muted-foreground">
          También vale <code>durationMin</code> o <code>durationSec</code> en lugar de <code>end</code>, <code>distanceM</code> en metros, o varios entrenos en <code>{`{"workouts": [...]}`}</code> (máx. 50). Reenviar el mismo entreno no lo duplica.
        </p>
      </details>
      <p className="text-xs text-muted-foreground">
        Los entrenos llegan como borradores: tú decides si completan una sesión tuya, se crean aparte o se descartan. Lo que crees aparte solo lo ves tú (no va a la IA ni a tu entrenador/a), igual que Strava. Si completas una sesión tuya con los datos del reloj, pasa a ser tuya como cualquier otra.
      </p>
    </div>
  );
}
