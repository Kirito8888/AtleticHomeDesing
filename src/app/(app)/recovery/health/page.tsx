import { PageHeader } from "@/components/page-header";
import { HealthReportLinks } from "@/components/recovery/women-extra";
import { AppointmentForm, DeleteAppointment, SupplementActions, SupplementForm } from "@/components/recovery/health-admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { pageUser } from "@/lib/auth/page";
import { today, toIsoDay } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { listHealthReports } from "@/lib/health/health-report";
import { prisma } from "@/lib/prisma";
import { APPOINTMENT_LABEL, supplementsToCheck } from "@/lib/recovery/health-admin";
import { recentAppointments } from "@/lib/recovery/health-admin-service";
import { SupplementCalendar } from "@/components/nutrition/planning";
import { addDays, startOfIsoWeek } from "@/lib/dates";
import { supplementWeek } from "@/lib/nutrition/planning";

export const metadata = { title: "Citas y suplementos · LifeOS" };

const when = (d: Date) => new Intl.DateTimeFormat("es-ES", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }).format(d);

export default async function HealthAdminPage() {
  const user = await pageUser();
  const day = toIsoDay(today());
  const [supps, appts, reports] = await Promise.all([
    prisma.supplement.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }),
    recentAppointments(user.id),
    listHealthReports(user.id),
  ]);
  const view = supps.map((s) => ({ ...s, startedOn: s.startedOn ? toIsoDay(s.startedOn) : null, endedOn: s.endedOn ? toIsoDay(s.endedOn) : null, checkedOn: s.checkedOn ? toIsoDay(s.checkedOn) : null }));
  const pending = new Set(supplementsToCheck(view, day).map((s) => s.id));
  // v1.7 · calendario de tomas de esta semana (sin dosis)
  const ws = startOfIsoWeek(today());
  const logs = await prisma.supplementLog.findMany({ where: { userId: user.id, date: { gte: ws, lte: addDays(ws, 6) } }, select: { supplementId: true, date: true } });
  const active = view.filter((s) => !s.endedOn || s.endedOn >= toIsoDay(ws));
  const suppWeek = supplementWeek(active, logs.map((l) => ({ supplementId: l.supplementId, date: toIsoDay(l.date) })), toIsoDay(ws));
  return (
    <>
      <PageHeader title="Citas y suplementos" description="Solo para ti. Para el fisio, un enlace temporal con tus molestias y tu carga." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="h-fit gap-3 py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-base">Citas</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 px-4 text-sm">
            {appts.length ? (
              <ul className="grid gap-1.5" aria-label="Citas">
                {appts.map((a) => (
                  <li key={a.id} className="grid gap-0.5">
                    <span className="flex justify-between gap-2">
                      <span className={a.past ? "text-muted-foreground" : "font-medium"}>
                        {APPOINTMENT_LABEL[a.kind as keyof typeof APPOINTMENT_LABEL] ?? a.kind} · {when(a.at)}
                        {a.place ? ` · ${a.place}` : ""}
                      </span>
                      <DeleteAppointment id={a.id} />
                    </span>
                    {a.notes ? <span className="text-xs whitespace-pre-wrap text-muted-foreground">{a.notes}</span> : null}
                  </li>
                ))}
              </ul>
            ) : null}
            <AppointmentForm today={day} />
            <div className="grid gap-2 border-t pt-3">
              <p className="font-medium">Para el fisio</p>
              <p className="text-xs text-muted-foreground">Molestias, vuelta por fases, carga de 8 semanas y fatiga por zona. Caduca en 7 días; tu entrenadora no lo ve.</p>
              <HealthReportLinks kind="PHYSIO" label="Tu fisio" active={reports.filter((r) => r.kind === "PHYSIO").map((r) => ({ id: r.id, expiresAt: r.expiresAt.toISOString() }))} />
            </div>
            <div className="grid gap-2 border-t pt-3">
              <p className="font-medium">Informe anual de salud</p>
              <p className="text-xs text-muted-foreground">12 meses, mes a mes: entreno, molestias, sueño, FC y VFC, bienestar y (si la usas) salud de la mujer. Para la revisión anual o la de temporada. Caduca en 7 días.</p>
              <HealthReportLinks kind="ANNUAL" label="La revisión anual" active={reports.filter((r) => r.kind === "ANNUAL").map((r) => ({ id: r.id, expiresAt: r.expiresAt.toISOString() }))} />
            </div>
          </CardContent>
        </Card>
        <Card className="h-fit gap-3 py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-base">Suplementos</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 px-4 text-sm">
            <p className="rounded-md border border-amber-500/50 bg-amber-500/5 p-2 text-xs">
              LifeOS no sabe si un suplemento está permitido. Compruébalo en la lista de prohibiciones de la AMA/WADA y con tu médico antes de competir: la responsabilidad es del deportista.
            </p>
            {view.length ? (
              <ul className="grid gap-2" aria-label="Suplementos">
                {view.map((s) => (
                  <li key={s.id} className="grid gap-0.5">
                    <span className={s.endedOn && s.endedOn < day ? "text-muted-foreground line-through" : "font-medium"}>
                      {s.name}
                      {s.brand ? ` · ${s.brand}` : ""}
                      {s.batch ? ` · lote ${s.batch}` : ""}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {s.dose ? `${s.dose} · ` : ""}
                      {s.checkedOn ? `comprobado el ${formatDate(s.checkedOn)}` : "sin comprobar"}
                      {pending.has(s.id) ? <span className="font-medium text-destructive"> · compruébalo antes de competir</span> : null}
                    </span>
                    <SupplementActions id={s.id} name={s.name} today={day} active={!s.endedOn || s.endedOn >= day} />
                  </li>
                ))}
              </ul>
            ) : null}
            <SupplementForm today={day} />
            {active.length ? (
              <div className="grid gap-2 border-t pt-3">
                <p className="font-medium">Calendario de tomas</p>
                <SupplementCalendar supplements={active.map((s) => ({ id: s.id, name: s.name, days: s.days }))} week={suppWeek} />
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
