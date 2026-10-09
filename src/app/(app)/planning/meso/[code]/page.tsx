import Link from "next/link";
import { notFound } from "next/navigation";

import { AiPlanActions, WeekFeedback } from "@/components/ai-plan/ai-plan-actions";
import { DuplicateWeek, WeekTemplates } from "@/components/planning/manual-plan";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { pageUser } from "@/lib/auth/page";
import { overlapDays } from "@/lib/ai-plan/service";
import { compliance } from "@/lib/planning/compliance";
import { today, toIsoDay } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import type { ParsedWeek } from "@/lib/planning/plan-import/types";
import { prisma } from "@/lib/prisma";
import { mesoWeeklyTonnage } from "@/lib/training/plan-vs-done-service";

export const metadata = { title: "Bloque del plan · LifeOS" };

type Section = { title: string | null; text: string };

/** Agrupa los párrafos bajo su encabezado: cada título abre un apartado. */
function sections(items: Section[]) {
  const out: Array<{ title: string; parts: Section[] }> = [];
  for (const it of items) {
    if (it.title) out.push({ title: it.title, parts: it.text ? [{ title: null, text: it.text }] : [] });
    else if (out.length) out.at(-1)!.parts.push(it);
    else out.push({ title: "Introducción", parts: [it] });
  }
  return out.filter((s) => s.parts.length);
}

