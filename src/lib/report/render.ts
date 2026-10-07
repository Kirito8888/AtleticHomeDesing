/**
 * Informe de solo lectura para la entrenadora: HTML autocontenido, sin
 * JavaScript ni recursos externos. Nunca incluye ciclo menstrual, peso ni
 * notas; las molestias solo si el atleta lo marcó.
 */
export type ReportData = {
  athlete: string;
  from: string;
  to: string;
  expiresAt: string;
  weeks: Array<{ week: string; planned: number; done: number; skipped: number; throws: number }>;
  sessions: Array<{ date: string; title: string; status: string; type: string; best: string | null }>;
  marks: Array<{ label: string; top: Array<{ markM: number; date: string; isCompetition: boolean }> }>;
  controls: Array<{ date: string; squeeze: number | null; heel: number | null; jumpCm: number | null }>;
  injuries: Array<{ area: string; pain: number; since: string; resolved: string | null }> | null;
};

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const num = (n: number, d = 2) => n.toLocaleString("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: d });
const STATUS: Record<string, string> = { COMPLETED: "hecha", PLANNED: "pendiente", SKIPPED: "saltada" };

export function renderReport(d: ReportData): string {
  const table = (head: string[], rows: string[][]) =>
    `<table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  const sections: string[] = [];
  sections.push(
    `<h2>Planificado frente a hecho</h2>${table(
      ["Semana (lunes)", "Planificadas", "Hechas", "Saltadas", "Lanzamientos"],
      d.weeks.map((w) => [esc(w.week), String(w.planned + w.done + w.skipped), String(w.done), String(w.skipped), String(w.throws)]),
    )}`,
  );
  if (d.sessions.length) {
    sections.push(
      `<h2>Sesiones</h2>${table(
        ["Fecha", "Sesión", "Estado", "Mejor marca"],
        d.sessions.map((s) => [esc(s.date), esc(s.title), esc(STATUS[s.status] ?? s.status), s.best ? esc(s.best) : "—"]),
      )}`,
    );
  }
  if (d.marks.length) {
    sections.push(
      `<h2>Mejores marcas del periodo</h2>${d.marks
        .map((m) => `<h3>${esc(m.label)}</h3><ol>${m.top.map((t) => `<li>${num(t.markM)} m · ${esc(t.date)}${t.isCompetition ? " (competición)" : ""}</li>`).join("")}</ol>`)
        .join("")}`,
    );
  }
  if (d.controls.length) {
    sections.push(
      `<h2>Controles</h2>${table(
        ["Fecha", "Squeeze (0-10)", "Talón (0-10)", "Salto (cm)"],
        d.controls.map((c) => [esc(c.date), c.squeeze == null ? "—" : String(c.squeeze), c.heel == null ? "—" : String(c.heel), c.jumpCm == null ? "—" : num(c.jumpCm, 1)]),
      )}`,
    );
  }
  if (d.injuries) {
    sections.push(
      d.injuries.length
        ? `<h2>Molestias</h2>${table(
            ["Zona", "Dolor", "Desde", "Resuelta"],
            d.injuries.map((i) => [esc(i.area), `${i.pain}/10`, esc(i.since), i.resolved ? esc(i.resolved) : "activa"]),
          )}`
        : "<h2>Molestias</h2><p>Ninguna en el periodo.</p>",
    );
  }
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Informe de ${esc(d.athlete)}</title><style>
body{font:15px/1.5 system-ui,sans-serif;margin:0 auto;max-width:860px;padding:16px;color:#111;background:#fff}
h1{font-size:1.4rem;margin:.2rem 0}h2{font-size:1.1rem;margin-top:1.6rem}h3{font-size:1rem;margin:.8rem 0 .2rem}
table{border-collapse:collapse;width:100%;font-size:.9rem;display:block;overflow-x:auto}th,td{border-bottom:1px solid #ddd;padding:4px 8px;text-align:left;white-space:nowrap}
.muted{color:#666;font-size:.85rem}
@media (prefers-color-scheme:dark){body{background:#111;color:#eee}th,td{border-color:#333}.muted{color:#aaa}}
</style></head><body><h1>Informe de ${esc(d.athlete)}</h1><p class="muted">Del ${esc(d.from)} al ${esc(d.to)} · enlace de solo lectura, caduca el ${esc(d.expiresAt)}. Generado con LifeOS.</p>${sections.join("")}</body></html>`;
}
