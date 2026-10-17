import { PageHeader } from "@/components/page-header";
import { FvHistory } from "@/components/training/fv-history";
import { FvProfileForm } from "@/components/training/fv-profile-form";
import { TestsNav } from "@/components/training/tests-nav";
import { pageUser } from "@/lib/auth/page";
import { today, toIsoDay } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { listFvSeries } from "@/lib/training/fv-profile-service";

export const metadata = { title: "Perfil F-V · Atlenza" };

export default async function FvProfilePage() {
  const user = await pageUser();
  const [items, profile] = await Promise.all([listFvSeries(user.id), prisma.athleteProfile.findUnique({ where: { userId: user.id }, select: { bodyWeightKg: true } })]);
  return (
    <>
      <PageHeader
        title="Perfil fuerza-velocidad"
        description="Saltos SJ con 2–4 cargas (Samozino et al., 2008; óptimo según Samozino et al., 2012). Es un dato tuyo: no se envía a la IA ni a la entrenadora."
      />
      <TestsNav />
      <div className="grid max-w-xl gap-6">
        <FvProfileForm today={toIsoDay(today())} defaultMassKg={profile?.bodyWeightKg ?? null} />
        <section aria-labelledby="fv-hist" className="grid gap-3">
          <h2 id="fv-hist" className="text-base font-semibold">Histórico</h2>
          <FvHistory items={items} />
        </section>
      </div>
    </>
  );
}
