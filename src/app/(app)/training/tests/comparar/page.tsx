import Link from "next/link";

import { PageHeader } from "@/components/page-header";
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
      <p className="mb-3 text-sm">
        <Link href="/training/tests" className="underline underline-offset-4">← Tests físicos</Link>
        {" · "}
        <Link href="/training/tests/curvas" className="underline underline-offset-4">Catálogo de curvas</Link>
      </p>
      {curves.length ? (
        <CurveCompare curves={curves.map((c) => ({ id: c.id, title: c.title, testKey: c.testKey }))} athlete={athlete && athlete !== user.id ? athlete : undefined} />
      ) : (
        <p className="text-sm text-muted-foreground">Aún no hay curvas. La administración o tu entrenadora pueden añadirlas desde el catálogo, siempre con su cita.</p>
      )}
    </>
  );
}
