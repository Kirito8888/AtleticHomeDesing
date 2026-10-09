import type { ServerStatus } from "@/lib/admin/status";
import { cn } from "@/lib/utils";

const gb = (b: number) => `${(b / 1024 ** 3).toFixed(1)} GB`;
const mb = (b: number) => (b >= 1024 ** 3 ? gb(b) : `${Math.round(b / 1024 ** 2)} MB`);
const when = (iso: string) => new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }).format(new Date(iso));
const hoursAgo = (iso: string) => (Date.now() - Date.parse(iso)) / 3_600_000;

function Row({ label, value, bad = false }: { label: string; value: React.ReactNode; bad?: boolean }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-3 border-b py-1.5 last:border-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("min-w-0 text-right tabular-nums", bad && "font-medium text-destructive")}>{value}</dd>
    </div>
  );
}

/** «Estado del servidor» (solo admin): para comprobar que una actualización salió bien. */
export function ServerStatusView({ s }: { s: ServerStatus }) {
  const freePct = s.uploads ? Math.round((s.uploads.freeBytes / s.uploads.totalBytes) * 100) : null;
  const backupOld = !s.backup || !s.backup.lastOkAt || hoursAgo(s.backup.lastOkAt) > 48;
  const failedJobs = s.queue?.failed ?? 0;
  return (
    <dl className="grid text-sm" aria-label="Estado del servidor">
      <Row label="Versión" value={`v${s.version} · Node ${s.node} · arrancado hace ${Math.floor(s.uptimeSec / 3600)} h`} />
      <Row label="Base de datos" value={s.db.ok ? `OK (${s.db.latencyMs} ms${s.db.sizeBytes != null ? ` · ${mb(s.db.sizeBytes)}` : ""}${s.db.pgvector ? ` · pgvector ${s.db.pgvector}` : ""})` : "Sin conexión"} bad={!s.db.ok} />
      <Row
        label="Migraciones"
        value={
          s.migrations
            ? s.migrations.failed.length
              ? `Fallida: ${s.migrations.failed.join(", ")}`
              : `${s.migrations.applied} aplicadas · última ${s.migrations.last?.name ?? "—"}`
            : "No se pudo leer"
        }
        bad={!s.migrations || s.migrations.failed.length > 0}
      />
      <Row
        label="Cola de trabajos"
        value={s.queue ? (Object.keys(s.queue).length ? Object.entries(s.queue).map(([k, n]) => `${k} ${n}`).join(" · ") : "vacía") : "aún sin crear (se crea al subir apuntes)"}
        bad={failedJobs > 0}
      />
      <Row
        label="Planificador"
        value={s.scheduler.enabled ? (s.scheduler.lastTick ? `activo · última pasada ${when(s.scheduler.lastTick)}` : "activo · primera pasada al minuto de arrancar") : "desactivado (SCHEDULER_ENABLED=false)"}
        bad={s.scheduler.enabled && s.scheduler.lastTick != null && hoursAgo(s.scheduler.lastTick) > 2}
      />
      <Row label="Espacio de subidas" value={s.uploads ? `${gb(s.uploads.freeBytes)} libres de ${gb(s.uploads.totalBytes)} (${freePct} %)` : "No se pudo leer UPLOAD_DIR"} bad={freePct != null && freePct < 10} />
      <Row
        label="Última copia"
        value={
          s.backup
            ? `${s.backup.ok ? "OK" : "FALLÓ"} · ${when(s.backup.at)}${s.backup.lastOkAt && !s.backup.ok ? ` · última buena ${when(s.backup.lastOkAt)}` : ""}`
            : "Sin registro (¿está activo el servicio backup?)"
        }
        bad={backupOld || (s.backup != null && !s.backup.ok)}
      />
    </dl>
  );
}

