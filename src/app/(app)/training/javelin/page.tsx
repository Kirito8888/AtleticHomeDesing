import { PageHeader } from "@/components/page-header";
import { DeleteMinimum, MinimumForm } from "@/components/training/minimums";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { pageUser } from "@/lib/auth/page";
import { today, toIsoDay } from "@/lib/dates";
import { formatDate, formatNum, TECHNICAL_EVENT_LABEL } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { competitionForecast, conditionsEffect, cueStats, implementEquivalence, minimumStatus, progressionByImplement } from "@/lib/training/javelin-insights";
import { javelinSessions } from "@/lib/training/javelin-service";
import { throwStats } from "@/lib/training/diary-service";
import { cn } from "@/lib/utils";

export const metadata = { title: "Análisis de jabalina · Atlenza" };

const REF_G = 800;
const m = (x: number | null) => (x == null ? "—" : `${formatNum(x, 2)} m`);
const signed = (x: number) => `${x > 0 ? "+" : ""}${formatNum(x, 2)} m`;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="h-fit gap-2 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2 px-4 text-sm">{children}</CardContent>
    </Card>
  );
}

export default async function JavelinPage() {
  const user = await pageUser();
  const day = toIsoDay(today());
  const [sessions, minimums, stats] = await Promise.all([
    javelinSessions(user.id),
    prisma.minimum.findMany({ where: { userId: user.id }, orderBy: { deadline: { sort: "asc", nulls: "last" } } }),
    throwStats(user.id, day),
  ]);
  const cues = cueStats(sessions);
  const eq = implementEquivalence(sessions, REF_G);
  const prog = progressionByImplement(sessions);
  const cond = conditionsEffect(sessions);
  const forecast = competitionForecast(sessions, day, REF_G);

  return (
    <>
      <PageHeader title="Análisis de jabalina" description="Con tus datos: claves técnicas, pesos, condiciones, mínimas y previsión. Orientativo." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Mínimas y objetivos">
          {minimums.length ? (
            <ul className="grid gap-2" aria-label="Mínimas">
              {minimums.map((x) => {
                const st = minimumStatus({ markM: x.markM, deadline: x.deadline ? toIsoDay(x.deadline) : null, implementWeightG: x.implementWeightG }, sessions, day);
                return (
                  <li key={x.id} className="grid gap-0.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium">
                        {x.name} · {m(x.markM)}
                      </span>
                      <DeleteMinimum id={x.id} name={x.name} />
                    </div>
                    <span className={cn("text-xs", st.reached ? "font-medium text-emerald-700 dark:text-emerald-400" : "text-muted-foreground")}>
                      {st.reached
                        ? `¡Conseguida! Mejor de la temporada ${m(st.seasonBest)}`
                        : st.gap != null
                          ? `Te faltan ${formatNum(st.gap, 2)} m (mejor de la temporada ${m(st.seasonBest)})${st.slopePerWeek != null ? ` · tendencia ${signed(st.slopePerWeek)}/semana` : ""}${st.weeksToReach != null ? ` · a este ritmo, ~${st.weeksToReach} semanas` : ""}${st.onTrack === false ? " · no llega antes del plazo" : st.onTrack ? " · llega a tiempo" : ""}`
                          : "Sin marcas esta temporada con ese peso."}
                      {x.deadline ? ` · plazo ${formatDate(x.deadline, { day: "numeric", month: "short", year: "numeric" })}` : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : null}
          <MinimumForm />
        </Section>

        <Section title={`Previsión en competición (${REF_G} g)`}>
          {forecast.ok ? (
            <p>
              Con tu mejor de entreno de las 3 últimas semanas ({m(forecast.trainingBest)}) y tu relación competición/entreno (×{formatNum(forecast.ratio, 2)}, de {forecast.basedOn}{" "}
              competiciones): <span className="font-semibold">{m(forecast.markM)}</span> (entre {m(forecast.lowM)} y {m(forecast.highM)}).
            </p>
          ) : (
            <p className="text-muted-foreground">{forecast.reason}</p>
          )}
        </Section>

        <Section title="Claves técnicas">
          {cues.length ? (
            <ul className="grid gap-1" aria-label="Claves técnicas">
              {cues.map((c) => (
                <li key={c.cue} className="flex justify-between gap-2">
                  <span className="min-w-0 truncate">«{c.cue}»</span>
                  <span className={cn("shrink-0 tabular-nums", c.diffM > 0 && "font-medium")}>
                    {signed(c.diffM)} <span className="text-xs text-muted-foreground">({c.sessions} ses.)</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">Apunta la «clave técnica del día» al registrar tus sesiones de jabalina.</p>
          )}
          <p className="text-xs text-muted-foreground">Media de la sesión frente a tu media con ese peso. Con pocas sesiones, puede ser casualidad.</p>
        </Section>

        <Section title={`Pesos frente a ${REF_G} g`}>
          {eq.length ? (
            <ul className="grid gap-1">
              {eq.map((e) => (
                <li key={e.weightG} className="flex justify-between gap-2 tabular-nums">
                  <span>{e.weightG} g</span>
                  <span>{e.ratio != null ? `${e.ratio > 1 ? "+" : ""}${formatNum((e.ratio - 1) * 100, 1)} % (${e.months} meses)` : "sin meses en común"}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">Solo has lanzado con un peso.</p>
          )}
          {prog.map((p) => (
            <p key={String(p.weightG)} className="text-xs text-muted-foreground tabular-nums">
              {p.weightG ? `${p.weightG} g` : "Sin peso"}: {p.months.slice(-6).map((x) => `${x.month.slice(5)}/${x.month.slice(2, 4)} ${formatNum(x.markM, 1)}`).join(" · ")}
            </p>
          ))}
        </Section>

        <Section title="Marcas y condiciones">
          {cond.sessions ? (
            <>
              <ul className="grid gap-0.5 tabular-nums">
                {[...cond.wind, ...cond.temp].map((b) => (
                  <li key={b.label} className="flex justify-between gap-2">
                    <span>{b.label}</span>
                    <span>{b.residualM != null ? `${signed(b.residualM)} (n=${b.n})` : `pocas sesiones (${b.n})`}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">Mejor marca de la sesión frente a tu media de las 5 anteriores. Si con viento o calor sale positivo, ese día bueno no era (solo) progreso.</p>
            </>
          ) : (
            <p className="text-muted-foreground">Aún no hay sesiones con condiciones registradas (pon tu pista en Ajustes → Mi pista).</p>
          )}
        </Section>
        <Section title="Lanzamientos por implemento y semana">
          {stats.byWeek.weeks.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs tabular-nums" aria-label="Lanzamientos por semana">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="py-1 text-left font-normal">Semana</th>
                    {stats.byWeek.implements.map((i) => (
                      <th key={i} className="py-1 text-right font-normal">
                        {i}
                      </th>
                    ))}
                    <th className="py-1 text-right font-normal">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.byWeek.weeks.map((w) => (
                    <tr key={w.week} className="border-t">
                      <td className="py-1">{formatDate(w.week, { day: "numeric", month: "short" })}</td>
                      {stats.byWeek.implements.map((i) => (
                        <td key={i} className="py-1 text-right">
                          {w.byImplement[i] ?? ""}
                        </td>
                      ))}
                      <td className="py-1 text-right font-medium">{w.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-muted-foreground">Sin lanzamientos en las últimas 12 semanas.</p>
          )}
        </Section>
        <Section title="Récords por temporada y categoría">
          {stats.records.length ? (
            <ul className="grid gap-1" aria-label="Récords por temporada">
              {stats.records.map((r) => (
                <li key={`${r.season}-${r.event}-${r.implementWeightG}`} className="flex justify-between gap-2">
                  <span>
                    {r.season}
                    {r.category ? ` · ${r.category}` : ""} · {TECHNICAL_EVENT_LABEL[r.event] ?? r.event}
                    {r.implementWeightG ? ` ${r.implementWeightG} g` : ""}
                    {r.isCompetition ? " · en competición" : ""}
                  </span>
                  <span className="shrink-0 font-medium tabular-nums">{m(r.markM)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">Sin marcas todavía.</p>
          )}
          <p className="text-xs text-muted-foreground">Categoría por la edad que cumples en el año (pon tu fecha de nacimiento en Ajustes → Perfil).</p>
        </Section>
      </div>
    </>
  );
}
