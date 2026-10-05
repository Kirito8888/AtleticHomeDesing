import { CoachLinks, CustomExerciseForm, NutritionGoalForm, ProfileForm, ThresholdForm } from "@/components/settings/settings-forms";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { pageUser } from "@/lib/auth/page";
import { today, toIsoDay } from "@/lib/dates";
import { formatDate, formatDuration } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Ajustes · LifeOS" };

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card className="gap-4 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-base">{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="px-4">{children}</CardContent>
    </Card>
  );
}

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const user = await pageUser();
  const { welcome } = await searchParams;
  const todayIso = toIsoDay(today());
  const [me, thresholds, goal, asCoach, asAthlete, customExercises] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: user.id }, include: { athleteProfile: true } }),
    prisma.thresholdHistory.findMany({ where: { userId: user.id }, orderBy: { effectiveFrom: "desc" }, take: 5 }),
    prisma.nutritionGoal.findFirst({ where: { userId: user.id }, orderBy: { effectiveFrom: "desc" } }),
    prisma.coachAthlete.findMany({ where: { coachId: user.id }, include: { athlete: { select: { name: true, email: true } } } }),
    prisma.coachAthlete.findMany({ where: { athleteId: user.id }, include: { coach: { select: { name: true, email: true } } } }),
    prisma.exercise.findMany({ where: { userId: user.id }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const p = me.athleteProfile;

  return (
    <>
      <PageHeader title="Ajustes" />
      {welcome ? (
        <p role="status" className="mb-4 rounded-md border p-3 text-sm">
          ¡Bienvenido/a! Completa tu perfil y tus umbrales: con ellos el TSS se calcula a partir de tu FC y tus ritmos.
        </p>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Perfil">
          <ProfileForm
            initial={{
              name: me.name ?? "",
              sex: p?.sex ?? null,
              birthDate: p?.birthDate ? toIsoDay(p.birthDate) : null,
              heightCm: p?.heightCm ?? null,
              bodyWeightKg: p?.bodyWeightKg ?? null,
              primaryDiscipline: p?.primaryDiscipline ?? null,
              disciplines: p?.disciplines ?? [],
              ctlTimeConstant: p?.ctlTimeConstant ?? 42,
              atlTimeConstant: p?.atlTimeConstant ?? 7,
            }}
          />
        </Section>
        <Section title="Umbrales fisiológicos" description="Se guardan con fecha: cada sesión usa los vigentes en su día.">
          <ThresholdForm today={todayIso} />
          {thresholds.length ? (
            <table className="mt-4 w-full text-xs tabular-nums">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="text-left font-normal">Desde</th>
                  <th className="text-right font-normal">FCmáx</th>
                  <th className="text-right font-normal">Reposo</th>
                  <th className="text-right font-normal">LTHR</th>
                  <th className="text-right font-normal">Ritmo</th>
                </tr>
              </thead>
              <tbody>
                {thresholds.map((t) => (
                  <tr key={t.id}>
                    <td>{formatDate(t.effectiveFrom, { day: "numeric", month: "short", year: "numeric" })}</td>
                    <td className="text-right">{t.hrMax ?? "—"}</td>
                    <td className="text-right">{t.hrRest ?? "—"}</td>
                    <td className="text-right">{t.lthr ?? "—"}</td>
                    <td className="text-right">{t.thresholdPaceSecPerKm ? formatDuration(t.thresholdPaceSecPerKm) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </Section>
        <Section title="Objetivo nutricional diario">
          <NutritionGoalForm today={todayIso} initial={goal} />
        </Section>
        <Section title="Entrenador / atletas" description="El entrenador solo ve datos deportivos; nunca finanzas, nutrición ni estudio.">
          <CoachLinks
            isCoach={user.role === "COACH" || user.role === "ADMIN"}
            asCoach={asCoach.map((l) => ({ id: l.id, status: l.status, canPlan: l.canPlan, other: l.athlete }))}
            asAthlete={asAthlete.map((l) => ({ id: l.id, status: l.status, canPlan: l.canPlan, other: l.coach }))}
          />
        </Section>
        <Section title="Mis ejercicios" description="Se suman al catálogo global en el registro de fuerza.">
          <CustomExerciseForm />
          {customExercises.length ? (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {customExercises.map((e) => (
                <li key={e.id} className="rounded-full border px-3 py-1 text-xs">
                  {e.name}
                </li>
              ))}
            </ul>
          ) : null}
        </Section>
      </div>
    </>
  );
}
