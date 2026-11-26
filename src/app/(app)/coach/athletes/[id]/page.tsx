import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";

import { FichaEdit } from "@/components/coach/ficha-edit";
import { PlanImportSheet } from "@/components/planning/plan-import-sheet";
import { Button } from "@/components/ui/button";
import { pageUser } from "@/lib/auth/page";
import { addDays, toIsoDay, today } from "@/lib/dates";
import { formatDate, SESSION_TYPE_LABEL } from "@/lib/format";
import { ApiError } from "@/lib/api";
import { ownedFicha } from "@/lib/managed/portfolio";
import { planState } from "@/lib/managed/rules";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Ficha de atleta · Atlenza" };

/** Ficha de una atleta sin cuenta: solo la ve su entrenadora (otra, 404). */
export default async function FichaPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await pageUser();
  if (user.role !== "COACH" && user.role !== "ADMIN") redirect("/");
  const { id } = await params;
  const f = await ownedFicha(user, id).catch((e) => {
    if (e instanceof ApiError) notFound();
    throw e;
  });
  const now = today();
  const todayIso = toIsoDay(now);
  const [lastDay, next, recent] = await Promise.all([
    prisma.planDay.aggregate({ where: { userId: id, date: { not: null } }, _max: { date: true } }),
    prisma.trainingSession.findFirst({ where: { userId: id, status: "PLANNED", date: { gte: now } }, orderBy: { date: "asc" }, select: { date: true, title: true, type: true } }),
    prisma.trainingSession.findMany({ where: { userId: id, date: { gte: addDays(now, -14), lte: addDays(now, 14) } }, orderBy: { date: "desc" }, take: 20, select: { id: true, date: true, title: true, type: true, status: true } }),
  ]);
  const hasPlan = (await prisma.planMeso.count({ where: { userId: id } })) > 0;
  const end = lastDay._max.date ? toIsoDay(lastDay._max.date) : null;
  const ps = planState(end, todayIso);
  const planText = ps.state === "none" ? "Sin plan activo" : ps.state === "ending" ? `⚠ El plan acaba en ${ps.days} ${ps.days === 1 ? "día" : "días"}` : `Plan activo hasta ${formatDate(lastDay._max.date!)}`;
  const meta = [f.discipline, f.category ?? (f.birthYear ? String(f.birthYear) : null), f.group ? `Grupo ${f.group}` : null].filter(Boolean).join(" · ");
  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/coach/athletes" className="inline-flex min-h-11 items-center underline underline-offset-2">
          ← Mis atletas
        </Link>
      </p>
      <header className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight">{f.alias}</h1>
        <p className="text-sm text-muted-foreground">sin cuenta{meta ? ` · ${meta}` : ""}{f.archivedAt ? " · archivada" : ""}</p>
      </header>
      <section aria-label="Ahora" data-testid="ficha-now" className="mb-4 grid gap-3 rounded-lg border border-primary/40 bg-primary/5 p-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Ahora</p>
          <h2 className="text-lg font-semibold leading-tight">{planText}</h2>
          <p className="text-sm text-muted-foreground">{next ? `Próxima: ${formatDate(next.date)} · ${next.title}` : "Sin sesiones planificadas próximas"}</p>
        </div>
        {f.archivedAt ? (
          <p className="text-sm text-muted-foreground">Ficha archivada: reactívala en «Datos de la ficha» para planificar.</p>
        ) : (
          <Button asChild className="h-12 w-full sm:w-auto">
            <Link href="/coach/multi">
              Planificar <ArrowRight />
            </Link>
          </Button>
        )}
      </section>
      {hasPlan ? (
        <Link href={`/coach/athletes/${id}/plan`} className="mb-3 flex min-h-11 items-center justify-between rounded-lg border px-3 text-sm font-medium hover:bg-accent" data-testid="ficha-plan-link">
          Ver el plan completo <ArrowRight className="size-4" aria-hidden />
        </Link>
      ) : null}
      {!f.archivedAt ? (
        <details data-testid="ficha-plan" className="mb-3 rounded-lg border px-3">
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">Plan (subir Word o PDF)</summary>
          <div className="grid gap-2 pb-3 text-sm">
            <p className="text-muted-foreground">Sube el plan de esta atleta (Word de mesociclo, PDF «día a día» o zip). Verás una vista previa y nada se guarda hasta que confirmes.</p>
            <PlanImportSheet athleteId={id} label="Subir plan" />

          </div>
        </details>
      ) : null}
      <details data-testid="ficha-sessions" className="mb-3 rounded-lg border px-3">
        <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">Sesiones (±2 semanas)</summary>
        {recent.length ? (
          <ul className="divide-y pb-2 text-sm">
            {recent.map((s) => (
              <li key={s.id} className="flex min-h-11 items-center justify-between gap-2">
                <span className="min-w-0 truncate">{formatDate(s.date)} · {s.title || SESSION_TYPE_LABEL[s.type]}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{s.status === "COMPLETED" ? "hecha" : s.status === "PLANNED" ? "planificada" : "no hecha"}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="pb-3 text-sm text-muted-foreground">Aún no hay sesiones. Planifica con «Planificar» (semana tipo o plan) para llenarlas.</p>
        )}
      </details>
      <details data-testid="ficha-data" className="mb-3 rounded-lg border px-3">
        <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">Datos de la ficha</summary>
        <div className="pb-3">
          <FichaEdit f={{ id, alias: f.alias, category: f.category, discipline: f.discipline, group: f.group, notes: f.notes, archived: Boolean(f.archivedAt) }} />
        </div>
      </details>
    </>
  );
}
