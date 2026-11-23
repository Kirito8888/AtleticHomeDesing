"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { AppleImport } from "@/components/recovery/apple-import";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { api } from "@/lib/client-api";
import { formatDateTime } from "@/lib/format";

type Delivery = {
  lastAt: string | null;
  lastStatus: number | null;
  lastSummary: { counts?: Record<string, number>; fields?: string[]; reason?: string } | null;
  testAt: string | null;
  testStatus: number | null;
  testSummary: { counts?: Record<string, number>; fields?: string[]; reason?: string } | null;
};
type Deliveries = { FITNESS: Delivery; HEALTH: Delivery };
type Status = { active: boolean; createdAt: string | null; lastUsedAt: string | null; deliveries?: Deliveries };
type TestResult = { ok: boolean; fitness: { ok: boolean; checks: { label: string; ok: boolean }[] }; health: { ok: boolean; checks: { label: string; ok: boolean }[] } };

const REASON: Record<string, string> = {
  second_factor: "Falta activar la verificación en dos pasos",
  rate_limit: "Demasiados envíos seguidos",
  json: "El cuerpo no era JSON válido",
  prueba_incoherente: "La prueba no dio lo esperado",
  error_interno: "Error del servidor",
};
const COUNT_LABEL: Record<string, string> = { received: "recibidos", added: "añadidos", duplicates: "repetidos", days: "días", saved: "guardados", unchanged: "sin cambios", conflicts: "avisos", checks: "comprobaciones" };

