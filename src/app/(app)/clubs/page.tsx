import Link from "next/link";

import { AcceptInvite, CreateClub } from "@/components/clubs/club-forms";
import { PageHeader } from "@/components/page-header";
import { pageUser } from "@/lib/auth/page";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Clubes · Atlenza" };

const ROLE_LABEL = { ADMIN: "Administradora", COACH: "Entrenadora", ATHLETE: "Atleta" } as const;

export default async function ClubsPage() {
  const user = await pageUser();
  const memberships = await prisma.orgMember.findMany({ where: { userId: user.id }, include: { org: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } });
  const pending = memberships.filter((m) => m.status === "PENDING");
  const active = memberships.filter((m) => m.status === "ACTIVE");
  const canCreate = user.role === "COACH" || user.role === "ADMIN";
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
        {canCreate ? (
          <section aria-label="Crear club" className="grid gap-2">
            <h2 className="text-sm font-medium">Crear un club</h2>
            <CreateClub />
          </section>
        ) : null}
      </div>
    </>
  );
}
