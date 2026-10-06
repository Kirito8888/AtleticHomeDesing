import Link from "next/link";
import { Repeat } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { SessionForm } from "@/components/training/session-form";
import { Button } from "@/components/ui/button";
import { pageUser } from "@/lib/auth/page";
import { formatDate } from "@/lib/format";
import { today, toIsoDay } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { sessionToFormInitial } from "@/lib/training/form-initial";
import { exerciseOptions, formSessionInclude } from "@/lib/training/session-queries";

export const metadata = { title: "Nueva sesión · LifeOS" };

export default async function NewSessionPage({ searchParams }: PageProps<"/training/new">) {
  const user = await pageUser();
  const { type, repeat } = await searchParams;
  const [exercises, profile, lastStrength] = await Promise.all([
    exerciseOptions(user.id),
    prisma.athleteProfile.findUnique({ where: { userId: user.id }, select: { bodyWeightKg: true } }),
    prisma.trainingSession.findFirst({
      where: { userId: user.id, type: "STRENGTH", status: "COMPLETED" },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      include: formSessionInclude,
    }),
  ]);
  const todayIso = toIsoDay(today());
  // "Repetir": mismas series y pesos que la última sesión de fuerza, con fecha de hoy.
  const initial =
    repeat === "strength" && lastStrength
      ? sessionToFormInitial(lastStrength, { date: todayIso, planned: false, rpe: null, notes: "" })
      : undefined;
  const initialType = type === "TECHNICAL" || type === "TRACK" ? type : "STRENGTH";
  return (
    <>
      <PageHeader
        title="Nueva sesión"
        description={
          initial
            ? `Copia de la sesión de fuerza del ${formatDate(lastStrength!.date, { day: "numeric", month: "long" })}: ajusta pesos y repeticiones.`
            : "Registra series, intentos o tu sesión de pista."
        }
        action={
          lastStrength && !initial ? (
            <Button asChild variant="outline" size="sm">
              <Link href="/training/new?repeat=strength">
                <Repeat /> Repetir última fuerza
              </Link>
            </Button>
          ) : undefined
        }
      />
      <SessionForm
        key={initial ? "repeat" : "new"}
        exercises={exercises}
        defaultDate={todayIso}
        bodyWeightKg={profile?.bodyWeightKg ?? null}
        initialType={initialType}
        initial={initial}
      />
    </>
  );
}
