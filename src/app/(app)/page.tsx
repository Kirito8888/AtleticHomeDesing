import Link from "next/link";
import { Activity, Apple, Brain, CalendarDays, ChevronRight, HeartPulse, ListChecks, ListTodo, Plus, Trophy, Wallet } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { OfflineDayCache } from "@/components/offline-day-cache";
import { RuleAlerts } from "@/components/rules/rule-alerts";
import { HabitsCard } from "@/components/study/habits-card";
import { Stat } from "@/components/stat";
import { readinessStatus, StatusLabel, tsbStatus } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { pageUser } from "@/lib/auth/page";
import { getDashboard } from "@/lib/dashboard";
import { getPrefs } from "@/lib/rules/prefs-service";
import { diffDays, today } from "@/lib/dates";
import { formatDate, formatDuration, formatEur, formatNum, READINESS_LABEL, SESSION_TYPE_LABEL } from "@/lib/format";

function Widget({ title, icon: Icon, href, id, children, hide }: { title: string; icon: React.ElementType; href?: string; id?: string; children: React.ReactNode; hide?: boolean }) {
  if (hide) return null;
  return (
    <Card id={id} className="scroll-mt-20 gap-3 py-4">
      <CardHeader className="flex flex-row items-center justify-between px-4">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Icon className="size-4 text-muted-foreground" /> {title}
        </CardTitle>
        {href ? (
          <Link href={href} className="flex items-center text-xs text-muted-foreground hover:text-foreground" aria-label={`Ver ${title}`}>
            Ver <ChevronRight className="size-3.5" />
          </Link>
        ) : null}
      </CardHeader>
      <CardContent className="px-4">{children}</CardContent>
    </Card>
  );
}