/** Un bloque del plan importado: objetivos, reglas, semanas y anexos (tabla de RM…). */
export default async function MesoPage({ params }: PageProps<"/planning/meso/[code]">) {
  const user = await pageUser();
  const { code } = await params;
  const meso = await prisma.planMeso.findUnique({
    where: { userId_code: { userId: user.id, code: decodeURIComponent(code) } },
    include: {
      days: { orderBy: [{ date: { sort: "asc", nulls: "last" } }, { relDay: "asc" }], select: { id: true, date: true, relDay: true, title: true, code: true, sessionId: true, week: true } },
      feedback: { select: { week: true } },
    },
  });
  if (!meso) notFound();
  // Cumplimiento: estado de la sesión de cada día activo.
  const sessionStatus = new Map(
    (
      await prisma.trainingSession.findMany({ where: { userId: user.id, id: { in: meso.days.flatMap((d) => (d.sessionId ? [d.sessionId] : [])) } }, select: { id: true, status: true } })
    ).map((x) => [x.id, x.status]),
  );
  const comp = compliance(
    meso.days.map((d) => ({ week: d.week, date: d.date ? toIsoDay(d.date) : null, status: d.sessionId ? (sessionStatus.get(d.sessionId) ?? null) : null })),
    toIsoDay(today()),
  );
  const tonnage = await mesoWeeklyTonnage(user.id, meso.id);
  const isAi = meso.source === "AI";
  const isManual = meso.source === "MANUAL";
  const meta = (meso.meta ?? {}) as { warnings?: string[]; model?: string };
  const overlap = (isAi || isManual || meso.source === "ROUTINE") && meso.status === "DRAFT" ? await overlapDays(user.id, meso.id, toIsoDay(meso.startDate), toIsoDay(meso.endDate)) : 0;
  // Última semana ya terminada sin valorar (planes con IA activos).
  const todayIso = toIsoDay(today());
  const pendingWeek = isAi && meso.status === "ACTIVE"
    ? (meso.weeks as ParsedWeek[])
        .filter((w) => w.number != null && w.end != null && w.end < todayIso && !meso.feedback.some((f) => f.week === w.number))
        .map((w) => w.number!)
        .filter((n) => (meso.weeks as ParsedWeek[]).some((w) => w.number === n + 1))
        .at(-1) ?? null
    : null;
  const intro = sections(meso.intro as Section[]);
  const annexes = sections(meso.annexes as Section[]);
  const weeks = meso.weeks as ParsedWeek[];

  const Block = ({ title, parts, open }: { title: string; parts: Section[]; open?: boolean }) => (
    <details open={open} className="rounded-md border p-3 text-sm">
      <summary className="cursor-pointer font-medium">{title}</summary>
      <div className="mt-2 grid gap-1.5 text-muted-foreground">
        {parts.map((p, i) => (
          <p key={i}>
            {p.title ? <strong className="text-foreground">{p.title}: </strong> : null}
            {p.text}
          </p>
        ))}
      </div>
    </details>
  );

  return (
    <>
      <PageHeader title={`${meso.code} · ${meso.name}`} description={`${formatDate(meso.startDate)}–${formatDate(meso.endDate)}${meso.version ? ` · versión ${meso.version}` : ""}`} />
      <div className="grid gap-4">
        {isAi ? (
          <Card className="gap-3 py-4">
            <CardHeader className="px-4">
              <CardTitle className="text-sm">Plan creado con IA{meta.model && meta.model !== "simulado" ? ` (${meta.model})` : ""}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 px-4">
              <AiPlanActions code={meso.code} status={meso.status} overlapDays={overlap} />
              {meta.warnings?.length ? (
                <details className="text-sm">
                  <summary className="cursor-pointer text-amber-700 dark:text-amber-400">{meta.warnings.length} avisos de la revisión automática</summary>
                  <ul className="mt-1 list-disc pl-4 text-muted-foreground">
                    {meta.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </details>
              ) : null}
              {pendingWeek ? <WeekFeedback code={meso.code} week={pendingWeek} /> : null}
              <p className="text-xs text-muted-foreground">Generado por IA: es una propuesta. Si algo te duele o no encaja, ajústalo o consulta con tu entrenador/a.</p>
            </CardContent>
          </Card>
        ) : null}
        {meso.source === "ROUTINE" ? (
          <Card className="gap-3 py-4">
            <CardHeader className="px-4">
              <CardTitle className="text-sm">Rutina del cuestionario</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 px-4">
              <AiPlanActions code={meso.code} status={meso.status} overlapDays={overlap} canRegenerate={false} />
              <p className="text-xs text-muted-foreground">Creada con tus respuestas y tus tests, sin IA. Cada día tiene versión suave para los días flojos.</p>
            </CardContent>
          </Card>
        ) : null}
        {isManual ? (
          <Card className="gap-3 py-4">
            <CardHeader className="px-4">
              <CardTitle className="text-sm">Plan propio</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 px-4">
              <AiPlanActions code={meso.code} status={meso.status} overlapDays={overlap} canRegenerate={false} />
              <DuplicateWeek code={meso.code} weeks={(meso.weeks as ParsedWeek[]).flatMap((w) => (w.number != null ? [w.number] : []))} />
              <WeekTemplates
                code={meso.code}
                weeks={(meso.weeks as ParsedWeek[]).flatMap((w) => (w.number != null ? [w.number] : []))}
                templates={await prisma.weekTemplate.findMany({ where: { userId: user.id }, orderBy: { name: "asc" }, select: { id: true, name: true } })}
              />
              <p className="text-xs text-muted-foreground">Toca un día para rellenarlo («Editar este día»). Si el plan ya está activo, los cambios llegan a tus sesiones planificadas.</p>
            </CardContent>
          </Card>
        ) : null}
        {intro.length ? (
          <section className="grid gap-2" aria-label="Introducción del bloque">
            {intro.map((s, i) => (
              <Block key={i} title={s.title} parts={s.parts} open={i === 0} />
            ))}
          </section>
        ) : null}

        {comp.total.planned ? (
          <Card className="gap-3 py-4">
            <CardHeader className="px-4">
              <CardTitle className="text-sm">
                Cumplimiento{comp.total.pct != null ? `: ${comp.total.pct} %` : ""}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4">
              <table className="w-full text-sm tabular-nums" aria-label="Cumplimiento por semana">
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left font-normal">Semana</th>
                    <th className="text-right font-normal">Hechos</th>
                    <th className="text-right font-normal">Saltados</th>
                    <th className="text-right font-normal">Perdidos</th>
                    <th className="text-right font-normal">Pendientes</th>
                    <th className="text-right font-normal">%</th>
                  </tr>
                </thead>
                <tbody>
                  {comp.weeks.map((w) => (
                    <tr key={w.week}>
                      <td>S{w.week}</td>
                      <td className="text-right">{w.done}</td>
                      <td className="text-right">{w.skipped}</td>
                      <td className={w.missed ? "text-right font-medium" : "text-right"}>{w.missed}</td>
                      <td className="text-right text-muted-foreground">{w.pending}</td>
                      <td className="text-right">{w.pct ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-muted-foreground">Perdidos: días que ya pasaron y siguen planificados. El % cuenta solo los días que ya tocaban.</p>
              {tonnage.length ? (
                <table className="mt-3 w-full text-sm tabular-nums" aria-label="Tonelaje plan frente a hecho">
                  <thead className="text-xs text-muted-foreground">
                    <tr>
                      <th className="text-left font-normal">Semana</th>
                      <th className="text-right font-normal">Tonelaje plan</th>
                      <th className="text-right font-normal">Hecho</th>
                      <th className="text-right font-normal">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tonnage.map((w) => (
                      <tr key={w.week}>
                        <td>S{w.week}</td>
                        <td className="text-right">{Math.round(w.planned).toLocaleString("es-ES")} kg</td>
                        <td className="text-right">{Math.round(w.done).toLocaleString("es-ES")} kg</td>
                        <td className="text-right">{w.planned ? Math.round((w.done / w.planned) * 100) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
            </CardContent>
          </Card>
        ) : null}
        <Card className="gap-3 py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-sm">Semanas y días</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 px-4 text-sm">
            {weeks.map((w, i) => (
              <div key={i}>
                <div className="font-medium">
                  {w.variant ? `Versión ${w.variant} · ` : ""}
                  {w.number ? `Semana ${w.number}` : "Semana"}
                  {w.title ? ` · ${w.title}` : ""}
                </div>
                {w.text ? <p className="text-xs text-muted-foreground">{w.text}</p> : null}
              </div>
            ))}
            <ul className="grid gap-1 border-t pt-3">
              {meso.days.map((d) => (
                <li key={d.id}>
                  <Link href={isManual ? `/planning/plan/${d.id}` : d.sessionId ? `/training/${d.sessionId}` : `/planning/plan/${d.id}`} className="flex gap-2 hover:underline">
                    <span className="w-20 shrink-0 text-xs text-muted-foreground capitalize">
                      {d.date ? formatDate(d.date, { weekday: "short", day: "numeric", month: "short" }) : d.relDay === 0 ? "Día D" : `D${d.relDay}`}
                    </span>
                    <span className="min-w-0 truncate">
                      {d.sessionId ? "○ " : ""}
                      {d.title}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">○ = está en tus entrenamientos (versión activa).</p>
          </CardContent>
        </Card>

        {annexes.length ? (
          <section className="grid gap-2" aria-label="Anexos">
            <h2 className="text-sm font-semibold">Anexos</h2>
            {annexes.map((s, i) => (
              <Block key={i} title={s.title} parts={s.parts} />
            ))}
          </section>
        ) : null}
      </div>
    </>
  );
}
