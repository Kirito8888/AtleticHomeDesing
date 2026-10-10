import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { DayActions } from "@/components/ai-plan/day-actions";
import { PlanDayView } from "@/components/training/plan-day-view";
import { Button } from "@/components/ui/button";
import { pageUser } from "@/lib/auth/page";
import { dayView } from "@/lib/ai-plan/day-view";
import { annotateKg } from "@/lib/training/plan-to-form";
import { rmContext } from "@/lib/training/rm-service";
import { RuleAlerts } from "@/components/rules/rule-alerts";
import { today, toIsoDay } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { rulesToday } from "@/lib/rules/rules-service";
import type { VariantOption } from "@/lib/planning/plan-import/types";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Día del plan · Atlenza" };

/** Cualquier día del plan importado, también de versiones no activas (para compararlas). */
export default async function PlanDayPage({ params }: PageProps<"/planning/plan/[id]">) {
  const user = await pageUser();
  const { id } = await params;
  const d = await prisma.planDay.findFirst({ where: { id, userId: user.id }, include: { meso: { select: { code: true, name: true, variants: true, variant: true, status: true, source: true } } } });
  if (!d) notFound();
  const rmCtx = await rmContext(user.id);
  const todayIso = toIsoDay(today());
  const alerts = d.date && toIsoDay(d.date) === todayIso ? await rulesToday(user.id, todayIso) : [];
  const label = d.variant ? (d.meso.variants as VariantOption[]).find((v) => v.code === d.variant || v.code.startsWith(`${d.variant}-`))?.label : null;
  const when = d.date ? formatDate(d.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : d.relDay === 0 ? "Día de la competición" : `${-(d.relDay ?? 0)} días antes de competir`;
  return (
    <>
      <PageHeader
        title={d.title}
        description={`${when}${d.durationMin ? ` · ~${d.durationMin} min` : ""}`}
        action={
          <div className="flex gap-2">
            {d.meso.source === "MANUAL" ? (
              <Button asChild size="sm">
                <Link href={`/planning/plan/${d.id}/edit`}>Editar este día</Link>
              </Button>
            ) : null}
            {d.sessionId ? (
              <Button asChild size="sm" variant="outline">
                <Link href={`/training/${d.sessionId}`}>Ver sesión</Link>
              </Button>
            ) : null}
          </div>
        }
      />
      {!d.sessionId && d.meso.source !== "MANUAL" ? (
        <p className="mb-4 rounded-md border p-3 text-sm text-muted-foreground">
          Este día es de una versión que no está activa{label ? ` (${label})` : ""}. Para pasarlo a tus entrenamientos, elige esa versión en{" "}
          <Link href="/planning#plan" className="underline">
            Planificación → Versiones del plan
          </Link>
          .
        </p>
      ) : null}
      <RuleAlerts alerts={alerts} />
      {d.taperPct ? (
        <p role="status" className="mb-3 rounded-md border border-primary/40 bg-primary/5 p-2 text-sm">
          Afinamiento −{d.taperPct} % de series (antes de competir). El plan original se conserva: lo ves en «Cómo lo hago».
        </p>
      ) : null}
      <p className="mb-2 text-right text-xs">
        <Link href={`/print/plan/${d.id}`} className="underline underline-offset-2">
          Versión para imprimir
        </Link>
      </p>
      {(() => {
        const v = dayView(d);
        return d.meso.status === "DRAFT" ? null : <DayActions dayId={d.id} mode={d.mode} hasLight={v.hasLight} swappable={v.swappable} />;
      })()}
      <PlanDayView blocks={annotateKg(dayView(d).blocks, rmCtx.rms, rmCtx.aliases, rmCtx.step)} heading={
          <>
            <Link href={`/planning/meso/${d.meso.code}`} className="underline-offset-2 hover:underline">
              {d.meso.code} · {d.meso.name}
            </Link>{" "}
            · {d.code}
            {d.weekTitle ? ` · ${d.weekTitle}` : ""}
          </>
        } />
    </>
  );
}
