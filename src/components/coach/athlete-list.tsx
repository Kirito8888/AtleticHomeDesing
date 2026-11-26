"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/format";
import type { PortfolioRow } from "@/lib/managed/portfolio";

const planText = (r: PortfolioRow) => {
  if (r.plan === null) return null;
  if (r.plan === "none") return "Sin plan activo";
  if (r.plan === "ending") return r.planDays === 0 ? "⚠ El plan acaba hoy" : `⚠ El plan acaba en ${r.planDays} ${r.planDays === 1 ? "día" : "días"}`;
  return `Plan hasta ${formatDate(r.planEnd!)}`;
};

function Row({ r }: { r: PortfolioRow }) {
  const detail = [r.discipline, planText(r)].filter(Boolean).join(" · ");
  return (
    <li>
      <Link href={r.href} className="flex min-h-14 items-center justify-between gap-3 py-2 hover:bg-accent/50" data-testid="athlete-row">
        <span className="min-w-0">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-medium">{r.name}</span>
            <span className="text-xs text-muted-foreground">{r.kind === "ficha" ? "sin cuenta" : "con cuenta"}</span>
            {r.label ? <span className="text-xs text-muted-foreground">{r.label}</span> : null}
          </span>
          <span className="block text-sm text-muted-foreground">{detail || "Sin datos de plan"}</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </Link>
    </li>
  );
}

/** Lista única de atletas (con y sin cuenta): búsqueda, filtro por grupo y archivadas plegadas. */
export function AthleteList({ rows }: { rows: PortfolioRow[] }) {
  const [q, setQ] = useState("");
  const [group, setGroup] = useState("");
  const groups = useMemo(() => [...new Set(rows.map((r) => r.group).filter((g): g is string => Boolean(g)))].sort((a, b) => a.localeCompare(b, "es")), [rows]);
  const match = (r: PortfolioRow) => (!q || r.name.toLowerCase().includes(q.trim().toLowerCase())) && (!group || r.group === group);
  const active = rows.filter((r) => !r.archived && match(r));
  const archived = rows.filter((r) => r.archived && match(r));
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="athlete-q">Buscar atleta</label>
        <Input id="athlete-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" className="h-11 min-w-0 flex-1" />
        {groups.length ? (
          <>
            <label className="sr-only" htmlFor="athlete-group">Grupo</label>
            <select id="athlete-group" value={group} onChange={(e) => setGroup(e.target.value)} className="h-11 rounded-md border bg-background px-2 text-sm">
              <option value="">Grupo: todos</option>
              {groups.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </>
        ) : null}
      </div>
      {active.length ? (
        <ul className="divide-y rounded-lg border px-3" aria-label="Atletas">
          {active.map((r) => (
            <Row key={r.id} r={r} />
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border p-4 text-sm text-muted-foreground" data-testid="athletes-empty">
          {rows.some((r) => !r.archived) ? "Ninguna atleta coincide con la búsqueda." : "Aún no llevas a nadie. Con «Nueva atleta» das de alta a alguien sin cuenta; las que tienen cuenta aparecen aquí cuando aceptan tu invitación (Ajustes → Entrenador / atletas)."}
        </p>
      )}
      {archived.length ? (
        <details data-testid="athletes-archived" className="rounded-lg border px-3">
          <summary className="flex min-h-11 cursor-pointer items-center text-sm">Archivadas ({archived.length})</summary>
          <ul className="divide-y" aria-label="Atletas archivadas">
            {archived.map((r) => (
              <Row key={r.id} r={r} />
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
