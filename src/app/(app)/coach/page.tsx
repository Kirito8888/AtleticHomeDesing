import Link from "next/link";

import { BulkComment } from "@/components/coach/bulk-comment";
import { PageHeader } from "@/components/page-header";
import { compareAthletes } from "@/lib/coach/compare";
import { toIsoDay } from "@/lib/dates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { pageUser } from "@/lib/auth/page";
import { addDays, today } from "@/lib/dates";
import { formatDate, formatNum, SESSION_TYPE_LABEL } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Mis atletas · LifeOS" };

/** Vista de entrenador/a: sesiones recientes y próximas de cada atleta que le ha dado permiso de sesiones. */
export default async function CoachPage() {
  const user = await pageUser();
  const links = await prisma.coachAthlete.findMany({
    // v1.7: sin atletas que hayan limitado el tratamiento de sus datos (art. 18 RGPD)
    where: { coachId: user.id, status: "ACTIVE", scopes: { has: "SESSIONS" }, athlete: { processingRestrictedAt: null } },
    include: { athlete: { select: { id: true, name: true, email: true } } },
  });
  const now = today();
  const ids = links.map((l) => l.athleteId);
  const [sessions, counts] = await Promise.all([
    prisma.trainingSession.findMany({
      where: { userId: { in: ids }, date: { gte: addDays(now, -30), lte: addDays(now, 7) } },
      orderBy: { date: "desc" },
      select: { id: true, userId: true, date: true, title: true, type: true, status: true, sessionRpe: true, tss: true, durationSec: true, technical: { select: { bestMarkM: true } } },
    }),
    prisma.sessionComment.groupBy({ by: ["sessionId"], where: { athleteId: { in: ids } }, _count: { _all: true } }),
  ]);
  const nComments = new Map(counts.map((c) => [c.sessionId, c._count._all]));
  const todayIso = toIsoDay(now);
  // Comparativa (cada dato solo con su permiso: carga y marcas con LOAD, cumplimiento con SESSIONS)
  const table = compareAthletes(
    links.map((l) => ({
      id: l.athleteId,
      name: l.athlete.name ?? l.athlete.email,
      scopes: l.scopes,
      sessions: sessions.filter((s) => s.userId === l.athleteId).map((s) => ({ date: toIsoDay(s.date), status: s.status, sessionRpe: s.sessionRpe, durationSec: s.durationSec, bestMarkM: s.technical?.bestMarkM ?? null })),
    })),
    todayIso,
  );
  const recentDone = sessions.filter((s) => s.status === "COMPLETED" && s.date >= addDays(now, -14)).slice(0, 40);
  const nameOf = new Map(links.map((l) => [l.athleteId, l.athlete.name ?? l.athlete.email]));

  return (
    <>
      <PageHeader title="Mis atletas" description="Últimas 2 semanas y la próxima. Toca una sesión para comentarla." />
      {links.length > 1 || table.some((r) => r.load7 != null) ? (
        <div className="mb-4 overflow-x-auto rounded-md border">
          <table className="w-full text-sm tabular-nums" aria-label="Comparativa de atletas">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-1.5 text-left font-normal">Atleta</th>
                <th className="px-3 py-1.5 text-right font-normal">Carga 7 días</th>
                <th className="px-3 py-1.5 text-right font-normal">Cumplimiento 14 días</th>
                <th className="px-3 py-1.5 text-right font-normal">Mejor marca 30 días</th>
              </tr>
            </thead>
            <tbody>
              {table.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-1.5">{r.name}</td>
                  <td className="px-3 py-1.5 text-right">{r.load7 ?? "—"}</td>
                  <td className="px-3 py-1.5 text-right">{r.compliancePct != null ? `${r.compliancePct} %` : "—"}</td>
                  <td className="px-3 py-1.5 text-right">{r.best30 != null ? `${formatNum(r.best30, 2)} m` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-3 pb-2 text-xs text-muted-foreground">«—»: sin datos o sin permiso de carga. Nunca se muestran salud, ciclo ni finanzas.</p>
        </div>
      ) : null}
      {links.length ? (
        <div className="mb-4">
          <BulkComment items={recentDone.map((s) => ({ id: s.id, athleteId: s.userId, label: `${nameOf.get(s.userId)} · ${formatDate(s.date, { weekday: "short", day: "numeric" })} · ${s.title ?? SESSION_TYPE_LABEL[s.type]}` }))} />
        </div>
      ) : null}
      {links.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {links.map((l) => {
            const list = sessions.filter((s) => s.userId === l.athleteId);
            return (
              <Card key={l.id} className="gap-2 py-4">
                <CardHeader className="px-4">
                  <CardTitle className="text-sm">{l.athlete.name ?? l.athlete.email}</CardTitle>
                </CardHeader>
                <CardContent className="px-4 text-sm">
                  {list.length ? (
                    <ul className="grid gap-1">
                      {list.map((s) => (
                        <li key={s.id}>
                          <Link href={`/coach/session/${s.id}?athleteId=${l.athleteId}`} className="flex justify-between gap-2 rounded-md border px-2 py-1.5 hover:bg-accent">
                            <span className="min-w-0 truncate">
                              {s.status === "PLANNED" ? "○ " : "✓ "}
                              {formatDate(s.date, { weekday: "short", day: "numeric" })} · {s.title ?? SESSION_TYPE_LABEL[s.type]}
                            </span>
                            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                              {s.sessionRpe != null ? `RPE ${s.sessionRpe}` : ""}
                              {s.tss != null ? ` · ${formatNum(s.tss)} TSS` : ""}
                              {nComments.get(s.id) ? ` · 💬 ${nComments.get(s.id)}` : ""}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-muted-foreground">Sin sesiones en estas fechas.</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Ningún atleta te ha dado acceso a sus sesiones. Las invitaciones se gestionan en{" "}
          <Link href="/settings" className="underline underline-offset-2">
            Ajustes
          </Link>
          .
        </p>
      )}
    </>
  );
}
