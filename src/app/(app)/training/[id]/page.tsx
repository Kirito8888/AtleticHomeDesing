import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Stat } from "@/components/stat";
import { DeleteSessionButton } from "@/components/training/delete-session-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { pageUser } from "@/lib/auth/page";
import { formatDate, formatDuration, formatNum, formatPace, SESSION_TYPE_LABEL, TECHNICAL_EVENT_LABEL } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { isEditableType } from "@/lib/training/form-initial";

const METHOD_LABEL: Record<string, string> = {
  HR_TSS: "hrTSS (FC)",
  PACE_TSS: "por ritmo",
  SRPE: "sRPE (Foster)",
  TONNAGE: "series duras",
  TECHNICAL: "intentos técnicos",
  MANUAL: "manual",
};

export default async function SessionPage({ params }: PageProps<"/training/[id]">) {
  const user = await pageUser();
  const { id } = await params;
  const s = await prisma.trainingSession.findFirst({
    where: { id, userId: user.id },
    include: {
      track: { include: { intervals: { orderBy: { order: "asc" } } } },
      technical: { include: { attempts: { orderBy: { order: "asc" } } } },
      strength: { include: { sets: { orderBy: { order: "asc" }, include: { exercise: { select: { name: true } } } } } },
      personalRecords: true,
    },
  });
  if (!s) notFound();

  const byExercise = new Map<string, NonNullable<typeof s.strength>["sets"]>();
  for (const set of s.strength?.sets ?? []) {
    const list = byExercise.get(set.exercise.name) ?? [];
    list.push(set);
    byExercise.set(set.exercise.name, list);
  }

  return (
    <>
      <PageHeader
        title={s.title ?? SESSION_TYPE_LABEL[s.type]}
        description={formatDate(s.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        action={
          <div className="flex gap-2">
            {isEditableType(s.type) ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/training/${s.id}/edit`}>
                  <Pencil /> Editar
                </Link>
              </Button>
            ) : null}
            <DeleteSessionButton id={s.id} />
          </div>
        }
      />
      <Card className="mb-4 py-4">
        <CardContent className="grid grid-cols-3 gap-3 px-4">
          <Stat label="TSS" value={s.tss != null ? formatNum(s.tss) : "—"} hint={s.tssMethod ? METHOD_LABEL[s.tssMethod] : undefined} />
          <Stat label="Duración" value={formatDuration(s.durationSec)} />
          <Stat label="RPE" value={s.sessionRpe ?? "—"} />
        </CardContent>
      </Card>

      {s.personalRecords.length ? (
        <p className="mb-4 flex flex-wrap gap-2">
          {s.personalRecords.map((pr) => (
            <Badge key={pr.id}>🏆 Marca personal: {formatNum(pr.value, 2)} {pr.kind === "ONE_RM" ? "kg" : "m"}</Badge>
          ))}
        </p>
      ) : null}

      {s.strength ? (
        <div className="grid gap-3">
          {[...byExercise.entries()].map(([name, sets]) => (
            <Card key={name} className="gap-2 py-4">
              <CardHeader className="px-4">
                <CardTitle className="text-base">{name}</CardTitle>
              </CardHeader>
              <CardContent className="px-4">
                <table className="w-full text-sm tabular-nums">
                  <thead className="text-xs text-muted-foreground">
                    <tr>
                      <th className="text-left font-normal">Serie</th>
                      <th className="text-right font-normal">Peso</th>
                      <th className="text-right font-normal">Reps</th>
                      <th className="text-right font-normal">RPE</th>
                      <th className="text-right font-normal">e1RM</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sets.map((x) => (
                      <tr key={x.id} className={x.isWarmup ? "text-muted-foreground" : ""}>
                        <td>{x.isWarmup ? "Cal." : x.setIndex}</td>
                        <td className="text-right">{formatNum(x.weightKg, 2)} kg</td>
                        <td className="text-right">{x.reps}</td>
                        <td className="text-right">{x.rpe ?? "—"}</td>
                        <td className="text-right">{x.est1RmKg != null ? formatNum(x.est1RmKg) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ))}
          <p className="text-sm text-muted-foreground">Tonelaje: {formatNum(s.strength.tonnageKg ?? 0)} kg</p>
        </div>
      ) : null}

      {s.technical ? (
        <Card className="gap-2 py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-base">
              {TECHNICAL_EVENT_LABEL[s.technical.event]}
              {s.technical.implementWeightG ? ` · ${s.technical.implementWeightG} g` : ""}
              {s.technical.bestMarkM != null ? ` · mejor ${formatNum(s.technical.bestMarkM, 2)} m` : ""}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 px-4">
            {s.technical.attempts.map((a) => (
              <div key={a.id} className="rounded-md border p-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">#{a.order}</span>
                  <span className="font-semibold tabular-nums">{a.isFoul ? "Nulo" : a.markM != null ? `${formatNum(a.markM, 2)} m` : "—"}</span>
                </div>
                {[a.runUpNotes, a.blockNotes, a.releaseNotes].some(Boolean) ? (
                  <ul className="mt-1 text-xs text-muted-foreground">
                    {a.runUpNotes ? <li>Carrera: {a.runUpNotes}</li> : null}
                    {a.blockNotes ? <li>Bloqueo/batida: {a.blockNotes}</li> : null}
                    {a.releaseNotes ? <li>Suelta/vuelo: {a.releaseNotes}</li> : null}
                  </ul>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {s.track ? (
        <Card className="gap-2 py-4">
          <CardContent className="grid gap-3 px-4">
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Distancia" value={s.track.distanceM ? formatNum(s.track.distanceM / 1000, 2) : "—"} unit="km" />
              <Stat label="Ritmo" value={s.track.avgPaceSecPerKm ? formatPace(s.track.avgPaceSecPerKm) : s.track.avgPaceSecPer100m ? formatPace(s.track.avgPaceSecPer100m, "/100 m") : "—"} />
              <Stat label="FC media" value={s.track.hrAvg ?? "—"} unit="ppm" />
            </div>
            {s.track.intervals.length ? (
              <table className="w-full text-sm tabular-nums">
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left font-normal">#</th>
                    <th className="text-right font-normal">Metros</th>
                    <th className="text-right font-normal">Tiempo</th>
                    <th className="text-right font-normal">Recup.</th>
                  </tr>
                </thead>
                <tbody>
                  {s.track.intervals.map((iv) => (
                    <tr key={iv.id}>
                      <td>{iv.order}</td>
                      <td className="text-right">{iv.distanceM ?? "—"}</td>
                      <td className="text-right">{iv.timeSec != null ? (iv.timeSec < 60 ? `${formatNum(iv.timeSec, 2)} s` : formatDuration(iv.timeSec)) : "—"}</td>
                      <td className="text-right">{formatDuration(iv.recoverySec)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {s.notes ? <p className="mt-4 text-sm whitespace-pre-wrap text-muted-foreground">{s.notes}</p> : null}
    </>
  );
}
