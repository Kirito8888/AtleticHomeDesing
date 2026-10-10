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
import { hasSecondFactor } from "@/lib/auth/admin";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Mi rutina · LifeOS" };

const BAND_LABEL = { bajo: "por debajo de lo habitual", medio: "en la media", alto: "por encima" } as const;

export default async function RoutineDetailPage({ params, searchParams }: PageProps<"/training/routine/[id]">) {
  const user = await pageUser();
  const { id } = await params;
  const v = await routineView(user.id, id);
  if (!v) notFound();
  // v1.8 · Administración (con segundo factor): comparar con la rutina de una cuenta demo
  const admin = user.role === "ADMIN" && (await hasSecondFactor(user.id));
  const demos = admin
    ? await prisma.routineProfile.findMany({ where: { user: { demoExpiresAt: { not: null } } }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, userId: true, user: { select: { name: true } } } })
    : [];
  const demoId = (await searchParams).demo;
  const demoPick = typeof demoId === "string" ? demos.find((d) => d.id === demoId) : undefined;
  const demo = demoPick ? await routineView(demoPick.userId, demoPick.id) : null;
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
        {admin && demos.length ? (
          <Card className="gap-3 py-4 lg:col-span-2" aria-label="Comparar con una demo">
            <CardHeader className="px-4">
              <CardTitle className="text-base">Comparar con una demo</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 px-4 text-sm">
              <nav aria-label="Cuentas demo" className="flex flex-wrap gap-1.5">
                {demos.map((d) => (
                  <Link key={d.id} href={`?demo=${d.id}`} aria-current={d.id === demoPick?.id ? "true" : undefined} className={d.id === demoPick?.id ? "rounded-full border border-primary bg-primary/10 px-3 py-1 text-xs" : "rounded-full border px-3 py-1 text-xs"}>
                    {d.user.name ?? "Demo"}
                  </Link>
                ))}
              </nav>
              {demo ? (
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="py-1 pr-2 font-medium"></th>
                      <th className="py-1 pr-2 font-medium">Esta rutina</th>
                      <th className="py-1 font-medium">Demo</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b">
                      <td className="py-1 pr-2">Perfil</td>
                      <td className="py-1 pr-2">
                        {p.archetype} · {p.level}
                      </td>
                      <td className="py-1">
                        {demo.profile.archetype} · {demo.profile.level}
                      </td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-1 pr-2">Días / min</td>
                      <td className="py-1 pr-2">
                        {a.weekdays.length} × {a.minutes}
                      </td>
                      <td className="py-1">
                        {demo.answers.weekdays.length} × {demo.answers.minutes}
                      </td>
                    </tr>
                    {[...new Set([...v.metrics.map((m) => m.key), ...demo.metrics.map((m) => m.key)])].map((k) => {
                      const mine = v.metrics.find((m) => m.key === k);
                      const theirs = demo.metrics.find((m) => m.key === k);
                      const cell = (m: typeof mine) => (m ? `${m.baseline} → ${m.longTerm.expected} ${m.unit}` : "—");
                      return (
                        <tr key={k} className="border-b">
                          <td className="py-1 pr-2">{TESTS[k].label}</td>
                          <td className="py-1 pr-2 tabular-nums">{cell(mine)}</td>
                          <td className="py-1 tabular-nums">{cell(theirs)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <p className="text-muted-foreground">Elige una cuenta demo para ver su perfil y su proyección al lado de esta.</p>
              )}
              <p className="text-xs text-muted-foreground">Solo para administración: lee únicamente cuentas demo (caducan solas).</p>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}
