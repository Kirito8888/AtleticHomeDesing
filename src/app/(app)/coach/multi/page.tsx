import Link from "next/link";

import { MultiPlan } from "@/components/coach/multi-plan";
import { PageHeader } from "@/components/page-header";
import { pageUser } from "@/lib/auth/page";
import { multiPlanOverview } from "@/lib/coach/multi-plan";
import { toIsoDay, today } from "@/lib/dates";

export const metadata = { title: "Planificar varios atletas · Atlenza" };

/** v2.0 B · Copiar una semana tipo o un plan propio a varios atletas, con simulación «qué pasa si». */
export default async function MultiPlanPage() {
  const user = await pageUser();
  const o = await multiPlanOverview(user);
  return (
    <>
      <PageHeader title="Planificar varios atletas" description="Copia una semana tipo o un plan propio como borrador. Nada se activa sin que la atleta lo acepte." />
      <p className="mb-3 text-sm">
        <Link href="/coach" className="underline underline-offset-2">
          ← Mis atletas
        </Link>
      </p>
      <MultiPlan athletes={o.athletes} templates={o.templates} plans={o.plans} defaultStart={toIsoDay(today())} />
    </>
  );
}
