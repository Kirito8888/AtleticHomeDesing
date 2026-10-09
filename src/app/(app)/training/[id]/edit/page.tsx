import { notFound } from "next/navigation";

import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { SessionForm } from "@/components/training/session-form";
import { pageUser } from "@/lib/auth/page";
import { planDayForSession } from "@/lib/planning/plan-import/service";
import { prisma } from "@/lib/prisma";
import { dayView } from "@/lib/ai-plan/day-view";
import { planToBlocks } from "@/lib/training/plan-to-form";
import { autoregContext, rmContext } from "@/lib/training/rm-service";
import { isEditableType, sessionToFormInitial } from "@/lib/training/form-initial";
import { exerciseOptions, formSessionInclude } from "@/lib/training/session-queries";

export const metadata = { title: "Editar sesión · LifeOS" };

export default async function EditSessionPage({ params }: PageProps<"/training/[id]/edit">) {
  const user = await pageUser();
  const autoreg = await autoregContext(user.id);
  const { id } = await params;
  const [session, exercises, profile] = await Promise.all([
    prisma.trainingSession.findFirst({ where: { id, userId: user.id }, include: formSessionInclude }),
    exerciseOptions(user.id),
    prisma.athleteProfile.findUnique({ where: { userId: user.id }, select: { bodyWeightKg: true } }),
  ]);
  // Una sesión planificada de cualquier tipo (p. ej. MIXED del plan importado) se puede registrar como hecha.
  const planned = session?.status === "PLANNED";
  if (!session || (!isEditableType(session.type) && !planned)) notFound();
  let initial = sessionToFormInitial(session);
  // Registrar desde el plan: series, reps y kg (desde %RM) del plan del día precargados.
  let unmatched: string[] = [];
  const plan = planned ? await planDayForSession(user.id, session.id) : null;
  if (plan && !session.strength?.sets.length) {
    const ctx = await rmContext(user.id);
    const r = planToBlocks(dayView(plan).blocks, ctx);
    unmatched = r.unmatched;
    if (r.blocks.length) {
      initial = {
        ...initial,
        type: plan.type === "TECHNICAL" || plan.type === "TRACK" ? plan.type : "STRENGTH",
        mixed: plan.type === "MIXED",
        blocks: r.blocks.map((b, i) => ({ key: `plan${i}`, exerciseId: b.exerciseId!, sets: b.sets })),
      };
    }
  }
  return (
    <>
      <PageHeader
        title={planned ? "Registrar sesión" : "Editar sesión"}
        description={
          planned
            ? "Anota lo que hiciste y desmarca «Guardar como planificada». El plan del día sigue enlazado a la sesión."
            : "Al guardar se recalculan el TSS, las marcas personales y la curva de carga."
        }
      />
      {unmatched.length ? (
        <p role="status" className="mb-4 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          No precargados (no están enlazados con tu catálogo): {unmatched.join(", ")}.{" "}
          <Link href="/training/rm" className="font-medium text-foreground underline underline-offset-2">
            Enlázalos una vez en Mis RM
          </Link>{" "}
          y la próxima vez saldrán solos.
        </p>
      ) : null}
      <SessionForm
        exercises={exercises}
        defaultDate={initial.date}
        bodyWeightKg={session.strength?.bodyWeightKg ?? profile?.bodyWeightKg ?? null}
        initial={initial}
        sessionId={session.id}
        autoreg={autoreg}
      />
    </>
  );
}
