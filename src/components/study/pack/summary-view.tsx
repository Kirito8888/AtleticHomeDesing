import { LEVEL_KEYS, LEVEL_LABEL, type Summary, type SummaryBlock } from "@/lib/study/pack-schema";

const LEVEL_STYLE: Record<(typeof LEVEL_KEYS)[number], { icon: string; ring: string }> = {
  safe: { icon: "🔴", ring: "border-red-500/60" },
  probable: { icon: "🟡", ring: "border-amber-500/60" },
  extra: { icon: "⚪", ring: "border-muted-foreground/40" },
};

function Block({ b }: { b: SummaryBlock }) {
  return (
    <article className="grid gap-2 rounded-lg border bg-card p-3" data-testid="summary-block">
      <h4 className="font-semibold break-words">{b.title}</h4>
      {b.concepts.length ? (
        <ul className="grid list-disc gap-1 pl-5 text-sm">
          {b.concepts.map((c, i) => (
            <li key={i} className="break-words">
              {c}
            </li>
          ))}
        </ul>
      ) : null}
      {b.commands.length ? (
        <div className="grid gap-2">
          {b.commands.map((c, i) => (
            <div key={i} className="grid gap-1 rounded-md bg-muted/60 p-2 text-sm">
              <code className="font-mono font-semibold break-all">{c.syntax}</code>
              {c.options.length ? (
                <ul className="list-disc pl-5">
                  {c.options.map((o, j) => (
                    <li key={j} className="break-words">
                      {o}
                    </li>
                  ))}
                </ul>
              ) : null}
              <p className="break-words">
                <b>Error típico:</b> {c.typicalError}
              </p>
              {c.paths.length ? (
                <p className="break-all">
                  <b>Rutas:</b> {c.paths.map((p) => <code key={p} className="mr-2 font-mono">{p}</code>)}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {b.tables.map((t, i) => (
        <div key={i} className="overflow-x-auto">
          <table className="w-full min-w-max border-collapse text-sm">
            <caption className="mb-1 text-left text-xs font-medium text-muted-foreground">{t.title}</caption>
            <thead>
              <tr>
                {t.headers.map((h, j) => (
                  <th key={j} scope="col" className="border bg-muted px-2 py-1 text-left font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {t.rows.map((r, j) => (
                <tr key={j}>
                  {r.map((c, k) => (
                    <td key={k} className="border px-2 py-1 align-top">
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {b.traps.length ? (
        <ul className="grid gap-1 text-sm">
          {b.traps.map((t, i) => (
            <li key={i} className="break-words">
              ⚠️ <b>Trampa:</b> {t}
            </li>
          ))}
        </ul>
      ) : null}
      {b.mnemonics.length ? (
        <ul className="grid gap-1 text-sm">
          {b.mnemonics.map((t, i) => (
            <li key={i} className="break-words">
              🧠 {t}
            </li>
          ))}
        </ul>
      ) : null}
      {b.errata.map((e, i) => (
        <p key={i} className="rounded-md border border-amber-500/60 bg-amber-500/10 p-2 text-sm break-words" data-testid="summary-errata">
          <b>Errata:</b> {e.replace(/^Errata:\s*/i, "")}
        </p>
      ))}
    </article>
  );
}

/** Resumen de un tema por prioridad. Solo texto: todo se renderiza escapado desde el JSON validado, nunca HTML de la IA. */
export function SummaryView({ summary }: { summary: Summary }) {
  const st = summary.selfTest;
  return (
    <div className="grid gap-4" data-testid="summary">
      <section aria-label="Si solo tengo 10 minutos" className="rounded-lg border-2 border-primary/50 bg-primary/5 p-3">
        <h2 className="mb-1 text-lg font-semibold">⏱ Si solo tengo 10 minutos</h2>
        <ol className="grid list-decimal gap-1 pl-5 text-sm">
          {summary.tenMinutes.map((p, i) => (
            <li key={i} className="break-words">
              {p}
            </li>
          ))}
        </ol>
      </section>

      {LEVEL_KEYS.map((k) => {
        const blocks = summary.levels[k];
        if (!blocks.length) return null;
        return (
          <section key={k} aria-label={LEVEL_LABEL[k]} className={`grid gap-2 border-l-4 pl-3 ${LEVEL_STYLE[k].ring}`}>
            <h2 className="text-lg font-semibold">
              <span aria-hidden>{LEVEL_STYLE[k].icon}</span> {LEVEL_LABEL[k]}
            </h2>
            {blocks.map((b, i) => (
              <Block key={i} b={b} />
            ))}
          </section>
        );
      })}

      <section aria-label="Autoevaluación" className="grid gap-2">
        <h2 className="text-lg font-semibold">📝 Autoevaluación</h2>
        <ol className="grid list-decimal gap-1 pl-5 text-sm">
          {st.questions.map((q, i) => (
            <li key={i} className="break-words">
              {q}
            </li>
          ))}
        </ol>
        <h3 className="font-medium">Prácticos</h3>
        <ol className="grid list-decimal gap-1 pl-5 text-sm">
          {st.practicals.map((q, i) => (
            <li key={i} className="break-words">
              {q}
            </li>
          ))}
        </ol>
        <details className="rounded-lg border p-2" data-testid="summary-solutions">
          <summary className="min-h-11 cursor-pointer py-2 font-medium">Ver soluciones (inténtalo antes)</summary>
          <ol className="grid list-decimal gap-1 pl-5 text-sm">
            {summary.solutions.questions.map((q, i) => (
              <li key={i} className="break-words">
                {q}
              </li>
            ))}
          </ol>
          <h3 className="mt-2 font-medium">Prácticos</h3>
          <ol className="grid list-decimal gap-1 pl-5 text-sm">
            {summary.solutions.practicals.map((q, i) => (
              <li key={i} className="break-words">
                <code className="font-mono break-all">{q}</code>
              </li>
            ))}
          </ol>
        </details>
      </section>
    </div>
  );
}
