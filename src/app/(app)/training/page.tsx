import Link from "next/link";
import { LineChart, Plus, Trophy } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { pageUser } from "@/lib/auth/page";
import { formatDate, formatDuration, formatNum, formatPace, SESSION_TYPE_LABEL, TECHNICAL_EVENT_LABEL } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Entrenamiento · LifeOS" };

export default async function TrainingPage() {
  const user = await pageUser();
  const [sessions, records] = await Promise.all([
    prisma.trainingSession.findMany({
      where: { userId: user.id },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 40,
      include: {
        track: { select: { modality: true, distanceM: true, avgPaceSecPerKm: true } },
        technical: { select: { event: true, implementWeightG: true, bestMarkM: true } },
        strength: { select: { tonnageKg: true, _count: { select: { sets: true } } } },
      },
    }),
    prisma.personalRecord.findMany({
      where: { userId: user.id },
      orderBy: { achievedOn: "desc" },
      take: 6,
      include: { exercise: { select: { name: true } } },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Entrenamiento"
        action={
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/training/performance" aria-label="Rendimiento">
                <LineChart /> <span className="hidden sm:inline">Rendimiento</span>
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/training/new">
                <Plus /> Sesión
              </Link>
            </Button>
          </div>
        }
      />

      {records.length ? (
        <Card className="mb-4 gap-3 py-4">
          <CardHeader className="px-4">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Trophy className="size-4 text-muted-foreground" /> Últimas marcas personales
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 px-4 sm:grid-cols-3">
            {records.map((r) => (
              <div key={r.id} className="min-w-0">
                <div className="truncate text-xs text-muted-foreground">
                  {r.kind === "ONE_RM"
                    ? `${r.exercise?.name ?? "Ejercicio"} · 1RM${r.isEstimated ? " est." : ""}`
                    : `${TECHNICAL_EVENT_LABEL[r.technicalEvent ?? "OTHER"]}${r.implementWeightG ? ` ${r.implementWeightG} g` : ""}`}
                </div>
                <div className="text-lg font-semibold tabular-nums">
                  {formatNum(r.value, 2)} {r.kind === "ONE_RM" ? "kg" : r.kind === "TRACK_TIME" ? "s" : "m"}
                </div>
                <div className="text-xs text-muted-foreground">{formatDate(r.achievedOn)}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {sessions.length ? (
        <ul className="grid gap-2">
          {sessions.map((s) => {
            const detail = s.technical
              ? `${TECHNICAL_EVENT_LABEL[s.technical.event]}${s.technical.bestMarkM != null ? ` · ${formatNum(s.technical.bestMarkM, 2)} m` : ""}`
              : s.strength
                ? `${s.strength._count.sets} series · ${formatNum(s.strength.tonnageKg ?? 0, 1)} kg`
                : s.track
                  ? `${s.track.distanceM ? `${formatNum(s.track.distanceM / 1000, 2)} km` : ""}${s.track.avgPaceSecPerKm ? ` · ${formatPace(s.track.avgPaceSecPerKm)}` : ""}`
                  : "";
            return (
              <li key={s.id}>
                <Link href={`/training/${s.id}`} className="flex items-center gap-3 rounded-lg border p-3 hover:bg-accent">
                  <div className="w-12 shrink-0 text-center text-xs text-muted-foreground">{formatDate(s.date)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{s.title ?? SESSION_TYPE_LABEL[s.type]}</span>
                      {s.status !== "COMPLETED" ? <Badge variant="outline">{s.status === "PLANNED" ? "Planificada" : "Omitida"}</Badge> : null}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{detail || formatDuration(s.durationSec)}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-semibold tabular-nums">{s.tss != null ? formatNum(s.tss) : "—"}</div>
                    <div className="text-[10px] text-muted-foreground">TSS</div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <Card>
          <CardContent className="grid gap-3 text-sm text-muted-foreground">
            Aún no hay sesiones.
            <Button asChild className="w-fit">
              <Link href="/training/new">Registrar la primera</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </>
  );
}
