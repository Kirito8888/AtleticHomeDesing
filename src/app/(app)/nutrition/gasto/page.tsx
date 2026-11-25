import { ExpenditurePanel } from "@/components/nutrition/expenditure-panel";
import { PageHeader } from "@/components/page-header";
import { pageUser } from "@/lib/auth/page";
import { expenditureFor } from "@/lib/nutrition/expenditure-service";

export const metadata = { title: "Gasto energético · Atlenza" };

/** v3.2 · Bloque M (V3-N01): gasto estimado con tu comida y tu peso. Determinista, sin IA y solo para ti. */
export default async function ExpenditurePage() {
  const user = await pageUser();
  const view = await expenditureFor(user.id);
  return (
    <>
      <PageHeader
        title="Gasto energético"
        description="Lo que gastas de verdad, calculado con lo que comes y cómo cambia tu peso en las últimas 4 semanas. Sin IA y solo para ti: ni la entrenadora ni la IA ven tu peso."
      />
      <ExpenditurePanel view={view} />
    </>
  );
}
