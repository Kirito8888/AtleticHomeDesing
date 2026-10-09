import Link from "next/link";
import {
  AiConsentToggle,
  ChangeEmailForm,
  ChangePasswordForm,
  DeleteAccountForm,
  SignOutEverywhere,
} from "@/components/settings/account-forms";
import {
  CoachLinks,
  CustomExerciseForm,
  NutritionGoalForm,
  ProfileForm,
  RecomputeTssButton,
  ThresholdForm,
} from "@/components/settings/settings-forms";
import { PageHeader } from "@/components/page-header";
import { CalendarFeedSettings } from "@/components/settings/calendar-feed";
import { CarbsByDayForm, HydrationForm, TrackForm } from "@/components/settings/carbs-form";
import { CoachReport } from "@/components/settings/coach-report";
import { ServerStatusView } from "@/components/settings/server-status";
import { serverStatus } from "@/lib/admin/status";
import { PushSettings } from "@/components/settings/push-settings";
import { ReminderSettings } from "@/components/settings/reminder-settings";
import { RulesForm } from "@/components/settings/rules-form";
import { TwoFactorSettings } from "@/components/settings/two-factor";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { pageUser } from "@/lib/auth/page";
import { addDays, startOfIsoWeek, today, toIsoDay } from "@/lib/dates";
import { env } from "@/lib/env";
import { formatDate, formatDuration } from "@/lib/format";
import { feedStatus } from "@/lib/planning/feed-service";
import { listReports } from "@/lib/report/service";
import { prisma } from "@/lib/prisma";
import { vapidKeys } from "@/lib/push/service";
import { readPrefs } from "@/lib/rules/prefs";
import { recentEvents } from "@/lib/security/audit";
import { totpStatus } from "@/lib/security/totp";

export const metadata = { title: "Ajustes · LifeOS" };

const EVENT_LABEL: Record<string, string> = {
  LOGIN_SUCCESS: "Inicio de sesión",
  LOGIN_FAILED: "Intento de inicio de sesión fallido",
  ACCOUNT_LOCKED: "Cuenta bloqueada por intentos fallidos",
  PASSWORD_CHANGED: "Contraseña cambiada",
  EMAIL_CHANGED: "Email cambiado",
  SESSIONS_REVOKED: "Sesiones cerradas en todos los dispositivos",
  TOTP_ENABLED: "Verificación en dos pasos activada",
  TOTP_DISABLED: "Verificación en dos pasos desactivada",
  RECOVERY_CODE_USED: "Código de recuperación usado",
  DATA_EXPORTED: "Datos exportados",
  AI_CONSENT_CHANGED: "Consentimiento de IA",
  COACH_SCOPES_CHANGED: "Permisos del entrenador cambiados",
};

/** "Chrome · Android" a partir del user-agent (solo para que el usuario reconozca el dispositivo). */
function device(ua: string | null): string {
  if (!ua) return "";
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Navegador";
  const os = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return [browser, os].filter(Boolean).join(" · ");
}