export default async function DashboardPage() {
  const user = await pageUser();
  const [d, prefs] = await Promise.all([getDashboard(user.id), getPrefs(user.id)]);
  const off = (m: string) => (prefs.hiddenModules as readonly string[]).includes(m);
  const readiness = d.recovery?.readinessScore ?? null;
  const rStatus = readinessStatus(readiness);
  const label = (d.recovery?.readinessParts as { label?: keyof typeof READINESS_LABEL } | null)?.label;
  const cur = d.perf.current;
  const goal = d.nutrition.goal;
  const totals = d.nutrition.totals as Record<string, number>;
  const daysToComp = d.nextCompetition ? diffDays(d.nextCompetition.startAt, today()) : null;

  return (
    <>
      <PageHeader
        title={`Hola${user.name ? `, ${user.name.split(" ")[0]}` : ""}`}
        description={formatDate(d.day, { weekday: "long", day: "numeric", month: "long" })}
        action={
          <div className="flex gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href="/glance">De un vistazo</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/training/new">
                <Plus /> Sesión
              </Link>
            </Button>
          </div>
        }
      />

      {d.injuryAlert ? (
        <Link
          href="/recovery"
          role="status"
          className={
            d.injuryAlert.level === "warn"
              ? "mb-4 block rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm"
              : "mb-4 block rounded-md border p-3 text-sm text-muted-foreground"
          }
        >
          🩹 {d.injuryAlert.message}
        </Link>
      ) : null}

      <OfflineDayCache paths={d.offlinePaths} />
      <Link
        href="/recovery"
        role="status"
        aria-label="Semáforo del día"
        className={
          d.dailyLight.level === "red"
            ? "mb-4 flex items-start gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm"
            : d.dailyLight.level === "amber"
              ? "mb-4 flex items-start gap-3 rounded-md border border-amber-500/50 bg-amber-500/5 p-3 text-sm"
              : "mb-4 flex items-start gap-3 rounded-md border p-3 text-sm"
        }
      >
        <span aria-hidden className={d.dailyLight.level === "red" ? "mt-0.5 size-3 shrink-0 rounded-full bg-destructive" : d.dailyLight.level === "amber" ? "mt-0.5 size-3 shrink-0 rounded-full bg-amber-500" : "mt-0.5 size-3 shrink-0 rounded-full bg-emerald-500"} />
        <span>
          <span className="font-medium">{d.dailyLight.label}</span>
          {d.dailyLight.reasons.length ? <span className="block text-xs text-muted-foreground">{d.dailyLight.reasons.join(" · ")}</span> : null}
        </span>
      </Link>
      <RuleAlerts alerts={d.ruleAlerts} />
      <RuleAlerts alerts={d.womenAlerts} label="Avisos de salud" link={{ href: "/recovery/women", text: "Salud de la mujer" }} />
      <RuleAlerts alerts={d.equipmentAlerts} label="Avisos de material" link={{ href: "/training/equipment", text: "Ver material" }} />

      {d.lightSuggestion ? (
        <Link href={`/training/${d.lightSuggestion.sessionId}`} role="status" className="mb-4 block rounded-md border border-primary/40 bg-primary/5 p-3 text-sm">
          💡 {d.lightSuggestion.reason}: hoy tienes disponible la versión suave de tu sesión. Tócala para elegirla.
        </Link>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Widget hide={off("recovery")} title="Readiness" icon={HeartPulse} href="/recovery">
          {readiness != null && rStatus ? (
            <div className="flex items-end justify-between gap-2">
              <div className="text-5xl font-semibold tabular-nums">{Math.round(readiness)}</div>
              <StatusLabel status={rStatus}>{label ? READINESS_LABEL[label] : ""}</StatusLabel>
            </div>
          ) : (
            <div className="grid gap-2">
              <p className="text-sm text-muted-foreground">Aún no has registrado sueño y VFC hoy.</p>
              <Button asChild variant="outline" size="sm">
                <Link href="/recovery">Registrar recuperación</Link>
              </Button>
            </div>
          )}
        </Widget>

        <Widget hide={off("training")} title="Forma (PMC)" icon={Activity} href="/training/performance">
          {cur ? (
            <div className="grid gap-2">
              <div className="grid grid-cols-3 gap-2">
                <Stat label="Fitness" value={formatNum(cur.ctl)} swatch="--series-1" />
                <Stat label="Fatiga" value={formatNum(cur.atl)} swatch="--series-2" />
                <Stat label="Forma" value={formatNum(cur.tsb)} swatch="--series-3" />
              </div>
              <StatusLabel status={tsbStatus(cur.tsb)} className="text-xs">
                {cur.tsb < -25 ? "Fatiga alta acumulada" : cur.tsb < -10 ? "Bloque de carga" : "Fresco"}
                {cur.acwr != null ? ` · ACWR ${formatNum(cur.acwr, 2)}` : ""}
              </StatusLabel>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Registra tu primera sesión para ver tu carga.</p>
          )}
        </Widget>

        <Widget hide={off("training")} title="Hoy toca" icon={CalendarDays} href="/training">
          {d.sessions.length ? (
            <ul className="grid gap-2">
              {d.sessions.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 text-sm">
                  <Link href={`/training/${s.id}`} className="min-w-0 truncate font-medium hover:underline">
                    {s.title ?? SESSION_TYPE_LABEL[s.type]}
                  </Link>
                  <span className="shrink-0 text-muted-foreground tabular-nums">
                    {s.status === "PLANNED" ? (s.durationSec ? `○ ~${Math.round(s.durationSec / 60)} min` : "Planificada") : s.tss != null ? `${formatNum(s.tss)} TSS` : formatDuration(s.durationSec)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Sin sesiones hoy.</p>
          )}
          {d.nextCompetition && daysToComp != null ? (
            <p className="mt-3 flex items-center gap-2 border-t pt-3 text-sm">
              <Trophy className="size-4 text-muted-foreground" />
              <Link href={`/planning/competition/${d.nextCompetition.id}`} className="min-w-0 truncate underline-offset-2 hover:underline">
                {d.nextCompetition.title}
              </Link>
              <span className="ml-auto shrink-0 font-medium tabular-nums">{daysToComp === 0 ? "¡Hoy!" : `en ${daysToComp} d`}</span>
            </p>
          ) : null}
        </Widget>

        <Widget hide={off("nutrition")} title="Nutrición" icon={Apple} href="/nutrition">
          {goal ? (
            <div className="grid gap-2.5">
              {(
                [
                  ["Kcal", totals.kcal, goal.kcal, ""],
                  ["Proteína", totals.proteinG, goal.proteinG, "g"],
                  ["Hidratos", totals.carbsG, goal.carbsG, "g"],
                  ["Grasa", totals.fatG, goal.fatG, "g"],
                ] as const
              ).map(([name, value, target, unit]) => (
                <div key={name} className="grid gap-1">
                  <div className="flex justify-between text-xs">
                    <span>{name}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {Math.round(value)} / {target}
                      {unit}
                    </span>
                  </div>
                  <Progress value={(value / target) * 100} aria-label={name} />
                </div>
              ))}
              {d.nutrition.isTrainingDay ? <p className="text-xs text-muted-foreground">Objetivo ajustado: día de entreno.</p> : null}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {Math.round(totals.kcal)} kcal registradas. Define tu objetivo en Ajustes.
            </p>
          )}
        </Widget>

        <Widget hide={off("finance")} title="Finanzas" icon={Wallet} href="/finance">
          {d.budgetAlerts.length ? (
            <ul className="grid gap-2">
              {d.budgetAlerts.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-2 text-sm">
                  <StatusLabel status={b.state === "EXCEEDED" ? "critical" : "warning"}>{b.category.name}</StatusLabel>
                  <span className="text-muted-foreground tabular-nums">
                    {formatEur(b.spentCents)} / {formatEur(b.budgetCents)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <StatusLabel status="good">Presupuestos dentro de lo previsto</StatusLabel>
          )}
        </Widget>

        <Widget hide={off("study")} title="Estudio y tareas" icon={Brain} href="/study">
          <div className="grid gap-3">
            <p className="text-sm">
              <span className="text-2xl font-semibold tabular-nums">{d.dueCards}</span>{" "}
              <span className="text-muted-foreground">flashcards para repasar</span>
            </p>
            {d.nextExam ? (
              <p className="text-sm">
                📚 Examen de <span className="font-medium">{d.nextExam.subject}</span>{" "}
                <span className="text-muted-foreground">
                  {diffDays(new Date(`${d.nextExam.date}T00:00:00Z`), today()) === 0 ? "hoy" : `en ${diffDays(new Date(`${d.nextExam.date}T00:00:00Z`), today())} d`}
                </span>
              </p>
            ) : null}
            {d.examClashes.map((c) => (
              <Link key={c.id} href="/study/schedule" role="status" className="block rounded-md border border-amber-500/50 bg-amber-500/5 p-2 text-xs">
                «{c.title}» {c.kind === "EXAM" ? "cae el día" : "es la víspera"} del examen de {c.subject}
              </Link>
            ))}
            {d.tasks.length ? (
              <ul className="grid gap-1.5 border-t pt-3">
                {d.tasks.map((t) => (
                  <li key={t.id} className="flex items-center gap-2 text-sm">
                    <ListTodo className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 truncate">{t.title}</span>
                    {t.priority === "URGENT" || t.priority === "HIGH" ? (
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground">{t.priority === "URGENT" ? "Urgente" : "Alta"}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </Widget>

        <Widget hide={off("study")} title="Hábitos" icon={ListChecks} id="habitos">
          <HabitsCard habits={d.habits} today={d.day} />
        </Widget>
      </div>
    </>
  );
}
