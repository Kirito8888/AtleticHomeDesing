import { PrintButton } from "@/components/print-button";
import { pageUser } from "@/lib/auth/page";
import { today } from "@/lib/dates";
import { formatDate, formatEur, TECHNICAL_EVENT_LABEL } from "@/lib/format";
import { BODY_AREA_LABEL, BODY_SIDE_LABEL } from "@/lib/recovery/injury-rules";
import { seasonReport } from "@/lib/training/season-report";

export const metadata = { title: "Informe de temporada · Atlenza" };

const MONTH = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

/** v1.8 · La temporada en una hoja (imprimir o guardar como PDF). Sin salud de la mujer ni datos cifrados. */
export default async function PrintSeason({ searchParams }: PageProps<"/print/season">) {
  const user = await pageUser();
  const y = Number((await searchParams).year);
  const year = Number.isInteger(y) && y >= 2000 && y <= 2100 ? y : today().getUTCFullYear();
  const r = await seasonReport(user.id, year);
  const maxTss = Math.max(1, ...r.load.map((m) => m.tss));
  const totalSessions = r.load.reduce((a, m) => a + m.sessions, 0);
  const totalTss = r.load.reduce((a, m) => a + m.tss, 0);
  return (
    <main className="mx-auto max-w-3xl bg-white p-6 text-black print:p-0">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">Temporada {year}</h1>
          <p className="text-sm">
            {user.name ?? ""} · {totalSessions} sesiones · TSS {totalTss}
          </p>
        </div>
        <PrintButton />
      </div>

      <h2 className="mt-4 mb-1 font-semibold">Mejores marcas</h2>
      {r.marks.length ? (
        <table className="w-full border-collapse text-sm">
          <tbody>
            {r.marks.map((m) => (
              <tr key={m.key} className="border-b border-gray-300">
                <td className="py-1 pr-2">
                  {m.kind === "TECHNICAL_MARK" ? `${TECHNICAL_EVENT_LABEL[m.technicalEvent ?? ""] ?? m.technicalEvent}${m.implementWeightG ? ` (${m.implementWeightG / 1000} kg)` : ""}` : `${m.trackDistanceM} m`}
                </td>
                <td className="py-1 pr-2 font-medium tabular-nums">{m.kind === "TECHNICAL_MARK" ? `${m.value.toFixed(2)} m` : `${m.value.toFixed(2)} s`}</td>
                <td className="py-1 text-gray-600">
                  {formatDate(m.date, { day: "numeric", month: "short" })}
                  {m.isCompetition ? " · competición" : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-sm text-gray-600">Sin marcas registradas este año.</p>
      )}

      <h2 className="mt-5 mb-1 font-semibold">Carga por mes (TSS)</h2>
      <table className="w-full border-collapse text-sm" aria-label="Carga por mes">
        <tbody>
          {r.load.map((m, i) => (
            <tr key={m.month} className="border-b border-gray-200">
              <td className="w-10 py-0.5 pr-2">{MONTH[i]}</td>
              <td className="py-0.5 pr-2">
                <div className="h-3 bg-gray-700" style={{ width: `${(m.tss / maxTss) * 100}%` }} />
              </td>
              <td className="w-28 py-0.5 text-right tabular-nums">
                {m.tss} · {m.sessions} ses.
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="mt-5 mb-1 font-semibold">Competiciones</h2>
      {r.competitions.length ? (
        <ul className="text-sm">
          {r.competitions.map((c, i) => (
            <li key={i}>
              {formatDate(c.date, { day: "numeric", month: "short" })} · {c.title}
              {c.location ? ` · ${c.location}` : ""}
              {c.priority ? ` · ${c.priority}` : ""}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-600">Sin competiciones en el calendario.</p>
      )}

      <h2 className="mt-5 mb-1 font-semibold">Molestias</h2>
      {r.injuries.length ? (
        <ul className="text-sm">
          {r.injuries.map((i, k) => (
            <li key={k}>
              {BODY_AREA_LABEL[i.area]}
              {i.side ? ` (${BODY_SIDE_LABEL[i.side]})` : ""} · dolor {i.pain}/10 · {formatDate(i.startedOn, { day: "numeric", month: "short" })}
              {i.resolvedOn ? ` → ${formatDate(i.resolvedOn, { day: "numeric", month: "short" })}` : " → sin cerrar"}
              {i.limitsTraining ? " · limitó el entreno" : ""}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-600">Ninguna molestia registrada.</p>
      )}

      <h2 className="mt-5 mb-1 font-semibold">Balance deportivo</h2>
      <p className="text-sm">
        Ingresos {formatEur(r.money.incomeCents)} · Gastos {formatEur(r.money.expenseCents)} · Saldo {formatEur(r.money.incomeCents - r.money.expenseCents)}
      </p>
      <p className="mt-6 text-xs text-gray-500">Atlenza · informe de temporada {year}</p>
    </main>
  );
}