function Section({ id, title, description, children }: { id?: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card id={id} className="scroll-mt-20 gap-4 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-base">{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="px-4">{children}</CardContent>
    </Card>
  );
}

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const user = await pageUser();
  const status = user.role === "ADMIN" ? await serverStatus() : null;
  const { welcome } = await searchParams;
  const todayIso = toIsoDay(today());
  const [me, thresholds, goal, asCoach, asAthlete, customExercises, twoFactor, events, pushDevices, feed, reports] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: user.id }, include: { athleteProfile: true } }),
    prisma.thresholdHistory.findMany({ where: { userId: user.id }, orderBy: { effectiveFrom: "desc" }, take: 5 }),
    prisma.nutritionGoal.findFirst({ where: { userId: user.id }, orderBy: { effectiveFrom: "desc" } }),
    prisma.coachAthlete.findMany({ where: { coachId: user.id }, include: { athlete: { select: { name: true, email: true } } } }),
    prisma.coachAthlete.findMany({ where: { athleteId: user.id }, include: { coach: { select: { name: true, email: true } } } }),
    prisma.exercise.findMany({ where: { userId: user.id }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    totpStatus(user.id),
    recentEvents(user.id, 15),
    prisma.pushSubscription.count({ where: { userId: user.id } }),
    feedStatus(user.id),
    listReports(user.id),
  ]);
  const monday = startOfIsoWeek(today());
  const reportPeriods = [
    { key: "week", label: "Esta semana", from: toIsoDay(monday), to: toIsoDay(addDays(monday, 6)) },
    { key: "last", label: "Semana pasada", from: toIsoDay(addDays(monday, -7)), to: toIsoDay(addDays(monday, -1)) },
    { key: "4w", label: "Últimas 4 semanas", from: toIsoDay(addDays(monday, -21)), to: toIsoDay(addDays(monday, 6)) },
  ];
  const vapid = vapidKeys();
  const p = me.athleteProfile;
  const prefs = readPrefs(p?.prefs);

  return (
    <>
      <PageHeader title="Ajustes" />
      {welcome ? (
        <p role="status" className="mb-4 rounded-md border p-3 text-sm">
          ¡Bienvenido/a! Completa tu perfil y tus umbrales: con ellos el TSS se calcula a partir de tu FC y tus ritmos.
        </p>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Perfil">
          <ProfileForm
            initial={{
              name: me.name ?? "",
              sex: p?.sex ?? null,
              birthDate: p?.birthDate ? toIsoDay(p.birthDate) : null,
              heightCm: p?.heightCm ?? null,
              bodyWeightKg: p?.bodyWeightKg ?? null,
              primaryDiscipline: p?.primaryDiscipline ?? null,
              disciplines: p?.disciplines ?? [],
              ctlTimeConstant: p?.ctlTimeConstant ?? 42,
              atlTimeConstant: p?.atlTimeConstant ?? 7,
            }}
          />
        </Section>
        <Section title="Umbrales fisiológicos" description="Se guardan con fecha: cada sesión usa los vigentes en su día.">
          <ThresholdForm today={todayIso} />
          {thresholds.length ? (
            <table className="mt-4 w-full text-xs tabular-nums">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="text-left font-normal">Desde</th>
                  <th className="text-right font-normal">FCmáx</th>
                  <th className="text-right font-normal">Reposo</th>
                  <th className="text-right font-normal">LTHR</th>
                  <th className="text-right font-normal">Ritmo</th>
                </tr>
              </thead>
              <tbody>
                {thresholds.map((t) => (
                  <tr key={t.id}>
                    <td>{formatDate(t.effectiveFrom, { day: "numeric", month: "short", year: "numeric" })}</td>
                    <td className="text-right">{t.hrMax ?? "—"}</td>
                    <td className="text-right">{t.hrRest ?? "—"}</td>
                    <td className="text-right">{t.lthr ?? "—"}</td>
                    <td className="text-right">{t.thresholdPaceSecPerKm ? formatDuration(t.thresholdPaceSecPerKm) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          <RecomputeTssButton />
        </Section>
        <Section id="mis-reglas" title="Mis reglas" description="Umbrales de los avisos (squeeze, talón, peso, VFC, lanzamientos, vídeo) y redondeo de los kg. Son pautas de prudencia, no diagnósticos.">
          <RulesForm
            initial={{
              kgStep: prefs.kgStep,
              rmTestThreshold: prefs.rmTestThreshold,
              squeezeMax: prefs.squeezeMax,
              heelMax: prefs.heelMax,
              feelingPainMax: prefs.feelingPainMax,
              weightGainWeekKg: prefs.weightGainWeekKg,
              weightBlockKg: prefs.weightBlockKg,
              weightMinKg: prefs.weightMinKg,
              bodyFatBlockPts: prefs.bodyFatBlockPts,
              throwCapRatio: prefs.throwCapRatio,
              throwMinHours: prefs.throwMinHours,
              hrvDropPct: prefs.hrvDropPct,
              videoMinPct: prefs.videoMinPct,
              monotonyMax: prefs.monotonyMax,
              sleepTargetH: prefs.sleepTargetH,
              sleepDebtMaxH: prefs.sleepDebtMaxH,
              vbtMvt: prefs.vbtMvt,
              vbtLossMax: prefs.vbtLossMax,
              autoregMaxPct: prefs.autoregMaxPct,
              taperDays: prefs.taperDays,
              taperPct: prefs.taperPct,
              lightReadinessAmber: prefs.lightReadinessAmber,
              lightReadinessRed: prefs.lightReadinessRed,
              lightHooperAmber: prefs.lightHooperAmber,
              lightHooperRed: prefs.lightHooperRed,
              lightPainRed: prefs.lightPainRed,
              lightZoneAmber: prefs.lightZoneAmber,
            }}
          />
        </Section>
        <Section title="Objetivo nutricional diario">
          <div className="grid gap-6">
            <NutritionGoalForm today={todayIso} initial={goal} />
            <CarbsByDayForm initial={{ carbsThrowDayG: prefs.carbsThrowDayG, carbsHeavyDayG: prefs.carbsHeavyDayG, carbsRestDayG: prefs.carbsRestDayG }} />
            <HydrationForm initial={{ waterMlPerKg: prefs.waterMlPerKg, waterSessionExtraMl: prefs.waterSessionExtraMl, waterHotExtraMl: prefs.waterHotExtraMl, hotTempC: prefs.hotTempC }} />
          </div>
        </Section>
        <Section title="Entrenador / atletas" description="El entrenador solo ve datos deportivos; nunca finanzas, nutrición ni estudio.">
          <CoachLinks
            isCoach={user.role === "COACH" || user.role === "ADMIN"}
            asCoach={asCoach.map((l) => ({ id: l.id, status: l.status, canPlan: l.canPlan, scopes: l.scopes, other: l.athlete }))}
            asAthlete={asAthlete.map((l) => ({ id: l.id, status: l.status, canPlan: l.canPlan, scopes: l.scopes, other: l.coach }))}
          />
          {(user.role === "COACH" || user.role === "ADMIN") && asCoach.some((l) => l.status === "ACTIVE") ? (
            <Link href="/coach" className="mt-2 inline-block text-sm underline underline-offset-4">
              Ver y comentar las sesiones de tus atletas
            </Link>
          ) : null}
        </Section>
        <Section id="informe" title="Informe para la entrenadora" description="Un enlace de solo lectura para quien no usa LifeOS.">
          <CoachReport
            periods={reportPeriods}
            active={reports.map((r) => ({ id: r.id, from: toIsoDay(r.from), to: toIsoDay(r.to), includeInjuries: r.includeInjuries, expiresAt: toIsoDay(r.expiresAt) }))}
          />
        </Section>
        <Section title="Mis ejercicios" description="Se suman al catálogo global en el registro de fuerza.">
          <CustomExerciseForm />
          {customExercises.length ? (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {customExercises.map((e) => (
                <li key={e.id} className="rounded-full border px-3 py-1 text-xs">
                  {e.name}
                </li>
              ))}
            </ul>
          ) : null}
        </Section>
        <Section title="Seguridad" description="Cambiar la contraseña o el email cierra la sesión en todos tus dispositivos.">
          <div className="grid gap-6">
            <ChangePasswordForm />
            <ChangeEmailForm email={me.email} />
            <SignOutEverywhere />
          </div>
        </Section>
        <Section title="Verificación en dos pasos" description="Un código de tu móvil además de la contraseña.">
          <TwoFactorSettings initial={{ ...twoFactor, enabledAt: twoFactor.enabledAt?.toISOString() ?? null }} />
        </Section>
        <Section title="Notificaciones" description="Avisos en el móvil aunque la app esté cerrada.">
          <div className="grid gap-6">
            <PushSettings configured={vapid != null} publicKey={vapid?.publicKey ?? null} devices={pushDevices} />
            {vapid ? <ReminderSettings initial={{ remindTomorrowHour: prefs.remindTomorrowHour, remindMondayCheck: prefs.remindMondayCheck, remindWeigh: prefs.remindWeigh }} /> : null}
          </div>
        </Section>
        <Section id="pista" title="Mi pista" description="Para guardar el tiempo (temperatura, viento, lluvia) de tus sesiones técnicas y el calor del día. Solo se envían las coordenadas a Open-Meteo.">
          <TrackForm initial={prefs.track} />
        </Section>
        <Section id="calendario" title="Calendario en el móvil" description="Suscríbete a tus entrenos y competiciones (.ics de solo lectura).">
          <CalendarFeedSettings active={feed.active} lastUsedAt={feed.lastUsedAt} />
        </Section>
        <Section title="Actividad reciente" description="Si ves algo que no reconoces, cambia la contraseña y cierra las sesiones.">
          {events.length ? (
            <ul className="grid gap-2 text-sm">
              {events.map((e) => (
                <li key={e.id} className="flex items-start justify-between gap-3 border-b pb-2 last:border-0">
                  <div className="min-w-0">
                    <p className={e.type === "LOGIN_FAILED" || e.type === "ACCOUNT_LOCKED" ? "font-medium text-destructive" : "font-medium"}>
                      {EVENT_LABEL[e.type] ?? e.type}
                      {e.detail ? <span className="font-normal text-muted-foreground"> · {e.detail}</span> : null}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{[e.ip, device(e.userAgent)].filter(Boolean).join(" · ")}</p>
                  </div>
                  <time className="shrink-0 text-xs text-muted-foreground tabular-nums" dateTime={e.createdAt.toISOString()}>
                    {e.createdAt.toLocaleString("es-ES", { timeZone: "Europe/Madrid", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </time>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Sin actividad registrada todavía.</p>
          )}
        </Section>
        <Section title="Privacidad e IA" description="Astras AI usa Google Gemini. Sin tu permiso no se envía nada.">
          <AiConsentToggle initial={me.aiConsentAt != null} configured={Boolean(env().GEMINI_API_KEY)} />
        </Section>
        {status ? (
          <Section id="servidor" title="Estado del servidor" description="Solo administración. Míralo después de cada actualización.">
            <ServerStatusView s={status} />
          </Section>
        ) : null}
        <Section title="Tus datos" description="Descarga una copia completa (JSON) o elimina tu cuenta.">
          <div className="grid gap-6">
            <div className="grid gap-2">
              <Button asChild variant="outline">
                <a href="/api/account/export" download>
                  Descargar todos mis datos (JSON)
                </a>
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button asChild variant="outline" size="sm">
                  <a href="/api/export/training" download>
                    Entrenos (CSV)
                  </a>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <a href="/api/export/finance" download>
                    Finanzas (CSV)
                  </a>
                </Button>
              </div>
            </div>
            <DeleteAccountForm />
          </div>
        </Section>
      </div>
    </>
  );
}
