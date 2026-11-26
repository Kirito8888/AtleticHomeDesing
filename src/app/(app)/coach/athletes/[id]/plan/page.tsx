import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { PlanDayView } from "@/components/training/plan-day-view";
import { pageUser } from "@/lib/auth/page";
import { ApiError } from "@/lib/api";
import { toIsoDay, today } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { ownedFicha } from "@/lib/managed/portfolio";
import type { PlanBlock } from "@/lib/planning/plan-import/types";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Plan de la atleta · Atlenza" };

type Section = { title: string | null; text: string };

/** El plan completo de una ficha: introducción, semanas con cada sesión y su tabla de ejercicios, y anexos. Solo su entrenadora. */
export default async function FichaPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await pageUser();
  if (user.role !== "COACH" && user.role !== "ADMIN") redirect("/");
  const { id } = await params;
  const f = await ownedFicha(user, id).catch((e) => {
    if (e instanceof ApiError) notFound();
    throw e;
  });
  const mesos = await prisma.planMeso.findMany({ where: { userId: id }, orderBy: { startDate: "asc" }, select: { id: true, code: true, name: true, startDate: true, endDate: true, intro: true, annexes: true } });
  const days = await prisma.planDay.findMany({ where: { userId: id, mesoId: { in: mesos.map((m) => m.id) } }, orderBy: [{ date: "asc" }, { key: "asc" }] });
  const todayIso = toIsoDay(today());
  return (
    <>
      <p className="mb-2 text-sm">
        <Link href={`/coach/athletes/${id}`} className="inline-flex min-h-11 items-center underline underline-offset-2">
          ← {f.alias}
        </Link>
      </p>
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Plan de {f.alias}</h1>
      {!mesos.length ? <p className="rounded-lg border p-4 text-sm text-muted-foreground" data-testid="plan-empty">Todavía no hay ningún plan importado. Súbelo desde la ficha («Plan»).</p> : null}
      {mesos.map((m) => {
        const mine = days.filter((d) => d.mesoId === m.id);
        const weeks = [...new Set(mine.map((d) => d.week ?? 0))].sort((a, b) => a - b);
        const intro = (m.intro as Section[] | null) ?? [];
        const annexes = (m.annexes as Section[] | null) ?? [];
        return (
          <section key={m.id} aria-label={m.name} className="mt-4 grid gap-3" data-testid="plan-meso">
            <div>
              <h2 className="text-lg font-semibold">{m.code} · {m.name}</h2>
              <p className="text-sm text-muted-foreground">{formatDate(m.startDate)} – {formatDate(m.endDate)} · {mine.length} sesiones</p>
            </div>
            {intro.length ? (
              <details className="rounded-lg border px-3" data-testid="plan-intro">
                <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">Cómo leer el plan</summary>
                <div className="grid gap-3 pb-3 text-sm">
                  {intro.map((s, i) => (
                    <div key={i}>
                      {s.title ? <h3 className="font-medium">{s.title}</h3> : null}
                      <p className="whitespace-pre-line text-muted-foreground">{s.text}</p>
                    </div>
                  ))}
                </div>
              </details>
            ) : null}
            {weeks.map((w) => {
              const wd = mine.filter((d) => (d.week ?? 0) === w);
              const current = wd.some((d) => d.date && toIsoDay(d.date) >= todayIso) && !weeks.some((x) => x < w && mine.some((d) => (d.week ?? 0) === x && d.date && toIsoDay(d.date) >= todayIso));
              return (
                <details key={w} open={current} className="rounded-lg border px-3" data-testid="plan-week">
                  <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 text-sm font-medium">
                    <span>Semana {w || "—"}</span>
                    <span className="text-xs font-normal text-muted-foreground">{wd[0]?.weekTitle?.split(" · ").slice(-1)[0] ?? ""}</span>
                  </summary>
                  <div className="pt-2">
                    {wd.map((d) => (
                      <PlanDayView key={d.id} blocks={d.content as PlanBlock[]} heading={`${d.date ? formatDate(d.date, { weekday: "long", day: "numeric", month: "long" }) : ""} · ${d.title}`} />
                    ))}
                  </div>
                </details>
              );
            })}
            {annexes.length ? (
              <details className="rounded-lg border px-3" data-testid="plan-annexes">
                <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">Anexos</summary>
                <div className="grid gap-3 pb-3 text-sm">
                  {annexes.map((s, i) => (
                    <div key={i}>
                      {s.title ? <h3 className="font-medium">{s.title}</h3> : null}
                      <p className="whitespace-pre-line text-muted-foreground">{s.text}</p>
                    </div>
                  ))}
                </div>
              </details>
            ) : null}
          </section>
        );
      })}
    </>
  );
}
