import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Stat } from "@/components/stat";
import { DeleteSessionButton } from "@/components/training/delete-session-button";
import { DayActions } from "@/components/ai-plan/day-actions";
import { PlanDayView } from "@/components/training/plan-day-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { pageUser } from "@/lib/auth/page";
import { formatDate, formatDuration, formatNum, formatPace, SESSION_TYPE_LABEL, TECHNICAL_EVENT_LABEL } from "@/lib/format";
import { dayView } from "@/lib/ai-plan/day-view";
import { annotateKg } from "@/lib/training/plan-to-form";
import { rmContext } from "@/lib/training/rm-service";
import { RuleAlerts } from "@/components/rules/rule-alerts";
import { today, toIsoDay } from "@/lib/dates";
import { rulesToday } from "@/lib/rules/rules-service";
import { cycleToday } from "@/lib/health/cycle-service";
import type { VariantOption } from "@/lib/planning/plan-import/types";
import { planDayForSession } from "@/lib/planning/plan-import/service";
import { prisma } from "@/lib/prisma";
import { isEditableType } from "@/lib/training/form-initial";
import { consistency } from "@/lib/training/consistency";
import { MoveSession, RescheduleCard } from "@/components/training/move-session";
import { rescheduleSuggestions } from "@/lib/training/move-service";
import { getPrefs } from "@/lib/rules/prefs-service";
import { velocityLoss } from "@/lib/training/vbt";
import { sessionPlanVsDone } from "@/lib/training/plan-vs-done-service";
import { CommentThread } from "@/components/training/comment-thread";
import { sessionThread } from "@/lib/training/comments-service";

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
  const plan = await planDayForSession(user.id, s.id);
  const view = plan ? dayView(plan) : null;
  const rmCtx = view ? await rmContext(user.id) : null;
  const cycle = view?.hasLight && s.status === "PLANNED" ? await cycleToday(user.id, toIsoDay(s.date)) : null;
  // Avisos de «Mis reglas» solo en la sesión planificada de hoy.
  const todayIso = toIsoDay(today());
  const alerts = s.status === "PLANNED" && toIsoDay(s.date) === todayIso ? await rulesToday(user.id, todayIso) : [];

  const { vbtLossMax } = await getPrefs(user.id);
  const pvd = plan && s.status === "COMPLETED" && s.strength ? await sessionPlanVsDone(user.id, s.id, rmCtx ?? undefined) : null;
  const byExercise = new Map<string, NonNullable<typeof s.strength>["sets"]>();
  for (const set of s.strength?.sets ?? []) {
    const list = byExercise.get(set.exercise.name) ?? [];
    list.push(set);
    byExercise.set(set.exercise.name, list);
  }

  const [comments, hasCoach] = await Promise.all([
    sessionThread(user, s.id),
    prisma.coachAthlete.count({ where: { athleteId: user.id, status: "ACTIVE", scopes: { has: "SESSIONS" } } }).then((n) => n > 0),
  ]);
  return (
    <>
      <PageHeader
        title={s.title ?? SESSION_TYPE_LABEL[s.type]}
        description={formatDate(s.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        action={
          <div className="flex gap-2">
            {isEditableType(s.type) || s.status === "PLANNED" ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/training/${s.id}/edit`}>
                  <Pencil /> {s.status === "PLANNED" ? "Registrar" : "Editar"}
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

      <RuleAlerts alerts={alerts} />
      {s.status === "PLANNED" && toIsoDay(s.date) < toIsoDay(today()) ? <RescheduleCard id={s.id} date={toIsoDay(s.date)} options={await rescheduleSuggestions(user.id, s.id)} /> : null}
      {s.status === "PLANNED" ? <MoveSession id={s.id} date={toIsoDay(s.date)} /> : null}
      {plan ? (
        <p className="mb-2 text-right text-xs">
          <Link href={`/print/plan/${plan.id}`} className="underline underline-offset-2">
            Versión para imprimir
          </Link>
        </p>
      ) : null}
      {view?.taperPct ? (
        <p role="status" className="mb-3 rounded-md border border-primary/40 bg-primary/5 p-2 text-sm">
          Afinamiento −{view.taperPct} % de series (antes de competir). El plan original se conserva.
        </p>
      ) : null}
      {plan && view && s.status === "PLANNED" ? (
        <DayActions dayId={plan.id} mode={plan.mode} hasLight={view.hasLight} swappable={view.swappable} suggestion={cycle?.suggestion} />
      ) : null}
      {plan && view ? (
        <PlanDayView
          blocks={rmCtx ? annotateKg(view.blocks, rmCtx.rms, rmCtx.aliases, rmCtx.step) : view.blocks}
          heading={
            <>
              <Link href={`/planning/meso/${plan.meso.code}`} className="underline-offset-2 hover:underline">
                {plan.meso.code} · {plan.meso.name}
              </Link>{" "}
              · {plan.code}
              {plan.weekTitle ? ` · ${plan.weekTitle}` : ""}
              {plan.variant ? ` · ${(plan.meso.variants as VariantOption[]).find((v) => v.code === plan.variant || v.code.startsWith(`${plan.variant}-`))?.label ?? plan.variant}` : ""}
              {s.status === "COMPLETED" ? " · ya hecha (el plan puede haber cambiado después)" : ""}
            </>
          }
        />
      ) : null}

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
                {(() => {
                  const vs = sets.filter((x) => !x.isWarmup && x.velocityMs != null).map((x) => x.velocityMs!);
                  const loss = velocityLoss(vs);
                  return vs.length ? (
                    <p className={loss != null && loss > vbtLossMax ? "mt-2 text-xs font-medium text-destructive" : "mt-2 text-xs text-muted-foreground"} aria-label="VBT">
                      VBT: {vs.map((v) => formatNum(v, 2)).join(" · ")} m/s
                      {loss != null ? ` · pérdida ${formatNum(loss, 1)} %${loss > vbtLossMax ? ` (más del ${vbtLossMax} %: fatiga; corta las series aquí la próxima vez)` : ""}` : ""}
                    </p>
                  ) : null;
                })()}
              </CardContent>
            </Card>
          ))}
          <p className="text-sm text-muted-foreground">Tonelaje: {formatNum(s.strength.tonnageKg ?? 0)} kg</p>
          {pvd?.length ? (
            <Card className="gap-2 py-4">
              <CardHeader className="px-4">
                <CardTitle className="text-base">Plan frente a hecho</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto px-4">
                <table className="w-full text-xs tabular-nums" aria-label="Plan frente a hecho">
                  <thead className="text-muted-foreground">
                    <tr>
                      <th className="text-left font-normal">Ejercicio</th>
                      <th className="text-right font-normal">Plan</th>
                      <th className="text-right font-normal">Hecho</th>
                      <th className="text-right font-normal">Tonelaje</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pvd.map((r, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-1 pr-2">
                          {r.exercise}
                          {r.suggestedKg ? <span className="block text-xs text-muted-foreground">kg del día: {formatNum(r.suggestedKg, 1)}</span> : null}
                        </td>
                        <td className="py-1 text-right">{r.plan ? `${r.plan.sets}×${Math.round(r.plan.reps / r.plan.sets)}${r.plan.avgKg ? ` @${formatNum(r.plan.avgKg, 1)}` : ""}` : "—"}</td>
                        <td className="py-1 text-right">{r.done ? `${r.done.sets}×${Math.round(r.done.reps / r.done.sets)}${r.done.avgKg ? ` @${formatNum(r.done.avgKg, 1)}` : ""}` : "—"}</td>
                        <td className={r.tonnagePct != null && r.tonnagePct < -10 ? "py-1 text-right text-destructive" : "py-1 text-right"}>{r.tonnagePct != null ? `${r.tonnagePct > 0 ? "+" : ""}${r.tonnagePct} %` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ) : null}
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
            {(() => {
              const c = consistency(s.technical.attempts);
              const w = s.technical.conditions as { tempC: number | null; windMs: number | null; rainMm: number | null } | null;
              return (
                <>
                  {c.valid ? (
                    <dl className="grid grid-cols-4 gap-2 rounded-md bg-muted/50 p-2 text-xs" aria-label="Consistencia">
                      <div>
                        <dt className="text-muted-foreground">Media</dt>
                        <dd className="font-semibold tabular-nums">{formatNum(c.mean!, 2)} m</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">CV</dt>
                        <dd className="font-semibold tabular-nums">{c.cvPct != null ? `${formatNum(c.cvPct, 1)} %` : "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Nulos</dt>
                        <dd className="font-semibold tabular-nums">{c.foulPct} %</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Válidos</dt>
                        <dd className="font-semibold tabular-nums">
                          {c.valid}/{c.attempts}
                        </dd>
                      </div>
                    </dl>
                  ) : null}
                  {w ? (
                    <p className="text-xs text-muted-foreground" aria-label="Condiciones">
                      🌡 {w.tempC != null ? `${formatNum(w.tempC, 1)} °C` : "—"} · 💨 {w.windMs != null ? `${formatNum(w.windMs, 1)} m/s` : "—"}
                      {w.rainMm ? ` · 🌧 ${formatNum(w.rainMm, 1)} mm` : ""} <span className="opacity-70">(Open-Meteo)</span>
                    </p>
                  ) : null}
                </>
              );
            })()}
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

      {comments.length || hasCoach ? (
        <Card className="mt-4 gap-3 py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-sm">Comentarios con tu entrenador/a</CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            <CommentThread sessionId={s.id} initial={comments} />
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
