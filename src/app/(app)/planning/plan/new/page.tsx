import { PageHeader } from "@/components/page-header";
import { ManualPlanForm } from "@/components/planning/manual-plan";
import { pageUser } from "@/lib/auth/page";
import { today, toIsoDay } from "@/lib/dates";

export const metadata = { title: "Plan propio · Atlenza" };

export default async function NewManualPlanPage() {
  await pageUser();
  return (
    <>
      <PageHeader title="Crear un plan propio" description="Sin PDF ni IA: eliges semanas y días, y rellenas cada día con tus ejercicios." />
      <div className="max-w-xl">
        <ManualPlanForm today={toIsoDay(today())} />
      </div>
    </>
  );
}
