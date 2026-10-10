import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { RoutineWizard } from "@/components/routine/routine-wizard";
import { Card, CardContent } from "@/components/ui/card";
import { pageUser } from "@/lib/auth/page";
import { today, toIsoDay } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import type { Profile } from "@/lib/routine/profile";
import { listRoutines } from "@/lib/routine/service";

export const metadata = { title: "Crear mi rutina · Atlenza" };

/** v1.7 · Crear una rutina con un cuestionario (sin IA) y ver lo que puedes lograr si la sigues. */
export default async function RoutinePage() {
  const user = await pageUser();
  const routines = await listRoutines(user.id);
  return (
    <>
      <PageHeader title="Crear mi rutina" description="Unas preguntas sobre ti, unos tests sencillos y tus objetivos: la rutina y una gráfica de lo que puedes lograr si la sigues." />
      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <Card className="py-4">
          <CardContent className="px-4">
            <RoutineWizard today={toIsoDay(today())} />
          </CardContent>
        </Card>
        {routines.length ? (
          <div className="grid h-fit gap-2" aria-label="Mis rutinas">
            <p className="text-sm font-medium">Mis rutinas</p>
            {routines.map((r) => (
              <Link key={r.id} href={`/training/routine/${r.id}`} className="rounded-md border p-2 text-sm hover:bg-accent">
                {r.mesoCode} · {(r.profile as unknown as Profile).archetype}
                <span className="block text-xs text-muted-foreground">{formatDate(r.createdAt, { day: "numeric", month: "short", year: "numeric" })}</span>
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </>
  );
}
