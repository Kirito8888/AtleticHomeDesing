import { notFound } from "next/navigation";

import { FeeForm, FeeToggle, InviteMember, RemoveMember } from "@/components/clubs/club-forms";
import { PageHeader } from "@/components/page-header";
import { pageUser } from "@/lib/auth/page";
import { ApiError } from "@/lib/api";
import { clubSections } from "@/lib/clubs/club-layout";
import { loadClubPanel } from "@/lib/clubs/club-panel";
import { feeSummary, formatAmount } from "@/lib/clubs/fees";
import { listFees } from "@/lib/clubs/service";
import { addDays, today, toIsoDay } from "@/lib/dates";
import { formatDate, SESSION_TYPE_LABEL } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Club · Atlenza" };

const ROLE_LABEL = { ADMIN: "Administradora", COACH: "Entrenadora", ATHLETE: "Atleta" } as const;

export default async function ClubPage(props: PageProps<"/clubs/[id]">) {
  const user = await pageUser();
  const { id } = await props.params;
  const me = await prisma.orgMember.findUnique({ where: { orgId_userId: { orgId: id, userId: user.id } }, include: { org: true } });
  if (!me || me.status !== "ACTIVE") notFound();
  const staff = me.role !== "ATHLETE";
  const panel = staff ? await loadClubPanel(user, id).catch((e) => (e instanceof ApiError ? null : Promise.reject(e))) : null;
  if (staff && !panel) notFound();
  const fees = await listFees(user, id);
  const todayIso = toIsoDay(today());
  const summary = feeSummary(fees.map((f) => ({ amountCents: f.amountCents, status: f.status, dueDate: toIsoDay(f.dueDate) })), todayIso);
  const isAdmin = me.role === "ADMIN";

  const sections = clubSections({ role: me.role, hasPanel: !!panel });
  const h2 = "text-sm font-medium";

  return (
    <>
      <PageHeader title={me.org.name} description={`Tu rol: ${ROLE_LABEL[me.role]}.`} />
      {sections.length > 1 ? (
        <nav aria-label="Secciones del club" className="mb-4 flex flex-wrap gap-2">
          {sections.map((x) => (
            <a key={x.id} href={`#${x.id}`} className="flex min-h-11 items-center rounded-md border px-3 text-sm hover:bg-accent">
              {x.label}
              {x.id === "alertas" && panel?.alerts.length ? ` (${panel.alerts.length})` : ""}
            </a>
          ))}
        </nav>
      ) : null}
      <div className="grid gap-6">
        {panel ? (
          <>
            <section id="alertas" aria-label="Alertas de grupo" className="grid scroll-mt-20 gap-2">
              <h2 className={h2}>Alertas de grupo{panel.alerts.length ? ` (${panel.alerts.length})` : ""}</h2>
              {panel.alerts.length ? (
                <ul className="grid gap-1 text-sm">
                  {panel.alerts.map((a, i) => (
                    <li key={i} className="rounded-md border px-3 py-2">
                      <strong>{a.athlete}</strong> · {a.title}
                      <span className="block text-xs text-muted-foreground">{a.message}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Sin alertas hoy.</p>
              )}
            </section>

            <section id="cumplimiento" aria-label="Cumplimiento" className="grid scroll-mt-20 gap-2">
              <h2 className={h2}>Cumplimiento</h2>
              {panel.compare.length ? (
                <>
                  <ul className="grid gap-1 text-sm tabular-nums md:hidden" aria-label="Cumplimiento del club (móvil)">
                    {panel.compare.map((r) => (
                      <li key={r.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                        <span className="min-w-0 truncate">{r.name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          Carga {r.load7 ?? "—"} · Cumpl. {r.compliancePct != null ? `${r.compliancePct} %` : "—"}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="hidden overflow-x-auto rounded-md border md:block">
                    <table className="w-full text-sm tabular-nums" aria-label="Cumplimiento del club">
                      <thead className="text-xs text-muted-foreground">
                        <tr>
                          <th className="px-3 py-1.5 text-left font-normal">Atleta</th>
                          <th className="px-3 py-1.5 text-right font-normal">Carga 7 d</th>
                          <th className="px-3 py-1.5 text-right font-normal">Cumpl. 14 d</th>
                        </tr>
                      </thead>
                      <tbody>
                        {panel.compare.map((r) => (
                          <tr key={r.id} className="border-t">
                            <td className="px-3 py-1.5">{r.name}</td>
                            <td className="px-3 py-1.5 text-right">{r.load7 ?? "—"}</td>
                            <td className="px-3 py-1.5 text-right">{r.compliancePct != null ? `${r.compliancePct} %` : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Aún no hay atletas activas en el club.</p>
              )}
              {panel.hidden ? <p className="text-xs text-muted-foreground">«—» o datos ausentes: la atleta no ha concedido ese permiso o ha limitado el tratamiento de sus datos.</p> : null}
            </section>

            <section id="calendario" aria-label="Calendario del club" className="grid scroll-mt-20 gap-2">
              <h2 className={h2}>Calendario colectivo</h2>
              {panel.calendar.length ? (
                <ul className="grid gap-1 text-sm">
                  {panel.calendar.map((s) => (
                    <li key={s.id} className="flex justify-between gap-2 rounded-md border px-3 py-1.5">
                      <span className="min-w-0 truncate">
                        {s.status === "PLANNED" ? "○ " : "✓ "}
                        {formatDate(new Date(`${s.day}T00:00:00Z`), { weekday: "short", day: "numeric" })} · {s.athlete}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">{s.title ?? SESSION_TYPE_LABEL[s.type]}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Sin sesiones entre {formatDate(addDays(today(), -7), { day: "numeric", month: "short" })} y los próximos 14 días.</p>
              )}
            </section>

            <section id="miembros" aria-label="Miembros" className="grid scroll-mt-20 gap-2">
              <h2 className={h2}>Miembros ({panel.org.members.length})</h2>
              <ul className="grid gap-1 text-sm">
                {panel.org.members.map((m) => (
                  <li key={m.id} className="flex min-h-11 items-center justify-between gap-2 rounded-md border px-3 py-1">
                    <span className="min-w-0 truncate">{m.user.name ?? m.user.email}</span>
                    <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                      {ROLE_LABEL[m.role]}
                      {m.status === "PENDING" ? " · pendiente" : ""}
                      {isAdmin && m.userId !== user.id ? <RemoveMember orgId={id} memberId={m.id} label={`Quitar a ${m.user.name ?? m.user.email}`} /> : null}
                    </span>
                  </li>
                ))}
              </ul>
              {isAdmin ? (
                <details className="rounded-md border">
                  <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-medium">Invitar a una persona</summary>
                  <div className="p-3 pt-0">
                    <InviteMember orgId={id} />
                  </div>
                </details>
              ) : null}
            </section>
          </>
        ) : null}
        {isAdmin || me.role === "ATHLETE" ? (
          <section id="cuotas" aria-label="Cuotas" className="grid scroll-mt-20 gap-2">
            <h2 className="text-sm font-medium">Cuotas</h2>
            <p className="text-xs text-muted-foreground">Apunte contable manual: Atlenza no cobra nada.</p>
            <p className="text-sm tabular-nums">
              Pagado {formatAmount(summary.paidCents)} · Pendiente {formatAmount(summary.pendingCents)}
              {summary.overdue ? ` · ${summary.overdue} vencida(s)` : ""}
            </p>
            {isAdmin && panel ? (
              <details className="rounded-md border">
                <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-medium">Apuntar una cuota</summary>
                <div className="p-3 pt-0">
                  <FeeForm orgId={id} defaultDue={todayIso} athletes={panel.org.members.filter((m) => m.role === "ATHLETE").map((m) => ({ memberId: m.id, name: m.user.name ?? m.user.email }))} />
                </div>
              </details>
            ) : null}
            {fees.length ? (
              <ul className="grid gap-1 text-sm">
                {fees.map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-1.5">
                    <span className="min-w-0">
                      {f.concept}
                      {isAdmin ? ` · ${f.member.user.name ?? f.member.user.email}` : ""}
                      <span className="block text-xs text-muted-foreground">
                        {formatAmount(f.amountCents)} · vence {formatDate(f.dueDate, { day: "numeric", month: "short" })} ·{" "}
                        {f.status === "PAID" ? `pagada${f.paidAt ? ` el ${formatDate(f.paidAt, { day: "numeric", month: "short" })}` : ""}` : "pendiente"}
                      </span>
                    </span>
                    {isAdmin ? <FeeToggle orgId={id} feeId={f.id} paid={f.status === "PAID"} label={`${f.status === "PAID" ? "Marcar pendiente" : "Marcar pagada"}: ${f.concept}`} /> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Sin cuotas apuntadas.</p>
            )}
          </section>
        ) : null}
      </div>
    </>
  );
}
