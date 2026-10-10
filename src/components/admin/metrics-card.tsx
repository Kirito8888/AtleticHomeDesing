import type { metricsSummary } from "@/lib/admin/metrics";
import type { checkHealth } from "@/lib/admin/watch";

type Props = {
  metrics: ReturnType<typeof metricsSummary>;
  problems: Awaited<ReturnType<typeof checkHealth>>;
  process: { uptimeSec: number; rssMb: number; heapMb: number };
  db: { latencyMs: number | null; sizeMb: number | null; queue: Record<string, number> | null };
  telegram: boolean;
};

const fmtUptime = (s: number) => (s >= 86400 ? `${Math.floor(s / 86400)} d ${Math.floor((s % 86400) / 3600)} h` : `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`);

/** v1.9 · Métricas internas (sin servicios externos): vigilancia, proceso, BD y API en la última hora. */
export function MetricsCard({ metrics, problems, process: p, db, telegram }: Props) {
  return (
    <div className="grid gap-4 text-sm">
      <p role="status" aria-label="Vigilancia" className={problems.length ? "rounded-md border border-destructive/50 p-2 text-destructive" : "rounded-md border p-2"}>
        {problems.length ? problems.map((x) => x.text).join(" · ") : "Vigilancia: todo en orden."}{" "}
        <span className="text-muted-foreground">
          {telegram ? "Los avisos llegan por Telegram." : "Telegram sin configurar (TELEGRAM_BOT_TOKEN y TELEGRAM_ADMIN_CHAT_ID): los avisos solo se ven aquí."}
        </span>
      </p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
        <div>
          <dt className="text-xs text-muted-foreground">En marcha</dt>
          <dd className="tabular-nums">{fmtUptime(p.uptimeSec)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Memoria</dt>
          <dd className="tabular-nums">
            {p.rssMb} MB (heap {p.heapMb})
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Base de datos</dt>
          <dd className="tabular-nums">
            {db.latencyMs ?? "—"} ms · {db.sizeMb ?? "—"} MB
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Cola de apuntes</dt>
          <dd className="tabular-nums">{db.queue ? Object.entries(db.queue).map(([k, v]) => `${k} ${v}`).join(" · ") || "vacía" : "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Peticiones API (1 h)</dt>
          <dd className="tabular-nums">{metrics.count}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Errores 500 (1 h)</dt>
          <dd className="tabular-nums">{metrics.errors}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Latencia p50 / p95</dt>
          <dd className="tabular-nums">
            {metrics.p50} / {metrics.p95} ms
          </dd>
        </div>
      </dl>
      {metrics.routes.length ? (
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Rutas más usadas (desplazable)">
          <table className="w-full text-xs" aria-label="Rutas más usadas en la última hora">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th scope="col" className="py-1 pr-2 font-medium">Ruta</th>
                <th scope="col" className="py-1 pr-2 text-right font-medium">Peticiones</th>
                <th scope="col" className="py-1 pr-2 text-right font-medium">5xx</th>
                <th scope="col" className="py-1 text-right font-medium">p50 / p95 ms</th>
              </tr>
            </thead>
            <tbody>
              {metrics.routes.map((r) => (
                <tr key={r.route} className="border-t">
                  <td className="max-w-[14rem] truncate py-1 pr-2 font-mono">{r.route}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{r.count}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{r.errors}</td>
                  <td className="py-1 text-right tabular-nums">
                    {r.p50} / {r.p95}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Aún no hay peticiones a la API registradas desde el último arranque.</p>
      )}
      <p className="text-xs text-muted-foreground">
        Si la web entera cae, la app no puede avisar: programa <code>scripts/watchdog.sh</code> en el cron del servidor (ver el manual).
      </p>
    </div>
  );
}
