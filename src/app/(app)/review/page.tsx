import Link from "next/link";

import { ReviewForm } from "@/components/goals/review-form";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { pageUser } from "@/lib/auth/page";
import { addDays, toIsoDay } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { summaryLines } from "@/lib/review/review";
import { getReview } from "@/lib/review/service";

export const metadata = { title: "Revisión semanal · LifeOS" };

/** v1.8 · Revisión del domingo: la semana en cuatro líneas y tres preguntas. */
export default async function ReviewPage() {
  const user = await pageUser();
  const r = await getReview(user.id);
  const from = formatDate(r.weekStart, { day: "numeric", month: "short" });
  const to = formatDate(addDays(r.weekStart, 6), { day: "numeric", month: "short" });
  return (
    <>
      <PageHeader title="Revisión semanal" description={`Semana del ${from} al ${to}. Cinco minutos para cerrar la semana y elegir un foco.`} />
      <div className="grid max-w-xl gap-4">
        <Card className="gap-2 py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-sm">Tu semana</CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            <ul className="grid gap-1 text-sm" aria-label="Resumen de la semana">
              {summaryLines(r.summary, r.prev).map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card className="py-4">
          <CardContent className="px-4">
            <ReviewForm weekStart={toIsoDay(r.weekStart)} initial={{ wentWell: r.saved?.wentWell ?? "", change: r.saved?.change ?? "", focus: r.saved?.focus ?? "" }} />
          </CardContent>
        </Card>
        <p className="text-xs text-muted-foreground">
          ¿Algo más concreto? Ponte un <Link href="/goals" className="underline underline-offset-2">objetivo</Link>. El aviso del domingo se desactiva en Ajustes → Notificaciones.
        </p>
      </div>
    </>
  );
}
