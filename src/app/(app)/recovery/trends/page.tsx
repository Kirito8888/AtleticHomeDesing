import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { pageUser } from "@/lib/auth/page";
import { today, toIsoDay } from "@/lib/dates";
import { type MonthStat } from "@/lib/recovery/trends";
import { trendsFor } from "@/lib/recovery/trends-service";

export const metadata = { title: "Tendencias · Atlenza" };

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const label = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;
const num = (v: number | null, d = 1) => (v == null ? "—" : v.toFixed(d).replace(".", ","));

function Spark({ months, pick, title }: { months: MonthStat[]; pick: (m: MonthStat) => number | null; title: string }) {
  const vals = months.map(pick);
  const nums = vals.filter((v): v is number => v != null);
  if (nums.length < 2) return <p className="text-xs text-muted-foreground">Sin datos suficientes.</p>;
  const lo = Math.min(...nums);
  const hi = Math.max(...nums);
  const x = (i: number) => 4 + (i * 192) / Math.max(1, vals.length - 1);
  const y = (v: number) => 4 + (hi === lo ? 18 : (1 - (v - lo) / (hi - lo)) * 36);
  const pts = vals.flatMap((v, i) => (v == null ? [] : [`${x(i)},${y(v)}`]));
  return (
    <svg viewBox="0 0 200 44" role="img" aria-label={title} className="h-11 w-full text-primary">
      <polyline points={pts.join(" ")} fill="none" stroke="currentColor" strokeWidth="2" />
      {vals.map((v, i) => (v == null ? null : <circle key={i} cx={x(i)} cy={y(v)} r="2.5" fill="currentColor" />))}
    </svg>
  );
}

/** v2.0 · Tendencias de meses: sueño, VFC, carga y molestias, con avisos que explican su causa. Cálculo local. */
export default async function TrendsPage() {
  const user = await pageUser();
  const { months, alerts, hrvWeeks } = await trendsFor(user.id, toIsoDay(today()));
  const series = [
    { key: "sleep", title: "Sueño (h/noche)", pick: (m: MonthStat) => m.sleepH, show: (m: MonthStat) => num(m.sleepH) },
    { key: "hrv", title: "VFC (ms)", pick: (m: MonthStat) => m.hrv, show: (m: MonthStat) => num(m.hrv) },
    { key: "load", title: "Carga semanal (sRPE)", pick: (m: MonthStat) => m.loadWeekly, show: (m: MonthStat) => num(m.loadWeekly, 0) },
    { key: "pain", title: "Días con molestia (cada 30 d)", pick: (m: MonthStat) => m.painPer30, show: (m: MonthStat) => num(m.painPer30) },
  ];
  return (
    <>
      <PageHeader title="Tendencias" description="Varios meses de sueño, VFC, carga y molestias. Los avisos dicen la causa y los valores exactos." />
      <section aria-label="Avisos de tendencia" className="mb-6 grid gap-3">
        {alerts.length ? (
          alerts.map((a) => (
            <Card key={a.id} className={`gap-2 py-4 ${a.level === "warn" ? "border-amber-500/60" : ""}`}>
              <CardHeader className="px-4">
                <CardTitle className="text-sm">{a.title}</CardTitle>
              </CardHeader>
              <CardContent className="px-4 text-sm">
                <details>
                  <summary className="cursor-pointer text-muted-foreground underline underline-offset-4">Por qué</summary>
                  <p className="mt-2">{a.cause}</p>
                  <dl className="mt-2 grid gap-1">
                    {a.values.map((v) => (
                      <div key={v.label} className="grid grid-cols-[1fr_auto] gap-2 border-b py-1 last:border-0">
                        <dt className="text-muted-foreground">{v.label}</dt>
                        <dd className="text-right tabular-nums">{v.value}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-2 text-xs text-muted-foreground">Umbral de «Mis reglas»: {a.threshold}.</p>
                </details>
              </CardContent>
            </Card>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">Sin avisos de tendencia. Hacen falta al menos 3 meses con datos (un mes reciente y 2 de base) y lecturas suficientes por mes.</p>
        )}
      </section>
      <div className="grid gap-4 md:grid-cols-2">
        {series.map((s) => (
          <Card key={s.key} className="gap-2 py-4">
            <CardHeader className="px-4">
              <CardTitle className="text-sm">{s.title}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 px-4 text-xs">
              <Spark months={months} pick={s.pick} title={s.title} />
              <ul className="grid grid-cols-3 gap-x-3 gap-y-1">
                {months.map((m) => (
                  <li key={m.month} className="flex justify-between gap-1">
                    <span className="text-muted-foreground">{label(m.month)}{m.partial ? "*" : ""}</span>
                    <span className="tabular-nums">{s.show(m)}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        * Mes en curso (parcial). «—» = lecturas insuficientes. {hrvWeeks ? `${hrvWeeks} semana${hrvWeeks === 1 ? "" : "s"} marcada${hrvWeeks === 1 ? "" : "s"} «VFC» en tu plan (el aviso semanal de VFC solo salta en ellas). ` : "Ninguna semana de tu plan está marcada «VFC»: el aviso semanal de VFC no salta. "}
        Los umbrales se editan en Ajustes → Mis reglas. Todo se calcula aquí, sin IA.
      </p>
    </>
  );
}
