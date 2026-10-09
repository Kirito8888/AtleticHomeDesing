import { PageHeader } from "@/components/page-header";
import { DeadlinesPanel, TripCard, TripForm } from "@/components/finance/trips";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { pageUser } from "@/lib/auth/page";
import { addDays, today, toIsoDay } from "@/lib/dates";
import { listDeadlines, listTrips, unlinkedExpenses } from "@/lib/finance/trips-service";
import { formatEur } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Viajes y plazos · LifeOS" };

export default async function TripsPage() {
  const user = await pageUser();
  const now = today();
  const day = toIsoDay(now);
  const [trips, unlinked, deadlines, competitions] = await Promise.all([
    listTrips(user.id),
    unlinkedExpenses(user.id),
    listDeadlines(user.id, day),
    prisma.calendarEvent.findMany({
      where: { userId: user.id, type: "COMPETITION", startAt: { gte: addDays(now, -60), lte: addDays(now, 365) } },
      orderBy: { startAt: "asc" },
      select: { id: true, title: true, startAt: true },
    }),
  ]);
  const owed = trips.reduce((a, t) => a + t.pendingCents, 0);
  return (
    <>
      <PageHeader title="Viajes y plazos" description="Presupuesto de cada viaje de competición, lo que te debe la federación y los plazos que no se pueden pasar." />
      {owed ? (
        <p role="status" className="mb-4 rounded-md border border-dashed p-3 text-sm">
          La federación te debe <span className="font-semibold">{formatEur(owed)}</span> en reembolsos pendientes.
        </p>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="grid h-fit gap-4">
          <Card className="gap-3 py-4">
            <CardHeader className="px-4">
              <CardTitle className="text-base">Plazos</CardTitle>
            </CardHeader>
            <CardContent className="px-4">
              <DeadlinesPanel deadlines={deadlines} today={day} />
            </CardContent>
          </Card>
          <Card className="gap-3 py-4">
            <CardHeader className="px-4">
              <CardTitle className="text-base">Nuevo viaje</CardTitle>
            </CardHeader>
            <CardContent className="px-4">
              <TripForm competitions={competitions.map((c) => ({ id: c.id, title: c.title, date: toIsoDay(c.startAt) }))} today={day} />
            </CardContent>
          </Card>
        </div>
        <div className="grid h-fit gap-3" aria-label="Mis viajes">
          {trips.map((t) => (
            <Card key={t.id} className="py-3">
              <CardContent className="px-4">
                <TripCard trip={t} unlinked={unlinked} />
              </CardContent>
            </Card>
          ))}
          {!trips.length ? <p className="text-sm text-muted-foreground">Aún no hay viajes.</p> : null}
        </div>
      </div>
    </>
  );
}
