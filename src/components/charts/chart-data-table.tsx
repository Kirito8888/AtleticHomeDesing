import { useId } from "react";

/** v3.0 T · V3-A12: alternativa tabular de un gráfico. `<details>` con tabla (caption, th scope) y región con nombre. */
export function ChartDataTable({
  summary,
  caption,
  columns,
  rows,
  className = "",
}: {
  summary: string;
  caption: string;
  columns: string[];
  /** Cada fila: [cabecera de fila, ...celdas ya formateadas]. */
  rows: string[][];
  className?: string;
}) {
  const id = useId();
  return (
    <details className={`rounded-lg border text-sm ${className}`}>
      <summary className="min-h-11 cursor-pointer px-3 py-3 font-medium">{summary}</summary>
      <div role="region" aria-label={caption} tabIndex={0} className="max-h-80 overflow-auto">
        <table className="w-full text-xs tabular-nums" aria-describedby={id}>
          <caption id={id} className="sr-only">
            {caption}
          </caption>
          <thead className="sticky top-0 bg-background text-muted-foreground">
            <tr>
              {columns.map((h, i) => (
                <th key={h} scope="col" className={`px-2 py-1 font-normal ${i === 0 ? "text-left" : "text-right"}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r[0]} className="border-t">
                <th scope="row" className="px-2 py-1 text-left font-normal">
                  {r[0]}
                </th>
                {r.slice(1).map((c, i) => (
                  <td key={i} className="px-2 py-1 text-right">
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
