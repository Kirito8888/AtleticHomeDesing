import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PlanBlock, PlanRow } from "@/lib/planning/plan-import/types";
import { cn } from "@/lib/utils";

const empty = (s: string) => !s || s === "-";

function Exercise({ row }: { row: PlanRow }) {
  if (row.ramp) {
    // Series de aproximación: discretas, no cuentan.
    return (
      <li className="rounded-md border border-dashed px-3 py-1.5 text-xs text-muted-foreground">
        ↳ Rampa · {row.sets}
        {empty(row.load) ? "" : ` · ${row.load}`}
        {empty(row.rest) ? "" : ` · desc. ${row.rest}`}
      </li>
    );
  }
  const facts: Array<[string, string]> = [
    ["Series", row.sets],
    ["Carga", row.load],
    ["RIR", row.rir],
    ["Desc.", row.rest],
  ];
  return (
    <li className="rounded-md border p-3">
      <div className="font-medium">{row.exercise.replace(/\s*·\s*SERIE DE TEST/, "")}</div>
      {/SERIE DE TEST/.test(row.exercise) ? (
        <Badge variant="secondary" className="mt-1">
          Serie de test
        </Badge>
      ) : null}
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm sm:grid-cols-4">
        {facts
          .filter(([, v]) => !empty(v))
          .map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="text-[11px] text-muted-foreground">{k}</dt>
              <dd className={cn("font-semibold tabular-nums", k === "Series" && "text-base")}>{v}</dd>
            </div>
          ))}
      </dl>
      {row.how ? (
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer text-xs text-muted-foreground">Cómo lo hago</summary>
          <p className="mt-1 text-muted-foreground">{row.how}</p>
        </details>
      ) : null}
    </li>
  );
}

/**
 * El día del plan importado, legible en el móvil: apartados de texto, una
 * tarjeta por ejercicio (series, carga y RIR a la vista) y «Por qué» plegado.
 */
export function PlanDayView({ blocks, heading }: { blocks: PlanBlock[]; heading?: React.ReactNode }) {
  return (
    <Card className="mb-4 gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-base">Plan del día</CardTitle>
        {heading ? <div className="text-xs text-muted-foreground">{heading}</div> : null}
      </CardHeader>
      <CardContent className="grid gap-3 px-4">
        {blocks.map((b, i) =>
          b.kind === "table" ? (
            <ul key={i} className="grid gap-2 lg:grid-cols-2" aria-label="Ejercicios">
              {b.rows.map((r, j) => (
                <Exercise key={j} row={r} />
              ))}
            </ul>
          ) : b.kind === "why" ? (
            <details key={i} className="rounded-md bg-muted/50 p-3 text-sm">
              <summary className="cursor-pointer font-medium">Por qué</summary>
              <p className="mt-1 text-muted-foreground">{b.text}</p>
            </details>
          ) : (
            <div key={i} className="text-sm">
              {b.title ? <h3 className="font-medium">{b.title}</h3> : null}
              {b.text ? <p className="text-muted-foreground">{b.text}</p> : null}
            </div>
          ),
        )}
      </CardContent>
    </Card>
  );
}
