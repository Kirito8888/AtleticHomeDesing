import Link from "next/link";
import { notFound } from "next/navigation";

import { AiPlanActions, WeekFeedback } from "@/components/ai-plan/ai-plan-actions";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { pageUser } from "@/lib/auth/page";
import { overlapDays } from "@/lib/ai-plan/service";
import { today, toIsoDay } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import type { ParsedWeek } from "@/lib/planning/plan-import/types";
import { prisma } from "@/lib/prisma";

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
      days: { orderBy: [{ date: { sort: "asc", nulls: "last" } }, { relDay: "asc" }], select: { id: true, date: true, relDay: true, title: true, code: true, sessionId: true } },
      feedback: { select: { week: true } },
    },
  });
  if (!meso) notFound();
  const isAi = meso.source === "AI";
  const meta = (meso.meta ?? {}) as { warnings?: string[]; model?: string };
  const overlap = isAi && meso.status === "DRAFT" ? await overlapDays(user.id, meso.id, toIsoDay(meso.startDate), toIsoDay(meso.endDate)) : 0;
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
        {intro.length ? (
          <section className="grid gap-2" aria-label="Introducción del bloque">
            {intro.map((s, i) => (
              <Block key={i} title={s.title} parts={s.parts} open={i === 0} />
            ))}
          </section>
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
                  <Link href={d.sessionId ? `/training/${d.sessionId}` : `/planning/plan/${d.id}`} className="flex gap-2 hover:underline">
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
