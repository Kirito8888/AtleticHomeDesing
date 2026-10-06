import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { SessionForm } from "@/components/training/session-form";
import { pageUser } from "@/lib/auth/page";
import { prisma } from "@/lib/prisma";
import { isEditableType, sessionToFormInitial } from "@/lib/training/form-initial";
import { exerciseOptions, formSessionInclude } from "@/lib/training/session-queries";

export const metadata = { title: "Editar sesión · LifeOS" };

export default async function EditSessionPage({ params }: PageProps<"/training/[id]/edit">) {
  const user = await pageUser();
  const { id } = await params;
  const [session, exercises, profile] = await Promise.all([
    prisma.trainingSession.findFirst({ where: { id, userId: user.id }, include: formSessionInclude }),
    exerciseOptions(user.id),
    prisma.athleteProfile.findUnique({ where: { userId: user.id }, select: { bodyWeightKg: true } }),
  ]);
  if (!session || !isEditableType(session.type)) notFound();
  const initial = sessionToFormInitial(session);
  return (
    <>
      <PageHeader title="Editar sesión" description="Al guardar se recalculan el TSS, las marcas personales y la curva de carga." />
      <SessionForm
        exercises={exercises}
        defaultDate={initial.date}
        bodyWeightKg={session.strength?.bodyWeightKg ?? profile?.bodyWeightKg ?? null}
        initial={initial}
        sessionId={session.id}
      />
    </>
  );
}
