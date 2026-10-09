import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { LabForm, LabTable, PelvicForm, PillBreakForm, PostpartumCard, ScreenForm, WomenSettingsForm } from "@/components/recovery/women-panel";
import { BoneForm, HealthReportLinks } from "@/components/recovery/women-extra";
import { RuleAlerts } from "@/components/rules/rule-alerts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { pageUser } from "@/lib/auth/page";
import { today, toIsoDay } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { getCycle } from "@/lib/health/cycle-service";
import { PELVIC_SYMPTOMS } from "@/lib/health/women";
import { listHealthReports } from "@/lib/health/health-report";
import { IRON_TIPS, PERF_LABEL } from "@/lib/health/women-plus";
import { womenEnabled, womenOverview } from "@/lib/health/women-service";
import { cn } from "@/lib/utils";

export const metadata = { title: "Salud de la mujer · LifeOS" };

function Section({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return (
    <Card id={id} className="scroll-mt-20 gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-4">{children}</CardContent>
    </Card>
  );
}

/**
 * Salud de la mujer deportista. Cifrado, solo para ella: ni la IA ni la
 * entrenadora lo ven. Cribado y prudencia, no diagnósticos.
 */
export default async function WomenHealthPage() {
  const user = await pageUser();
  if (!(await womenEnabled(user.id))) notFound();
  const day = toIsoDay(today());
  const [o, cycle, reports] = await Promise.all([womenOverview(user.id, day), getCycle(user.id, 60), listHealthReports(user.id)]);
  const hormonal = cycle.settings?.hormonal === "si";

  return (
    <>
      <PageHeader title="Salud de la mujer" description="Cifrado y solo para ti: ni la IA ni tu entrenadora lo ven." />
      <RuleAlerts alerts={o.alerts} label="Avisos de salud" link={null} />
      <div className="grid gap-4 lg:grid-cols-2">
        {o.postpartum ? <PostpartumCard settings={o.settings} status={o.postpartum} /> : null}

        <Section title="Disponibilidad energética (7 días)">
          {o.ea.ok ? (
            <div className="grid gap-2 text-sm">
              <p>
                Media: <span className={o.ea.low ? "font-semibold text-destructive" : "font-semibold"}>{o.ea.mean} kcal/kg MLG</span> · masa libre de grasa {o.ea.ffmKg} kg
              </p>
              <ul className="grid grid-cols-2 gap-1 text-xs text-muted-foreground tabular-nums sm:grid-cols-4">
                {o.ea.days.map((d) => (
                  <li key={d.date}>
                    {formatDate(d.date, { weekday: "short", day: "numeric" })}: {d.ea}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                (comida − gasto estimado del ejercicio) / masa libre de grasa. Por debajo de ~30 se considera baja. Es una estimación: úsala como tendencia.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{o.ea.reason}</p>
          )}
        </Section>

        <Section title="Cribado de RED-S" id="cribado">
          {o.screen ? (
            <p className="mb-3 text-sm">
              Último ({o.screen.date}):{" "}
              <span className="font-semibold">{o.screen.level === "red" ? "pide valoración médica" : o.screen.level === "amber" ? "vigilar" : "sin señales"}</span>
            </p>
          ) : null}
          <ScreenForm today={day} />
        </Section>

        <Section title="Hierro y analíticas">
          <div className="grid gap-4">
            <LabTable series={o.labs} />
            <LabForm today={day} />
            <div className="grid gap-1 border-t pt-3 text-sm" aria-label="Hierro en la dieta">
              <p className="font-medium">Hierro en la dieta (7 días)</p>
              <p>
                {o.iron.daysWithRich} de 7 días con alimentos ricos en hierro
                {o.iron.knownMg ? ` · al menos ${o.iron.knownMg} mg en los productos que traen el dato` : ""}.
              </p>
              {o.iron.richFoods.length ? <p className="text-xs text-muted-foreground">{o.iron.richFoods.join(", ")}</p> : null}
              <p className="text-xs text-muted-foreground">
                Marca «Fe» en una comida de Nutrición si es rica en hierro (legumbres, carne roja, mejillones, almejas…). {o.iron.unknown ? "Muchos alimentos no traen el dato: el total es un mínimo." : ""}
              </p>
              <ul className="list-disc pl-5 text-xs text-muted-foreground">
                {IRON_TIPS.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          </div>
        </Section>

        <Section title="Tu patrón ciclo–rendimiento">
          {o.performance.ok ? (
            <div className="grid gap-2 text-sm">
              <p className="text-xs text-muted-foreground">Días con regla o síntomas frente al resto, en tus {o.performance.cycles} últimos ciclos. Media e intervalo al 95 %.</p>
              <ul className="grid gap-2" aria-label="Patrón ciclo–rendimiento">
                {o.performance.rows.map((r) => {
                  const meta = PERF_LABEL[r.metric];
                  const worse = meta.higherIsBetter ? r.diff < 0 : r.diff > 0;
                  return (
                    <li key={r.metric} className="grid gap-0.5">
                      <span className="font-medium">{meta.label}</span>
                      <span className="tabular-nums">
                        con síntomas {r.with.mean}
                        {meta.unit} (n={r.with.n}) · sin {r.without.mean}
                        {meta.unit} (n={r.without.n}) ·{" "}
                        <span className={cn(r.clear && worse && "font-semibold text-destructive", r.clear && !worse && "font-semibold")}>
                          {r.clear ? (worse ? "peor de forma clara" : "mejor de forma clara") : "sin diferencia clara"}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="text-xs text-muted-foreground">Solo con tus datos: si no hay diferencia clara, no hace falta cambiar nada del plan esos días.</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{o.performance.reason}</p>
          )}
        </Section>

        <Section title="Salud ósea" id="hueso">
          <div className="grid gap-3 text-sm">
            {o.bone ? (
              <p>
                Último ({o.bone.date}):{" "}
                <span className={cn("font-semibold", o.bone.level === "red" && "text-destructive")}>
                  {o.bone.level === "red" ? "pide valoración médica" : o.bone.level === "amber" ? "vigilar" : "sin señales"}
                </span>
                {o.bone.reasons.length ? <span className="block text-xs text-muted-foreground">{o.bone.reasons.join(" · ")}</span> : null}
              </p>
            ) : (
              <p className="text-muted-foreground">Cribado de prudencia: cruza fracturas previas, regla, energía, calcio, vitamina D y el trabajo con impacto ({o.settings.boneImpactMin} sesiones a la semana).</p>
            )}
            <BoneForm today={day} initial={o.bone ? { stressFractures: o.bone.stressFractures, calciumServings: o.bone.calciumServings } : null} />
          </div>
        </Section>

        <Section title="Para tu médica o ginecóloga">
          <p className="mb-3 text-sm text-muted-foreground">
            Un enlace de solo lectura con tu ciclo, analíticas, cribados, suelo pélvico y posparto. Caduca en 7 días, puedes revocarlo y tu entrenadora nunca lo ve.
          </p>
          <HealthReportLinks kind="MEDICAL" label="Tu médica" active={reports.filter((r) => r.kind === "MEDICAL").map((r) => ({ id: r.id, expiresAt: r.expiresAt.toISOString() }))} />
        </Section>

        <Section title="Entreno sola, con aviso">
          <p className="text-sm text-muted-foreground">
            Marca «salgo» con la hora de vuelta y, si no marcas «llegué», tus contactos de confianza reciben un aviso.{" "}
            <Link href="/safety" className="font-medium text-foreground underline underline-offset-2">
              Abrir
            </Link>
          </p>
        </Section>

        <Section title="Suelo pélvico">
          <div className="grid gap-3">
            <PelvicForm today={day} />
            {o.pelvic.length ? (
              <ul className="grid gap-1 text-xs text-muted-foreground">
                {o.pelvic.map((p) => (
                  <li key={p.id}>
                    {p.date}: {p.symptoms.map((s) => PELVIC_SYMPTOMS[s]).join(", ")}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </Section>

        <Section title={o.learned ? "Próximos días (aprendido de tus ciclos)" : "Próximos días (según tu ciclo)"}>
          {o.predicted.length ? (
            <ul className="flex flex-wrap gap-1.5 text-xs" aria-label="Días previstos">
              {o.predicted.map((d) => (
                <li key={d.date} className="rounded-full border px-2 py-0.5">
                  {formatDate(d.date, { weekday: "short", day: "numeric" })} · {d.period ? "regla" : "síntomas"}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              {hormonal ? "Con anticonceptivo hormonal no se estiman fases: cuentan los síntomas que marques cada día." : "Configura «Mi ciclo» en Recuperación para ver los días previstos."}
            </p>
          )}
          {hormonal ? (
            <div className="mt-3 grid gap-2">
              <p className="text-sm font-medium">Semana de descanso de la píldora</p>
              <PillBreakForm today={day} />
            </div>
          ) : null}
          <p className="mt-2 text-xs text-muted-foreground">
            Solo tú los ves (calendario y «Próximos 7 días»): no salen en el calendario .ics ni en el informe. <Link href="/recovery" className="underline">Mi ciclo</Link>
          </p>
        </Section>

        <Section title="Ajustes">
          <WomenSettingsForm initial={o.settings} />
        </Section>
      </div>
    </>
  );
}
