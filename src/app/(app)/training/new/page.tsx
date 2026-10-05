import { PageHeader } from "@/components/page-header";
import { SessionForm } from "@/components/training/session-form";
import { pageUser } from "@/lib/auth/page";
import { today, toIsoDay } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Nueva sesión · LifeOS" };

export default async function NewSessionPage({ searchParams }: PageProps<"/training/new">) {
  const user = await pageUser();
  const { type } = await searchParams;
  const [exercises, profile] = await Promise.all([
    prisma.exercise.findMany({
      where: { OR: [{ userId: null }, { userId: user.id }] },
      orderBy: { name: "asc" },
      select: { id: true, name: true, bodyweightFactor: true },
    }),
    prisma.athleteProfile.findUnique({ where: { userId: user.id }, select: { bodyWeightKg: true } }),
  ]);
  const initialType = type === "TECHNICAL" || type === "TRACK" ? type : "STRENGTH";
  return (
    <>
      <PageHeader title="Nueva sesión" description="Registra series, intentos o tu sesión de pista." />
      <SessionForm exercises={exercises} defaultDate={toIsoDay(today())} bodyWeightKg={profile?.bodyWeightKg ?? null} initialType={initialType} />
    </>
  );
}
