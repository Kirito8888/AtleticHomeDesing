import Link from "next/link";

import { PageHeader } from "@/components/page-header";
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
    where: { coachId: user.id, status: "ACTIVE", scopes: { has: "SESSIONS" } },
    include: { athlete: { select: { id: true, name: true, email: true } } },
  });
  const now = today();
  const ids = links.map((l) => l.athleteId);
  const [sessions, counts] = await Promise.all([
    prisma.trainingSession.findMany({
      where: { userId: { in: ids }, date: { gte: addDays(now, -14), lte: addDays(now, 7) } },
      orderBy: { date: "desc" },
      select: { id: true, userId: true, date: true, title: true, type: true, status: true, sessionRpe: true, tss: true },
    }),
    prisma.sessionComment.groupBy({ by: ["sessionId"], where: { athleteId: { in: ids } }, _count: { _all: true } }),
  ]);
  const nComments = new Map(counts.map((c) => [c.sessionId, c._count._all]));

  return (
    <>
      <PageHeader title="Mis atletas" description="Últimas 2 semanas y la próxima. Toca una sesión para comentarla." />
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
