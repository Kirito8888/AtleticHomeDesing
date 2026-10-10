import { PageHeader } from "@/components/page-header";
import { WelcomeWizard } from "@/components/settings/welcome-wizard";
import { Card, CardContent } from "@/components/ui/card";
import type { ModuleKey } from "@/components/layout/nav-items";
import { pageUser } from "@/lib/auth/page";
import { toIsoDay } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { getPrefs } from "@/lib/rules/prefs-service";

export const metadata = { title: "Bienvenida · LifeOS" };

/** v1.8 · Primer uso guiado (3 pasos, todo opcional y modificable en Ajustes). */
export default async function WelcomePage() {
  const user = await pageUser();
  const [u, prefs] = await Promise.all([prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { name: true, athleteProfile: { select: { sex: true, birthDate: true, disciplines: true } } } }), getPrefs(user.id)]);
  return (
    <>
      <PageHeader title="Bienvenida" description="Tres pasos para que LifeOS se adapte a ti. Todo se puede cambiar después." />
      <Card className="max-w-xl py-4">
        <CardContent className="px-4">
          <WelcomeWizard
            initial={{
              name: u.name ?? "",
              sex: u.athleteProfile?.sex ?? null,
              birthDate: u.athleteProfile?.birthDate ? toIsoDay(u.athleteProfile.birthDate) : "",
              disciplines: (u.athleteProfile?.disciplines ?? []) as never,
              hidden: prefs.hiddenModules as ModuleKey[],
            }}
          />
        </CardContent>
      </Card>
    </>
  );
}
