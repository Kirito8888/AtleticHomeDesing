import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { Stat } from "@/components/stat";
import { CommentThread } from "@/components/training/comment-thread";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError } from "@/lib/api";
import { pageUser } from "@/lib/auth/page";
import { resolveAthleteId } from "@/lib/auth/session";
import { formatDate, formatDuration, formatNum, SESSION_TYPE_LABEL } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { sessionThread } from "@/lib/training/comments-service";

export const metadata = { title: "Sesión del atleta · Atlenza" };

/** Sesión de un atleta vista por su entrenador/a (permiso de sesiones), con el hilo de comentarios. */
export default async function CoachSessionPage({ params, searchParams }: PageProps<"/coach/session/[id]">) {
  const user = await pageUser();
  const { id } = await params;
  const { athleteId } = await searchParams;
  if (typeof athleteId !== "string") notFound();
  let athlete: string;
  try {
    athlete = await resolveAthleteId(user, athleteId, "SESSIONS");
  } catch (e) {
    if (e instanceof ApiError) notFound();
    throw e;
  }
  const s = await prisma.trainingSession.findFirst({
    where: { id, userId: athlete },
    include: {
      technical: { select: { event: true, implementWeightG: true, bestMarkM: true, attempts: { select: { markM: true, isFoul: true }, orderBy: { order: "asc" } } } },
      strength: { include: { sets: { orderBy: { order: "asc" }, include: { exercise: { select: { name: true } } } } } },
    },
  });
  if (!s) notFound();
  const comments = await sessionThread(user, s.id, athlete);

  return (
    <>
      <PageHeader title={s.title ?? SESSION_TYPE_LABEL[s.type]} description={formatDate(s.date, { weekday: "long", day: "numeric", month: "long" })} />
      <p className="mb-3 text-xs">
        <Link href="/coach" className="underline underline-offset-2">
          ← Mis atletas
        </Link>
      </p>
      <Card className="mb-4 py-4">
        <CardContent className="grid grid-cols-3 gap-3 px-4">
          <Stat label="TSS" value={s.tss != null ? formatNum(s.tss) : "—"} />
          <Stat label="Duración" value={formatDuration(s.durationSec)} />
          <Stat label="RPE" value={s.sessionRpe ?? "—"} />
        </CardContent>
      </Card>
      {s.technical?.attempts.length ? (
        <p className="mb-3 text-sm">
          Intentos:{" "}
          <span className="tabular-nums">{s.technical.attempts.map((a) => (a.isFoul ? "X" : a.markM != null ? formatNum(a.markM, 2) : "—")).join(" · ")}</span>
          {s.technical.implementWeightG ? ` (${s.technical.implementWeightG} g)` : ""}
        </p>
      ) : null}
      {s.strength?.sets.length ? (
        <ul className="mb-3 grid gap-0.5 text-sm tabular-nums">
          {s.strength.sets.map((x) => (
            <li key={x.id}>
              {x.exercise.name}: {x.reps ?? "—"} × {x.weightKg != null ? `${formatNum(x.weightKg)} kg` : "—"}
              {x.rir != null ? ` · RIR ${x.rir}` : ""}
            </li>
          ))}
        </ul>
      ) : null}
      {s.notes ? <p className="mb-3 text-sm whitespace-pre-wrap text-muted-foreground">{s.notes}</p> : null}
      <Card className="gap-3 py-4">
        <CardHeader className="px-4">
          <CardTitle className="text-sm">Comentarios</CardTitle>
        </CardHeader>
        <CardContent className="px-4">
          <CommentThread sessionId={s.id} athleteId={athlete} initial={comments} />
        </CardContent>
      </Card>
    </>
  );
}
