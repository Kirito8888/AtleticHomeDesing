import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Breathing } from "@/components/wellbeing/breathing";
import { DeleteWellbeing, MoodForm, ScaleForm, SleepForm } from "@/components/wellbeing/wellbeing-forms";
import { Prisma } from "@/generated/prisma/client";
import { pageUser } from "@/lib/auth/page";
import { today, toIsoDay } from "@/lib/dates";
import { formatDate, formatNum } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { caffeineAtBed, hoursInBed, mobilityFor, moodTrend, scaleScore, sleepTips } from "@/lib/recovery/wellbeing";
import { listWellbeing, type WellbeingEntry } from "@/lib/recovery/wellbeing-service";
import { getPrefs } from "@/lib/rules/prefs-service";
import { dataKeyConfigured } from "@/lib/security/data-key";
import { FATIGUE_ZONES, type FatigueZone } from "@/lib/training/zone-fatigue";

export const metadata = { title: "Bienestar · Atlenza" };

type Row = WellbeingEntry & { id: string };
const short = (d: string) => formatDate(d, { day: "numeric", month: "short" });

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="h-fit gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 px-4 text-sm">{children}</CardContent>
    </Card>
  );
}

/**
 * v1.7 · Bienestar: sueño, ánimo y estrés, escalas de dolor y función, movilidad sugerida y
 * respiración. Todo va cifrado, solo lo ves tú y nunca se manda a la IA.
 */
export default async function WellbeingPage() {
  const user = await pageUser();
  const day = toIsoDay(today());
  const canSeal = dataKeyConfigured();
  const [rows, prefs, last] = await Promise.all([
    canSeal ? (listWellbeing(user.id, day) as Promise<Row[]>) : Promise.resolve([] as Row[]),
    getPrefs(user.id),
    prisma.trainingSession.findFirst({ where: { userId: user.id, status: "COMPLETED", zoneFatigue: { not: Prisma.DbNull } }, orderBy: { date: "desc" }, select: { date: true, zoneFatigue: true } }),
  ]);
  const sleep = rows.filter((r): r is Extract<Row, { kind: "SLEEP" }> => r.kind === "SLEEP");
  const mood = rows.filter((r): r is Extract<Row, { kind: "MOOD" }> => r.kind === "MOOD");
  const scales = rows.filter((r): r is Extract<Row, { kind: "SCALE" }> => r.kind === "SCALE");
  const trend = moodTrend(mood, day);
  const tips = sleep[0] ? sleepTips(sleep[0]) : [];
  const mobility = mobilityFor(last?.zoneFatigue as Partial<Record<FatigueZone, number>> | null, prefs.lightZoneAmber);

  return (
    <>
      <PageHeader title="Bienestar" description="Sueño, ánimo, escalas y respiración. Va cifrado, solo lo ves tú y nunca se envía a la IA ni a tu entrenadora." />
      {!canSeal ? <p className="mb-4 rounded-md border border-dashed p-3 text-sm text-muted-foreground">El servidor no tiene clave de cifrado (DATA_ENCRYPTION_KEY): el diario de bienestar está desactivado.</p> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        {canSeal ? (
          <Section title="Diario de sueño">
            <SleepForm today={day} />
            {sleep.length ? (
              <div className="grid gap-1 border-t pt-2" aria-label="Últimas noches">
                {tips.length ? (
                  <ul className="grid gap-1 text-xs">
                    {tips.map((t) => (
                      <li key={t}>· {t}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">La última noche cumple las pautas básicas.</p>
                )}
                <ul className="grid gap-0.5 text-xs tabular-nums">
                  {sleep.slice(0, 7).map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-2">
                      <span>
                        {short(r.date)}: {formatNum(hoursInBed(r.bedtime, r.wakeTime), 1)} h en cama · calidad {r.quality}/5
                        {r.caffeineMg ? ` · cafeína al acostarte ~${caffeineAtBed(r.caffeineMg, r.lastCaffeine, r.bedtime)} mg` : ""}
                      </span>
                      <DeleteWellbeing id={r.id} />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Section>
        ) : null}

        {canSeal ? (
          <Section title="Ánimo y estrés">
            <MoodForm today={day} />
            {mood.length ? (
              <div className="grid gap-1 border-t pt-2 text-xs" aria-label="Tendencia del ánimo">
                <p className="tabular-nums">
                  7 días: ánimo {trend.mood != null ? formatNum(trend.mood, 1) : "—"} · estrés {trend.stress != null ? formatNum(trend.stress, 1) : "—"}
                  {trend.moodPrev != null ? ` (3 semanas antes: ${formatNum(trend.moodPrev, 1)} · ${trend.stressPrev != null ? formatNum(trend.stressPrev, 1) : "—"})` : ""}
                </p>
                {trend.alerts.map((a) => (
                  <p key={a} role="status" className="rounded-md border border-destructive/40 p-2">
                    {a}
                  </p>
                ))}
              </div>
            ) : null}
          </Section>
        ) : null}

        {canSeal ? (
          <Section title="Escalas de dolor y función">
            <ScaleForm today={day} />
            {scales.length ? (
              <ul className="grid gap-0.5 border-t pt-2 text-xs tabular-nums" aria-label="Escalas guardadas">
                {scales.slice(0, 10).map((r) => {
                  const sc = scaleScore(r);
                  return (
                    <li key={r.id} className="flex items-center justify-between gap-2">
                      <span>
                        {short(r.date)} · {sc.label}: {sc.score != null ? formatNum(sc.score, 1) : "—"}
                        {r.scale === "EVA" ? "/10" : "/100"} {sc.higherIsBetter ? "(más alto = mejor)" : "(más bajo = mejor)"}
                      </span>
                      <DeleteWellbeing id={r.id} />
                    </li>
                  );
                })}
              </ul>
            ) : null}
            <p className="text-xs text-muted-foreground">Sirven para ver tu tendencia, no para diagnosticar. Si el dolor sube o no mejora, consulta con tu fisio o médico.</p>
          </Section>
        ) : null}

        <Section title="Movilidad sugerida">
          {mobility.length ? (
            <>
              <p className="text-xs text-muted-foreground">
                Por la fatiga por zona de tu última sesión ({short(toIsoDay(last!.date))}), con umbral {prefs.lightZoneAmber}/10:
              </p>
              <ul className="grid gap-2" aria-label="Movilidad por zona">
                {mobility.map((m) => (
                  <li key={m.zone}>
                    <span className="font-medium">
                      {FATIGUE_ZONES[m.zone]} ({m.value}/10)
                    </span>
                    <ul className="ml-4 list-disc text-xs">
                      {m.exercises.map((x) => (
                        <li key={x}>{x}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-muted-foreground">Ninguna zona llegó a {prefs.lightZoneAmber}/10 en tu última sesión con fatiga por zona. El umbral es el del semáforo del día (Ajustes).</p>
          )}
        </Section>

        <Section title="Respiración guiada">
          <Breathing />
        </Section>
      </div>
    </>
  );
}
