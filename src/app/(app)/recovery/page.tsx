import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { CycleCard } from "@/components/recovery/cycle-card";
import { InjuriesPanel } from "@/components/recovery/injuries-panel";
import { RecoveryForm } from "@/components/recovery/recovery-form";
import { readinessStatus, StatusLabel } from "@/components/status";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { pageUser } from "@/lib/auth/page";
import { addDays, today, toIsoDay } from "@/lib/dates";
import { formatDate, formatNum, READINESS_LABEL } from "@/lib/format";
import { cyclePhase, suggestLight } from "@/lib/health/cycle";
import { getCycle } from "@/lib/health/cycle-service";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { dataKeyConfigured } from "@/lib/security/data-key";
import { listInjuries } from "@/lib/recovery/injuries";
import { READINESS_WEIGHTS, type ReadinessComponent } from "@/lib/training/readiness";
import { womenEnabled } from "@/lib/health/women-service";
import { readProtocol } from "@/lib/recovery/protocol-service";
import { HrvImport } from "@/components/recovery/hrv-import";
import { AppleImport } from "@/components/recovery/apple-import";
import { hooperIndex, sleepDebt } from "@/lib/recovery/wellness";
import { getPrefs } from "@/lib/rules/prefs-service";
import { dailySrpe, fosterWeek } from "@/lib/training/load-metrics";
import { type FatigueZone, zoneTrend } from "@/lib/training/zone-fatigue";

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
  // Carga y bienestar: monotonía de Foster (7 días), índice tipo Hooper y deuda de sueño
  const [prefs, weekSessions, zoneRows] = await Promise.all([
    getPrefs(user.id),
    prisma.trainingSession.findMany({ where: { userId: user.id, status: "COMPLETED", date: { gte: addDays(now, -6), lte: now } }, select: { date: true, sessionRpe: true, durationSec: true } }),
    prisma.trainingSession.findMany({ where: { userId: user.id, status: "COMPLETED", date: { gte: addDays(now, -27), lte: now }, zoneFatigue: { not: Prisma.DbNull } }, select: { date: true, zoneFatigue: true } }),
  ]);
  const zones = zoneTrend(zoneRows.map((r) => ({ date: toIsoDay(r.date), zones: r.zoneFatigue as Partial<Record<FatigueZone, number>> })), day);
  const foster = fosterWeek(dailySrpe(weekSessions.map((s) => ({ ...s, date: toIsoDay(s.date) })), day));
  const hooper = [...recent].reverse().map((r) => ({ date: toIsoDay(r.date), value: hooperIndex(r) })).filter((h) => h.value != null);
  const debt = sleepDebt(recent.map((r) => ({ date: toIsoDay(r.date), sleepHours: r.sleepHours })), day, prefs.sleepTargetH);
  const todayLog = cycle?.logs.find((l) => l.date === day) ?? null;

  return (
    <>
      <PageHeader title="Recuperación" description="Registro diario: 1 minuto al despertar." />
      <nav aria-label="Más de recuperación" className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {showWomen ? (
          <Link href="/recovery/women" className="font-medium underline underline-offset-4">
            Salud de la mujer
          </Link>
        ) : null}
        <Link href="/recovery/body" className="underline underline-offset-4">
          Antropometría
        </Link>
        <Link href="/recovery/health" className="underline underline-offset-4">
          Citas y suplementos
        </Link>
      </nav>
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
          <Card className="gap-3 py-4">
            <CardHeader className="px-4">
              <CardTitle className="text-sm">Carga y bienestar (7 días)</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 px-4 text-sm">
              <dl className="grid grid-cols-3 gap-2" aria-label="Carga y bienestar">
                <div>
                  <dt className="text-xs text-muted-foreground">Monotonía</dt>
                  <dd className={foster.monotony != null && foster.monotony > prefs.monotonyMax ? "font-semibold text-destructive" : "font-semibold"}>{foster.monotony != null ? formatNum(foster.monotony, 2) : "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Strain</dt>
                  <dd className="font-semibold tabular-nums">{foster.strain ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Deuda de sueño</dt>
                  <dd className="font-semibold tabular-nums">{debt.nights ? `${formatNum(debt.debtH, 1)} h` : "—"}</dd>
                </div>
              </dl>
              {hooper.length ? (
                <p className="text-xs text-muted-foreground">
                  Índice tipo Hooper (4–20, más alto = peor): {hooper.slice(-7).map((h) => h.value).join(" · ")}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">El índice tipo Hooper sale cuando registras sueño, fatiga, estrés y agujetas.</p>
              )}
              <p className="text-xs text-muted-foreground">Monotonía de Foster = media / desviación de la carga diaria (RPE × minutos). Por encima de {formatNum(prefs.monotonyMax, 1)}, la semana es muy igual.</p>
              {zones.length ? (
                <ul className="grid gap-0.5 border-t pt-2 text-xs" aria-label="Fatiga por zona">
                  {zones.map((z) => (
                    <li key={z.zone} className="flex justify-between gap-2 tabular-nums">
                      <span>{z.label}</span>
                      <span>
                        {formatNum(z.recent!, 1)}/10 (14 días, n={z.n})
                        {z.prev != null ? ` · antes ${formatNum(z.prev, 1)}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </CardContent>
          </Card>
          <Card className="gap-3 py-4">
            <CardHeader className="px-4">
              <CardTitle className="text-sm">Importar VFC y sueño</CardTitle>
            </CardHeader>
            <CardContent className="px-4">
              <HrvImport saved={prefs.hrvCsvMapping} />
              <div className="mt-4 border-t pt-3">
                <AppleImport />
              </div>
            </CardContent>
          </Card>
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
              protocol: i.protocol ? readProtocol(i.protocol.phases) : null,
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
