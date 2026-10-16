import { PageHeader } from "@/components/page-header";
import { TestsNav } from "@/components/training/tests-nav";
import { CurveCompare } from "@/components/training/curve-compare";
import { pageUser } from "@/lib/auth/page";
import { resolveAthleteId } from "@/lib/auth/session";
import { listCurves } from "@/lib/training/reference-curves-service";

export const metadata = { title: "Comparar con curvas · Atlenza" };

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ athlete?: string }> }) {
  const user = await pageUser();
  const sp = await searchParams;
  const athlete = sp.athlete ? await resolveAthleteId(user, sp.athlete, "LOAD") : undefined;
  const curves = await listCurves(user);
  return (
    <>
      <PageHeader title="Comparar con curvas" description="Tus tests frente a curvas publicadas, con su cita." />
      <TestsNav />
      {curves.length ? (
        <CurveCompare curves={curves.map((c) => ({ id: c.id, title: c.title, testKey: c.testKey }))} athlete={athlete && athlete !== user.id ? athlete : undefined} />
      ) : (
        <p className="text-sm text-muted-foreground">Aún no hay curvas. La administración o tu entrenadora pueden añadirlas desde el catálogo, siempre con su cita.</p>
      )}
    </>
  );
}
