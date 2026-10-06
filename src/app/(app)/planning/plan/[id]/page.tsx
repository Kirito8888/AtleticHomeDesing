import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { PlanDayView } from "@/components/training/plan-day-view";
import { Button } from "@/components/ui/button";
import { pageUser } from "@/lib/auth/page";
import { formatDate } from "@/lib/format";
import type { PlanBlock, VariantOption } from "@/lib/planning/plan-import/types";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Día del plan · LifeOS" };

/** Cualquier día del plan importado, también de versiones no activas (para compararlas). */
export default async function PlanDayPage({ params }: PageProps<"/planning/plan/[id]">) {
  const user = await pageUser();
  const { id } = await params;
  const d = await prisma.planDay.findFirst({ where: { id, userId: user.id }, include: { meso: { select: { code: true, name: true, variants: true, variant: true } } } });
  if (!d) notFound();
  const label = d.variant ? (d.meso.variants as VariantOption[]).find((v) => v.code === d.variant || v.code.startsWith(`${d.variant}-`))?.label : null;
  const when = d.date ? formatDate(d.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : d.relDay === 0 ? "Día de la competición" : `${-(d.relDay ?? 0)} días antes de competir`;
  return (
    <>
      <PageHeader
        title={d.title}
        description={`${when}${d.durationMin ? ` · ~${d.durationMin} min` : ""}`}
        action={
          d.sessionId ? (
            <Button asChild size="sm" variant="outline">
              <Link href={`/training/${d.sessionId}`}>Ver sesión</Link>
            </Button>
          ) : null
        }
      />
      {!d.sessionId ? (
        <p className="mb-4 rounded-md border p-3 text-sm text-muted-foreground">
          Este día es de una versión que no está activa{label ? ` (${label})` : ""}. Para pasarlo a tus entrenamientos, elige esa versión en{" "}
          <Link href="/planning#plan" className="underline">
            Planificación → Versiones del plan
          </Link>
          .
        </p>
      ) : null}
      <PlanDayView blocks={d.content as PlanBlock[]} heading={
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
