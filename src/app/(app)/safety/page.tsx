import { PageHeader } from "@/components/page-header";
import { ContactsCard, TripCard } from "@/components/health/safety";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { pageUser } from "@/lib/auth/page";
import { safetyOverview } from "@/lib/health/safety-service";
import { pushConfigured } from "@/lib/push/service";

export const metadata = { title: "Entreno sola · Atlenza" };

const hhmm = (iso: string) => new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }).format(new Date(iso));

export default async function SafetyPage() {
  const user = await pageUser();
  const o = await safetyOverview(user.id);
  return (
    <>
      <PageHeader title="Entreno sola, con aviso" description="Si no marcas «llegué» a tiempo, tus contactos de confianza reciben un push." />
      {!pushConfigured() ? (
        <p role="status" className="mb-4 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          El servidor no tiene las notificaciones push configuradas: los avisos no llegarían.
        </p>
      ) : null}
      {o.watchingTrips.length ? (
        <section aria-label="Salidas de tus contactos" className="mb-4 grid gap-2">
          {o.watchingTrips.map((t) => (
            <p key={t.id} role="status" className={t.overdue ? "rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm" : "rounded-md border p-3 text-sm text-muted-foreground"}>
              {t.name} salió a las {hhmm(t.startedAt)}; vuelta prevista a las {hhmm(t.dueAt)}.
              {t.overdue ? " No ha marcado «llegué»: contacta con ella." : ""}
            </p>
          ))}
        </section>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="h-fit gap-3 py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-base">{o.trip ? "Estás fuera" : "Salir a entrenar"}</CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            <TripCard trip={o.trip} hasContacts={o.contacts.some((c) => c.status === "ACTIVE")} />
          </CardContent>
        </Card>
        <Card className="h-fit gap-3 py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-base">Contactos</CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            <ContactsCard contacts={o.contacts} watching={o.watching} />
          </CardContent>
        </Card>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Tu contacto necesita una cuenta en Atlenza con las notificaciones activadas. No se envían SMS ni emails. La nota y la ubicación van cifradas y solo se envían si salta el aviso.
      </p>
    </>
  );
}
