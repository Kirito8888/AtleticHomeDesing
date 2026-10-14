import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { CurveForm } from "@/components/training/curve-form";
import { DeleteCurve } from "@/components/training/delete-curve";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { pageUser } from "@/lib/auth/page";
import { listCurves } from "@/lib/training/reference-curves-service";

export const metadata = { title: "Curvas de referencia · Atlenza" };

export default async function CurvesPage() {
  const user = await pageUser();
  const curves = await listCurves(user);
  const canAdd = user.role === "ADMIN" || user.role === "COACH";
  return (
    <>
      <PageHeader title="Curvas de referencia" description="Solo curvas con estudio, autores, año y cita." />
      <p className="mb-3 text-sm">
        <Link href="/training/tests/comparar" className="underline underline-offset-4">Comparar mis tests</Link>
      </p>
      <div className="grid gap-4">
        {curves.length ? (
          curves.map((c) => (
            <Card key={c.id} className="gap-2 py-4">
              <CardHeader className="px-4">
                <CardTitle className="text-sm">{c.title} <span className="font-normal text-muted-foreground">· {c.testKey} ({c.unit}){c.global ? " · global" : " · mía"}</span></CardTitle>
              </CardHeader>
              <CardContent className="grid gap-1 px-4 text-sm">
                <p className="break-words">{c.citation}</p>
                {c.doi ? <p className="break-all text-muted-foreground">DOI {c.doi}</p> : null}
                <p className="text-muted-foreground">{c.points.length} puntos · {c.points[0].x}–{c.points[c.points.length - 1].x} años</p>
                {c.mine ? <DeleteCurve id={c.id} /> : null}
              </CardContent>
            </Card>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">El catálogo está vacío.</p>
        )}
        {canAdd ? (
          <Card className="gap-3 py-4">
            <CardHeader className="px-4"><CardTitle className="text-base">Añadir curva</CardTitle></CardHeader>
            <CardContent className="px-4">
              <p className="mb-3 text-xs text-muted-foreground">Copia los valores de la tabla del artículo. {user.role === "ADMIN" ? "Será visible para todas." : "Solo la verás tú."}</p>
              <CurveForm />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}
