import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { PrivacyRequestForm, RestrictionToggle } from "@/components/privacy/privacy-controls";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { pageUser } from "@/lib/auth/page";
import { prisma } from "@/lib/prisma";
import { retentionDays } from "@/lib/privacy/retention";
import { CONSENT_TEXT, consentOverview, RIGHTS, type ConsentPurpose } from "@/lib/privacy/service";

export const metadata = { title: "Privacidad y derechos · Atlenza" };

const fmt = (d: Date) => d.toLocaleString("es-ES", { timeZone: "Europe/Madrid", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** v1.7 · Privacidad (RGPD y LOPDGDD): consentimientos con historial, derechos y plazos de conservación. */
export default async function PrivacyPage() {
  const user = await pageUser();
  const [me, consents, requests] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { processingRestrictedAt: true } }),
    consentOverview(user.id),
    prisma.privacyRequest.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 30 }),
  ]);
  const days = retentionDays(process.env);
  return (
    <>
      <PageHeader title="Privacidad y derechos" description="Qué has consentido, cómo ejercer tus derechos y cuánto se guarda cada cosa." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="h-fit gap-3 py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-base">Mis consentimientos</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 px-4 text-sm">
            <ul className="grid gap-2" aria-label="Consentimientos">
              {(Object.keys(CONSENT_TEXT) as ConsentPurpose[]).map((p) => {
                const c = consents.current[p];
                return (
                  <li key={p} className="rounded-md border p-2">
                    <p className="font-medium">
                      {CONSENT_TEXT[p].label} · <span className={c?.granted ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}>{c ? (c.granted ? "concedido" : "retirado") : "sin dar"}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">{CONSENT_TEXT[p].text}</p>
                    {c ? <p className="mt-1 text-xs text-muted-foreground">Último cambio: {fmt(c.createdAt)} (texto versión {c.version})</p> : null}
                  </li>
                );
              })}
            </ul>
            <p className="text-xs text-muted-foreground">
              Se cambian donde se usan: IA en Ajustes → Privacidad e IA; salud borrando sus datos; entrenador/a en Ajustes → Entrenador; «Entreno sola» en su página.
            </p>
          </CardContent>
        </Card>
        <Card className="h-fit gap-3 py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-base">Mis derechos</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 px-4 text-sm">
            <ul className="grid gap-1.5">
              <li>
                <span className="font-medium">{RIGHTS.ACCESS} y {RIGHTS.PORTABILITY}:</span>{" "}
                <a className="underline underline-offset-2" href="/api/account/export" download>
                  descargar todo (JSON)
                </a>{" "}
                o CSV en Ajustes → Tus datos.
              </li>
              <li>
                <span className="font-medium">{RIGHTS.RECTIFICATION}:</span> edita el dato donde está (perfil, sesiones, comidas…) o pídelo abajo.
              </li>
              <li>
                <span className="font-medium">{RIGHTS.ERASURE}:</span> borra cada registro, los datos de salud desde su página o la cuenta entera en{" "}
                <Link className="underline underline-offset-2" href="/settings">
                  Ajustes → Tus datos
                </Link>
                .
              </li>
              <li>
                <span className="font-medium">{RIGHTS.OBJECTION}:</span> retira el consentimiento de IA y desactiva las notificaciones.
              </li>
            </ul>
            <div className="grid gap-1 rounded-md border p-2">
              <RestrictionToggle initial={Boolean(me.processingRestrictedAt)} />
              <p className="text-xs text-muted-foreground">
                {RIGHTS.RESTRICTION}: se guardan tus datos y sigues usando la app, pero nada sale de tu cuenta: ni IA, ni entrenador/a, ni enlaces para compartir, ni calendario.
                {me.processingRestrictedAt ? ` Activa desde ${fmt(me.processingRestrictedAt)}.` : ""}
              </p>
            </div>
            <PrivacyRequestForm />
            {requests.length ? (
              <ul className="grid gap-1 text-xs" aria-label="Mis peticiones">
                {requests.map((r) => (
                  <li key={r.id} className="flex justify-between gap-2 border-b pb-1 last:border-0">
                    <span className="min-w-0 truncate">
                      {RIGHTS[r.right as keyof typeof RIGHTS] ?? r.right}
                      {r.detail ? ` · ${r.detail}` : ""}
                    </span>
                    <span className="shrink-0 text-muted-foreground">{r.resolvedAt ? "atendida" : "pendiente"} · {fmt(r.createdAt)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </CardContent>
        </Card>
        <Card className="h-fit gap-3 py-4 lg:col-span-2">
          <CardHeader className="px-4">
            <CardTitle className="text-base">Cuánto se guarda</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1 px-4 text-sm">
            <p>Tus datos de entrenamiento, salud, comidas, estudio y finanzas: mientras tengas cuenta (los borras tú cuando quieras).</p>
            <p>Registro de actividad de seguridad: {days.AUDIT} días · salidas de «Entreno sola»: {days.SAFETY_TRIPS} días · enlaces caducados: {days.EXPIRED_LINKS} días · peticiones atendidas: {Math.round(days.PRIVACY_REQUESTS / 365)} años.</p>
            <p>Copias de seguridad cifradas: las diarias según el servidor (14 días por defecto) y una mensual 12 meses.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href="/legal/privacidad">Política de privacidad</Link>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link href="/legal/aviso">Aviso legal</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
