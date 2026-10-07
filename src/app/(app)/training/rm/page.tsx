import { PageHeader } from "@/components/page-header";
import { RmManager } from "@/components/training/rm-manager";
import { pageUser } from "@/lib/auth/page";
import { currentRms, unlinkedPlanExercises } from "@/lib/training/rm-service";
import { exerciseOptions } from "@/lib/training/session-queries";

export const metadata = { title: "Mis RM · LifeOS" };

/** Tabla de RM, importación desde el plan, serie de test, APRE y enlace de ejercicios del plan. */
export default async function RmPage() {
  const user = await pageUser();
  const [rms, exercises, unlinked] = await Promise.all([currentRms(user.id), exerciseOptions(user.id), unlinkedPlanExercises(user.id)]);
  return (
    <>
      <PageHeader title="Mis RM" description="Con tu tabla de RM, el plan del día te dice los kilos de cada serie." />
      <RmManager rms={rms} exercises={exercises.map((e) => ({ id: e.id, name: e.name }))} unlinked={unlinked} />
    </>
  );
}
