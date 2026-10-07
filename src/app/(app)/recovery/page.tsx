import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { CycleCard } from "@/components/recovery/cycle-card";
import { InjuriesPanel } from "@/components/recovery/injuries-panel";
import { Button } from "@/components/ui/button";
import { RecoveryForm } from "@/components/recovery/recovery-form";
import { readinessStatus, StatusLabel } from "@/components/status";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { pageUser } from "@/lib/auth/page";
import { addDays, today, toIsoDay } from "@/lib/dates";
import { formatDate, formatNum, READINESS_LABEL } from "@/lib/format";
import { cyclePhase, suggestLight } from "@/lib/health/cycle";
import { getCycle } from "@/lib/health/cycle-service";
import { prisma } from "@/lib/prisma";
import { dataKeyConfigured } from "@/lib/security/data-key";
import { listInjuries } from "@/lib/recovery/injuries";
import { READINESS_WEIGHTS, type ReadinessComponent } from "@/lib/training/readiness";
import { womenEnabled } from "@/lib/health/women-service";

export const metadata = { title: "Recuperación · LifeOS" };

const PART_LABEL: Record<ReadinessComponent, string> = {
  hrv: "VFC vs tu línea base",
  tsb: "Forma (TSB)",
  sleep: "Sueño",
  rhr: "FC reposo vs línea base",
  doms: "Agujetas",
  wellness: "Bienestar",
};

export default async function RecoveryPage() {
  const user = await pageUser();
  const now = today();
  const [todayRow, recent, profile, injuries] = await Promise.all([
    prisma.recoveryMetrics.findUnique({ where: { userId_date: { userId: user.id, date: now } } }),
    prisma.recoveryMetrics.findMany({ where: { userId: user.id, date: { gte: addDays(now, -13) } }, orderBy: { date: "desc" } }),
    prisma.athleteProfile.findUnique({ where: { userId: user.id }, select: { bodyWeightKg: true, sex: true } }),
    listInjuries(user.id),
  ]);
  const parts = (todayRow?.readinessParts ?? {}) as Partial<Record<ReadinessComponent, number>> & { label?: keyof typeof READINESS_LABEL; usedWeight?: number };
  const status = readinessStatus(todayRow?.readinessScore);
  // «Mi ciclo»: solo si el perfil es de mujer o ya hay datos, y si el servidor puede cifrarlos.
  const day = toIsoDay(now);
  const cycle = dataKeyConfigured() ? await getCycle(user.id, 200) : null;
  const showCycle = Boolean(cycle) && (profile?.sex === "FEMALE" || Boolean(cycle?.settings) || Boolean(cycle?.logs.length));
  const showWomen = await womenEnabled(user.id);
  const todayLog = cycle?.logs.find((l) => l.date === day) ?? null;

  return (
    <>
      <PageHeader
        title="Recuperación"
        description="Registro diario: 1 minuto al despertar."
        action={
          showWomen ? (
            <Button asChild variant="outline" size="sm">
              <Link href="/recovery/women">Salud de la mujer</Link>
            </Button>
          ) : undefined
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <RecoveryForm
          initial={{
            date: toIsoDay(now),
            sleepHours: todayRow?.sleepHours ?? null,
            sleepQuality: todayRow?.sleepQuality ?? null,
            hrvRmssdMs: todayRow?.hrvRmssdMs ?? null,
            restingHr: todayRow?.restingHr ?? null,
            doms: todayRow?.doms ?? null,
            fatigue: todayRow?.fatigue ?? null,
            stress: todayRow?.stress ?? null,
            mood: todayRow?.mood ?? null,
            bodyWeightKg: todayRow?.bodyWeightKg ?? profile?.bodyWeightKg ?? null,
            bodyFatPct: todayRow?.bodyFatPct ?? null,
            squeezePain: todayRow?.squeezePain ?? null,
            heelPain: todayRow?.heelPain ?? null,
            jumpCm: todayRow?.jumpCm ?? null,
            elbowSymptoms: todayRow?.elbowSymptoms ?? null,
          }}
        />
        <div className="grid content-start gap-4">
          {showCycle && cycle ? (
            <CycleCard
              today={day}
              settings={cycle.settings}
              todayLog={todayLog ? { period: todayLog.period, symptoms: todayLog.symptoms } : null}
              phase={cycle.settings ? cyclePhase(day, cycle.settings, cycle.logs) : null}
              suggestion={suggestLight(day, cycle.settings, cycle.logs)}
            />
          ) : null}
          <InjuriesPanel
            today={toIsoDay(now)}
            injuries={injuries.map((i) => ({
              id: i.id,
              area: i.area,
              side: i.side,
              pain: i.pain,
              limitsTraining: i.limitsTraining,
              startedOn: toIsoDay(i.startedOn),
              resolvedOn: i.resolvedOn ? toIsoDay(i.resolvedOn) : null,
              notes: i.notes,
            }))}
          />
          <Card className="gap-3 py-4">
            <CardHeader className="px-4">
              <CardTitle className="text-sm">Readiness de hoy</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 px-4">
              {todayRow?.readinessScore != null && status ? (
                <>
                  <div className="flex items-end justify-between">
                    <span className="text-5xl font-semibold tabular-nums">{Math.round(todayRow.readinessScore)}</span>
                    <StatusLabel status={status}>{parts.label ? READINESS_LABEL[parts.label] : ""}</StatusLabel>
                  </div>
                  <ul className="grid gap-2">
                    {(Object.keys(READINESS_WEIGHTS) as ReadinessComponent[])
                      .filter((k) => parts[k] != null)
                      .map((k) => (
                        <li key={k} className="grid gap-1">
                          <div className="flex justify-between text-xs">
                            <span>
                              {PART_LABEL[k]} <span className="text-muted-foreground">({Math.round(READINESS_WEIGHTS[k] * 100)} %)</span>
                            </span>
                            <span className="tabular-nums">{parts[k]}</span>
                          </div>
                          <Progress value={parts[k]} aria-label={PART_LABEL[k]} />
                        </li>
                      ))}
                  </ul>
                  {parts.usedWeight != null && parts.usedWeight < 1 ? (
                    <p className="text-xs text-muted-foreground">Calculado con el {Math.round(parts.usedWeight * 100)} % de la información posible.</p>
                  ) : null}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Rellena el registro. La VFC y la FC en reposo necesitan 5 días previos para tener línea base.
                </p>
              )}
            </CardContent>
          </Card>
          {recent.length ? (
            <Card className="gap-2 py-4">
              <CardHeader className="px-4">
                <CardTitle className="text-sm">Últimos 14 días</CardTitle>
              </CardHeader>
              <CardContent className="px-4">
                <table className="w-full text-xs tabular-nums">
                  <thead className="text-muted-foreground">
                    <tr>
                      <th className="text-left font-normal">Día</th>
                      <th className="text-right font-normal">Ready</th>
                      <th className="text-right font-normal">VFC</th>
                      <th className="text-right font-normal">Sueño</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map((r) => (
                      <tr key={r.id}>
                        <td>{formatDate(r.date)}</td>
                        <td className="text-right">{r.readinessScore != null ? Math.round(r.readinessScore) : "—"}</td>
                        <td className="text-right">{formatNum(r.hrvRmssdMs)}</td>
                        <td className="text-right">{formatNum(r.sleepHours)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
