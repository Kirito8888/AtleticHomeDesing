import Link from "next/link";

import { AcceptInvite, CreateClub } from "@/components/clubs/club-forms";
import { PageHeader } from "@/components/page-header";
import { pageUser } from "@/lib/auth/page";
import { coachHubLinks } from "@/lib/clubs/club-layout";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Clubes · Atlenza" };

const ROLE_LABEL = { ADMIN: "Administradora", COACH: "Entrenadora", ATHLETE: "Atleta" } as const;

export default async function ClubsPage() {
  const user = await pageUser();
  const [memberships, myCoaches, planLinks] = await Promise.all([
    prisma.orgMember.findMany({ where: { userId: user.id }, include: { org: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } }),
    // Solo vínculos propios (coach de la usuaria): nada de datos deportivos ni de salud.
    prisma.coachAthlete.findMany({ where: { athleteId: user.id }, include: { coach: { select: { name: true, email: true } } }, orderBy: { createdAt: "asc" } }),
    prisma.coachAthlete.count({ where: { coachId: user.id, status: "ACTIVE", canPlan: true } }),
  ]);
  const pending = memberships.filter((m) => m.status === "PENDING");
  const active = memberships.filter((m) => m.status === "ACTIVE");
  const canCreate = user.role === "COACH" || user.role === "ADMIN";
  const hub = coachHubLinks({ role: user.role, canPlanAny: planLinks > 0 });
  return (
    <>
      <PageHeader title="Clubes" description="Grupos de entrenadoras y atletas. Pertenecer a un club no da acceso a tus datos: tú eliges qué ve el staff al aceptar." />
      <div className="grid gap-4">
        {pending.length ? (
          <section aria-label="Invitaciones" className="grid gap-2">
            <h2 className="text-sm font-medium">Invitaciones</h2>
            {pending.map((m) => (
              <AcceptInvite key={m.id} orgId={m.orgId} memberId={m.id} orgName={m.org.name} role={m.role} />
            ))}
          </section>
        ) : null}
        <section aria-label="Mis clubes" className="grid gap-2">
          <h2 className="text-sm font-medium">Mis clubes</h2>
          {active.length ? (
            <ul className="grid gap-2">
              {active.map((m) => (
                <li key={m.id}>
                  <Link href={`/clubs/${m.orgId}`} className="flex min-h-11 items-center justify-between gap-2 rounded-md border px-3 py-2 hover:bg-accent">
                    <span className="min-w-0 truncate">{m.org.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{ROLE_LABEL[m.role]}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Aún no perteneces a ningún club.</p>
          )}
        </section>
        <section aria-label="Accesos" className="grid gap-2">
          <h2 className="text-sm font-medium">Accesos</h2>
          <ul className="grid grid-cols-2 gap-2">
            {hub.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="flex min-h-11 items-center rounded-md border px-3 py-2 text-sm hover:bg-accent">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <section aria-label="Mis entrenadoras" className="grid gap-2">
          <h2 className="text-sm font-medium">Mis entrenadoras</h2>
          {myCoaches.length ? (
            <ul className="grid gap-2">
              {myCoaches.map((c) => (
                <li key={c.id} className="rounded-md border px-3 py-2 text-sm">
                  <span className="block min-w-0 truncate">{c.coach.name ?? c.coach.email}</span>
                  <span className="block text-xs text-muted-foreground">
                    {c.status === "ACTIVE" ? "Activa" : "Pendiente"} · {c.scopes.length} permiso(s){c.canPlan ? " · puede planificar" : ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No tienes ninguna entrenadora vinculada.</p>
          )}
          <Link href="/settings#entrenadora" className="flex min-h-11 items-center justify-center rounded-md border px-3 text-sm hover:bg-accent">
            Gestionar permisos
          </Link>
        </section>
        {canCreate ? (
          <details className="rounded-md border">
            <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-medium">Crear un club</summary>
            <div className="p-3 pt-0">
              <CreateClub />
            </div>
          </details>
        ) : null}
      </div>
    </>
  );
}
