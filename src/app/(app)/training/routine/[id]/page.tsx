import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { ProjectionChart } from "@/components/charts/lazy";
import { RetestForm } from "@/components/routine/retest-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { pageUser } from "@/lib/auth/page";
import { today, toIsoDay } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { EXPERIENCE, GOALS_LONG, GOALS_SHORT, TESTS, type TestKey } from "@/lib/routine/questionnaire";
import { routineView } from "@/lib/routine/service";

export const metadata = { title: "Mi rutina · LifeOS" };

const BAND_LABEL = { bajo: "por debajo de lo habitual", medio: "en la media", alto: "por encima" } as const;

export default async function RoutineDetailPage({ params }: PageProps<"/training/routine/[id]">) {
  const user = await pageUser();
  const { id } = await params;
  const v = await routineView(user.id, id);
  if (!v) notFound();
  const { answers: a, profile: p } = v;
  return (
    <>
      <PageHeader title="Mi rutina" description={`${p.archetype} · nivel ${p.level}`} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="h-fit gap-3 py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-base">Tu perfil</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 px-4 text-sm">
            <p>
              {a.age} años · {EXPERIENCE[a.experience].toLowerCase()}
              {p.bmi ? ` · IMC ${p.bmi}` : ""}
            </p>
            {Object.keys(p.bands).length ? (
              <ul className="grid gap-0.5" aria-label="Tus tests">
                {(Object.entries(p.bands) as Array<[TestKey, keyof typeof BAND_LABEL]>).map(([k, b]) => (
                  <li key={k}>
                    {TESTS[k].label}: <span className="font-medium">{a.tests[k]}</span> <span className="text-muted-foreground">({BAND_LABEL[b]})</span>
                  </li>
                ))}
              </ul>
            ) : null}
            <ul className="list-disc pl-5 text-muted-foreground">
              {p.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            <p>
              <span className="font-medium">Corto plazo:</span> {GOALS_SHORT[a.shortGoal]} en {a.shortWeeks} semanas · <span className="font-medium">Largo plazo:</span> {GOALS_LONG[a.longGoal]} en {a.horizonMonths} meses.
            </p>
          </CardContent>
        </Card>
        <Card className="h-fit gap-3 py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-base">La rutina</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 px-4 text-sm">
            {v.meso ? (
              <>
                <p>
                  {v.meso.code} · {v.meso.name} · {formatDate(v.meso.startDate)}–{formatDate(v.meso.endDate)} ·{" "}
                  <span className="font-medium">{v.meso.status === "DRAFT" ? "borrador" : v.meso.status === "ACTIVE" ? "activa" : v.meso.status.toLowerCase()}</span>
                </p>
                <p className="text-muted-foreground">
                  {a.weekdays.length} días por semana, {a.minutes} min. Progresión lenta y una semana de descarga cada 4. Revísala y actívala para que pase a tus entrenamientos.
                </p>
                <Button asChild>
                  <Link href={`/planning/meso/${v.meso.code}`}>Ver y activar la rutina</Link>
                </Button>
              </>
            ) : (
              <p className="text-muted-foreground">El plan de esta rutina se borró.</p>
            )}
          </CardContent>
        </Card>
        <Card className="gap-3 py-4 lg:col-span-2">
          <CardHeader className="px-4">
            <CardTitle className="text-base">Lo que puedes lograr si sigues el plan</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5 px-4">
            {v.metrics.length ? (
              <div className="grid gap-5 lg:grid-cols-2">
                {v.metrics.map((m) => (
                  <ProjectionChart key={m.key} label={m.label} unit={m.unit} curve={m.curve} real={m.real} shortWeeks={a.shortWeeks} higherIsBetter={m.higherIsBetter} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Sin tests no hay proyección: anota alguno abajo (por ejemplo, flexiones o sentadillas en 1 minuto).</p>
            )}
            <RetestForm routineId={v.id} metrics={v.metrics.map((m) => m.key)} today={toIsoDay(today())} />
            <p className="text-xs text-muted-foreground">
              Estimación orientativa con ritmos de mejora típicos para tu nivel y tus días por semana (los primeros meses se mejora más rápido). No es una promesa: el sueño, el estrés, las molestias y la constancia
              cambian mucho el resultado. Repite los tests cada 4 semanas para ver si vas por encima o por debajo.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
