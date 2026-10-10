import Link from "next/link";

import { InviteForm, PendingInvitations, UserList } from "@/components/admin/admin-panel";
import { MetricsCard } from "@/components/admin/metrics-card";
import { metricsSummary } from "@/lib/admin/metrics";
import { serverStatus } from "@/lib/admin/status";
import { telegramConfigured } from "@/lib/admin/telegram";
import { checkHealth } from "@/lib/admin/watch";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listInvitations, listUsersForAdmin } from "@/lib/auth/access";
import { hasSecondFactor } from "@/lib/auth/admin";
import { pageUser } from "@/lib/auth/page";

export const metadata = { title: "Administración · Atlenza" };

/** v1.9 · Panel de administración: quién puede usar Atlenza (invitaciones, suspender, contraseña nueva). */
export default async function AdminPage() {
  const user = await pageUser();
  if (user.role !== "ADMIN") {
    return <PageHeader title="Administración" description="Solo para la administración de esta instalación." />;
  }
  if (!(await hasSecondFactor(user.id))) {
    return (
      <>
        <PageHeader title="Administración" />
        <p role="status" className="text-sm">
          Para administrar el servidor activa antes la verificación en dos pasos o una llave de acceso en{" "}
          <Link href="/settings" className="underline underline-offset-2">
            Ajustes → Seguridad
          </Link>
          .
        </p>
      </>
    );
  }
  const [users, invitations, problems, status] = await Promise.all([listUsersForAdmin(), listInvitations(), checkHealth(), serverStatus()]);
  const mem = process.memoryUsage();
  const now = new Date();
  return (
    <>
      <PageHeader title="Administración" description="Solo pueden usar Atlenza las personas a las que invitas. No se ve ningún dato de salud ni contenido de las cuentas." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="gap-3 py-4 lg:col-span-2">
          <CardHeader className="px-4">
            <CardTitle className="text-base">Cuentas ({users.length})</CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            <UserList
              users={users.map((u) => ({
                id: u.id,
                name: u.name,
                email: u.email,
                role: u.role,
                createdAt: u.createdAt.toISOString(),
                lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
                suspendedAt: u.suspendedAt?.toISOString() ?? null,
                locked: Boolean(u.lockedUntil && u.lockedUntil > now),
                secondFactor: u.secondFactor,
                demo: Boolean(u.demoExpiresAt),
                me: u.id === user.id,
              }))}
            />
          </CardContent>
        </Card>
        <Card className="gap-3 py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-base">Invitar</CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            <InviteForm />
          </CardContent>
        </Card>
        <Card className="gap-3 py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-base">Invitaciones pendientes</CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            <PendingInvitations items={invitations.map((i) => ({ ...i, expiresAt: i.expiresAt.toISOString() }))} />
          </CardContent>
        </Card>
        <Card className="gap-3 py-4 lg:col-span-2">
          <CardHeader className="px-4">
            <CardTitle className="text-base">Métricas y vigilancia</CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            <MetricsCard
              metrics={metricsSummary()}
              problems={problems}
              process={{ uptimeSec: Math.round(process.uptime()), rssMb: Math.round(mem.rss / 1e6), heapMb: Math.round(mem.heapUsed / 1e6) }}
              db={{ latencyMs: status.db.latencyMs, sizeMb: status.db.sizeBytes != null ? Math.round(status.db.sizeBytes / 1e6) : null, queue: status.queue }}
              telegram={telegramConfigured()}
            />
          </CardContent>
        </Card>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Estado del servidor, copias y cuentas demo: <Link href="/settings#servidor" className="underline underline-offset-2">Ajustes → Estado del servidor</Link>.
      </p>
    </>
  );
}
