import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { pageUser } from "@/lib/auth/page";
import { diffDays, today, toIsoDay } from "@/lib/dates";
import { formatDate, formatEur, SESSION_TYPE_LABEL } from "@/lib/format";
import { seasonBudgetView } from "@/lib/finance/season-service";
import { prisma } from "@/lib/prisma";
import { assignmentAlert, type AssignmentStatus } from "@/lib/study/coursework";

export const metadata = { title: "De un vistazo · Atlenza" };

function Row({ label, href, children }: { label: string; href: string; children: React.ReactNode }) {
  return (
    <li className="flex items-baseline justify-between gap-3 border-b py-2 last:border-b-0">
      <Link href={href} className="shrink-0 text-muted-foreground underline-offset-4 hover:underline">
        {label}
      </Link>
      <span className="min-w-0 text-right">{children}</span>
    </li>
  );
}

/**
 * v1.7 · «De un vistazo»: el día en una lista, sin gráficas ni cálculos pesados (pocas consultas
 * pequeñas). Pensada para abrirla desde la pantalla de inicio del móvil.
 */
export default async function GlancePage() {
  const user = await pageUser();
  const now = today();
  const day = toIsoDay(now);
  const weekday = ((now.getUTCDay() + 6) % 7) + 1;
  const [rec, sessions, water, habits, comp, assignment, deadline, supps, study, sb] = await Promise.all([
    prisma.recoveryMetrics.findUnique({ where: { userId_date: { userId: user.id, date: now } }, select: { readinessScore: true, sleepHours: true } }),
    prisma.trainingSession.findMany({ where: { userId: user.id, date: now }, select: { title: true, type: true, status: true } }),
    prisma.hydrationLog.aggregate({ where: { userId: user.id, date: now }, _sum: { ml: true } }),
    prisma.habit.findMany({ where: { userId: user.id, archived: false }, select: { logs: { where: { date: now }, select: { date: true } } } }),
    prisma.calendarEvent.findFirst({ where: { userId: user.id, type: "COMPETITION", startAt: { gte: now } }, orderBy: { startAt: "asc" }, select: { title: true, startAt: true } }),
    prisma.assignment.findFirst({ where: { userId: user.id, status: { not: "DONE" } }, orderBy: { dueOn: "asc" }, select: { subject: true, title: true, dueOn: true, status: true } }),
    prisma.deadline.findFirst({ where: { userId: user.id, done: false, dueOn: { gte: now } }, orderBy: { dueOn: "asc" }, select: { title: true, dueOn: true } }),
    prisma.supplement.findMany({ where: { userId: user.id, days: { has: weekday }, OR: [{ endedOn: null }, { endedOn: { gte: now } }] }, select: { name: true, logs: { where: { date: now }, select: { id: true } } } }),
    prisma.studySession.aggregate({ where: { userId: user.id, date: now }, _sum: { minutes: true } }),
    seasonBudgetView(user.id, now.getUTCFullYear(), day),
  ]);
  const doneHabits = habits.filter((h) => h.logs.length).length;
  const suppPending = supps.filter((s) => !s.logs.length).map((s) => s.name);
  const a = assignment ? { ...assignment, dueOn: toIsoDay(assignment.dueOn), status: assignment.status as AssignmentStatus } : null;

  return (
    <>
      <PageHeader title="De un vistazo" description={formatDate(day, { weekday: "long", day: "numeric", month: "long" })} />
      <ul className="max-w-xl rounded-lg border px-4 text-sm" aria-label="Resumen del día">
        <Row label="Readiness" href="/recovery">
          {rec?.readinessScore != null ? <span className="font-semibold tabular-nums">{Math.round(rec.readinessScore)}</span> : "sin registrar"}
          {rec?.sleepHours != null ? <span className="text-muted-foreground"> · {String(rec.sleepHours).replace(".", ",")} h de sueño</span> : null}
        </Row>
        <Row label="Entreno" href="/training">
          {sessions.length ? sessions.map((s) => `${s.title ?? (SESSION_TYPE_LABEL as Record<string, string>)[s.type] ?? s.type}${s.status === "COMPLETED" ? " ✓" : ""}`).join(" · ") : "descanso"}
        </Row>
        <Row label="Agua" href="/nutrition">
          <span className="tabular-nums">{String(((water._sum.ml ?? 0) / 1000).toFixed(2)).replace(".", ",")} L</span>
        </Row>
        <Row label="Hábitos" href="/study">
          {habits.length ? <span className="tabular-nums">{doneHabits} de {habits.length}</span> : "—"}
        </Row>
        <Row label="Suplementos" href="/recovery/health">
          {supps.length ? (suppPending.length ? `pendiente: ${suppPending.join(", ")}` : "todo tomado ✓") : "—"}
        </Row>
        <Row label="Estudio" href="/study/focus">
          <span className="tabular-nums">{study._sum.minutes ?? 0} min</span>
        </Row>
        <Row label="Próxima competición" href="/planning">
          {comp ? `${comp.title} · en ${diffDays(comp.startAt, now)} d` : "—"}
        </Row>
        <Row label="Entregas" href="/study/assignments">
          {a ? `${a.subject}: ${a.title} · ${assignmentAlert(a, day).text}` : "—"}
        </Row>
        <Row label="Plazos" href="/finance">
          {deadline ? `${deadline.title} · ${formatDate(toIsoDay(deadline.dueOn), { day: "numeric", month: "short" })}` : "—"}
        </Row>
        <Row label="Temporada" href="/finance">
          {sb.hasBudget ? (
            <span className={sb.overBudgetCents ? "text-destructive" : undefined}>
              {formatEur(sb.spentCents)} de {formatEur(sb.plannedCents)}
              {sb.overBudgetCents ? " · previsión por encima" : ""}
            </span>
          ) : (
            "sin presupuesto"
          )}
        </Row>
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">
        Añádela a la pantalla de inicio del móvil para abrirla de un toque. Ver el{" "}
        <Link href="/" className="underline underline-offset-2">
          panel completo
        </Link>
        .
      </p>
    </>
  );
}