/** Resultado en texto llano, sin valores de salud: solo recuentos o nombres de campo. */
export function describeDelivery(status: number | null, s: Delivery["lastSummary"]): string {
  if (status == null) return "Sin envíos todavía";
  if (status === 200) {
    const parts = Object.entries(s?.counts ?? {}).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${COUNT_LABEL[k] ?? k}`);
    return `Correcto${parts.length ? ` · ${parts.join(", ")}` : ""}`;
  }
  if (status === 400 && s?.fields?.length) return `Datos rechazados: ${s.fields.join(", ")}`;
  return `Error ${status}${s?.reason ? ` · ${REASON[s.reason] ?? s.reason}` : ""}`;
}

/** Plantilla del cuerpo (las fechas llevan zona horaria; la duración sale de start/end, o añade `durationMin`/`durationSec`). */
export const APPLE_TEMPLATE = `{
  "type": "Correr",
  "start": "2026-11-21T08:30:00+01:00",
  "end": "2026-11-21T09:15:00+01:00",
  "distance": "7,2 km",
  "energyKj": "2008 kJ",
  "hrAvg": 148,
  "hrMax": 171
}`;

export const HEALTH_TEMPLATE = `{
  "sleepStart": "2026-11-21T23:40:00",
  "sleepEnd": "2026-11-22T07:10:00",
  "hrvSdnnMs": 48,
  "restingHr": 52,
  "weightKg": "62,3 kg"
}`;

const HEALTH_STEPS = [
  "En Atajos → Automatización → «Nueva automatización personal» → «Hora del día» (p. ej. 09:00, a diario) → «Ejecutar inmediatamente».",
  "Añade «Encontrar muestras de Salud» para cada métrica (Sueño, Variabilidad de la frecuencia cardiaca, FC en reposo, Peso) con «Inicio: hoy» y «Último».",
  "Para el sueño suma las muestras «Dormido» (o usa minutos: sleepMin) del día.",
  "Añade «Obtener contenido de URL» con la URL de envío de arriba, método POST, cuerpo JSON como la plantilla y el encabezado Authorization: Bearer + tu token.",
  "Ejecútala una vez a mano: lo vacío o igual se guarda solo; si algo difiere de lo que anotaste, verás un aviso en Recuperación.",
];

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
  const [pasted, setPasted] = useState("");
  const [result, setResult] = useState<TestResult | null>(null);

  const load = useCallback(async () => {
    try {
      setStatus(await api<Status>("/api/settings/apple-fitness/token"));
    } catch {
      setStatus({ active: false, createdAt: null, lastUsedAt: null, deliveries: undefined });
    }
  }, []);
  // La página puede venir de una copia local: se pide el estado vivo (sin tocar lo que hay si falla la red)
  useEffect(() => {
    api<Status>("/api/settings/apple-fitness/token").then(setStatus, () => undefined);
  }, []);
  const when = (iso: string | null) => (iso ? formatDateTime(iso, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "nunca");
  // Antes de generar, la ruta relativa basta para la guía; con el token se da la URL completa
  const healthUrl = `${baseUrl || "https://TU_ATLENZA"}/api/recovery/apple-health`;
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
      <div className="grid gap-2 rounded-md border p-3" data-testid="apple-diag">
        <p className="font-medium">Diagnóstico de conexión</p>
        {(["FITNESS", "HEALTH"] as const).map((c) => {
          const d = status?.deliveries?.[c];
          return (
            <div key={c} className="grid gap-0.5" data-testid={`apple-diag-${c.toLowerCase()}`}>
              <p className="font-medium">{c === "FITNESS" ? "Entrenos" : "Salud"}</p>
              <p data-testid="apple-diag-last">
                Último envío: {when(d?.lastAt ?? null)} · {describeDelivery(d?.lastStatus ?? null, d?.lastSummary ?? null)}
              </p>
              <p className="text-xs text-muted-foreground" data-testid="apple-diag-test">
                Última prueba: {d?.testAt ? `${when(d.testAt)} · ${describeDelivery(d.testStatus, d.testSummary)}` : "ninguna"}
              </p>
            </div>
          );
        })}
        <label className="grid gap-1">
          <span className="text-xs text-muted-foreground">{fresh ? "Se usará el token recién generado" : "Pega tu token (solo se compara con el tuyo; no se guarda)"}</span>
          {fresh ? null : (
            <input
              type="password"
              autoComplete="off"
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              data-testid="apple-test-token"
              className="min-h-11 rounded-md border bg-background px-3"
            />
          )}
        </label>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-11 justify-self-start"
          data-testid="apple-test"
          disabled={busy || !(fresh?.token || pasted.trim())}
          onClick={async () => {
            setBusy(true);
            try {
              setResult(await api<TestResult>("/api/settings/apple-fitness/test", { method: "POST", body: { token: fresh?.token ?? pasted.trim() } }));
              setPasted("");
              await load();
            } catch (e) {
              setResult(null);
              toast.error((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Probar envío
        </Button>
        {result ? (
          <div role="status" className="grid gap-1" data-testid="apple-test-result">
            <p className="font-medium">{result.ok ? "La prueba ha ido bien: no se ha guardado ningún dato." : "La prueba ha fallado en algún punto."}</p>
            {(["fitness", "health"] as const).map((k) => (
              <ul key={k} className="ml-4 list-disc text-xs">
                {result[k].checks.map((x) => (
                  <li key={x.label}>
                    {x.ok ? "✓" : "✗"} {k === "fitness" ? "Entrenos" : "Salud"}: {x.label}
                  </li>
                ))}
              </ul>
            ))}
          </div>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Para probar el propio Atajo sin guardar nada, añade <code>?dryRun=1</code> a la URL de envío: responde con lo que ha entendido (día de Madrid, deporte y unidades).
        </p>
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
          Admite números con coma y unidades («7,2 km», «2008 kJ», «1 h 5 min», «148 lpm»); si falta la zona horaria, se toma la de Madrid. También vale <code>duration</code>, <code>durationMin</code> o <code>durationSec</code> en lugar de <code>end</code>, <code>distanceM</code> en metros, o varios entrenos en <code>{`{"workouts": [...]}`}</code> (máx. 50). Reenviar el mismo entreno no lo duplica.
        </p>
      </details>
      <details className="rounded-md border p-3" data-testid="apple-file-import">
        <summary className="min-h-11 cursor-pointer py-2 font-medium">Sin Atajos: importar desde el archivo export.xml de Salud</summary>
        <div className="mt-2">
          <AppleImport />
        </div>
      </details>
      <details className="rounded-md border p-3" data-testid="health-settings">
        <summary className="min-h-11 cursor-pointer py-2 font-medium">Apple Salud · métricas diarias (sueño, VFC, FC en reposo, peso)</summary>
        <p className="mt-2">Mismo token. URL de envío:</p>
        <code className="[overflow-wrap:anywhere] mt-1 block rounded bg-muted p-2 text-xs">{healthUrl}</code>
        <Button type="button" variant="outline" size="sm" className="mt-2 min-h-11" onClick={() => copy(healthUrl, "URL")}>
          Copiar URL
        </Button>
        <ol className="ml-5 mt-3 list-decimal space-y-1.5">
          {HEALTH_STEPS.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ol>
        <p className="mt-3 font-medium">Plantilla JSON diaria</p>
        <pre className="mt-1 max-w-full overflow-x-auto rounded bg-muted p-2 text-xs">{HEALTH_TEMPLATE}</pre>
        <Button type="button" variant="outline" size="sm" className="mt-2 min-h-11" onClick={() => copy(HEALTH_TEMPLATE, "Plantilla")}>
          Copiar plantilla
        </Button>
        <p className="mt-2 text-xs text-muted-foreground">
          Pon <code>date</code> o <code>sleepEnd</code> (el sueño cuenta para el día en que te despiertas) y al menos una métrica; admite unidades («7 h 32 min», «62,3 kg», «52 lpm»). Varios días en <code>{`{"days": [...]}`}</code> (máx. 14). Reenviar no duplica nada. Un valor vacío o igual al tuyo se guarda solo; si difiere de uno que anotaste tú, no se pisa y eliges en Recuperación. La VFC de Apple es SDNN: se guarda aparte de tu rMSSD. Peso, sueño y VFC no van a la IA ni a tu entrenador/a.
        </p>
      </details>
      <p className="text-xs text-muted-foreground">
        Los entrenos llegan como borradores: tú decides si completan una sesión tuya, se crean aparte o se descartan. Lo que crees aparte solo lo ves tú (no va a la IA ni a tu entrenador/a), igual que Strava. Si completas una sesión tuya con los datos del reloj, pasa a ser tuya como cualquier otra.
      </p>
    </div>
  );
}
