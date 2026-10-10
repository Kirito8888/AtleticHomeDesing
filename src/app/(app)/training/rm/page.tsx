import { PageHeader } from "@/components/page-header";
import { RmManager } from "@/components/training/rm-manager";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { pageUser } from "@/lib/auth/page";
import { addDays, today } from "@/lib/dates";
import { formatNum } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getPrefs } from "@/lib/rules/prefs-service";
import { currentRms, unlinkedPlanExercises } from "@/lib/training/rm-service";
import { exerciseOptions } from "@/lib/training/session-queries";
import { loadVelocityProfile } from "@/lib/training/vbt";

export const metadata = { title: "Mis RM · Atlenza" };

/** Tabla de RM, importación desde el plan, serie de test, APRE, enlace de ejercicios del plan y perfil carga-velocidad. */
export default async function RmPage() {
  const user = await pageUser();
  const [rms, exercises, unlinked, prefs, vbtSets] = await Promise.all([
    currentRms(user.id),
    exerciseOptions(user.id),
    unlinkedPlanExercises(user.id),
    getPrefs(user.id),
    prisma.strengthSet.findMany({
      where: { velocityMs: { gt: 0 }, isWarmup: false, strengthSession: { session: { userId: user.id, status: "COMPLETED", date: { gte: addDays(today(), -90) } } } },
      select: { weightKg: true, velocityMs: true, exercise: { select: { id: true, name: true } } },
    }),
  ]);
  const byEx = new Map<string, { name: string; pts: Array<{ kg: number; v: number }> }>();
  for (const s of vbtSets) {
    const e = byEx.get(s.exercise.id) ?? { name: s.exercise.name, pts: [] };
    e.pts.push({ kg: s.weightKg, v: s.velocityMs! });
    byEx.set(s.exercise.id, e);
  }
  const profiles = [...byEx.values()].map((e) => ({ name: e.name, n: e.pts.length, p: loadVelocityProfile(e.pts, prefs.vbtMvt) }));
  return (
    <>
      <PageHeader title="Mis RM" description="Con tu tabla de RM, el plan del día te dice los kilos de cada serie." />
      <RmManager rms={rms} exercises={exercises.map((e) => ({ id: e.id, name: e.name }))} unlinked={unlinked} />
      <Card className="mt-4 gap-3 py-4">
        <CardHeader className="px-4">
          <CardTitle className="text-base">Perfil carga-velocidad (VBT, 90 días)</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 px-4 text-sm">
          {profiles.length ? (
            <ul className="grid gap-1.5" aria-label="Perfiles carga-velocidad">
              {profiles.map((x) => (
                <li key={x.name} className="flex items-baseline justify-between gap-2 border-b pb-1 last:border-0">
                  <span>{x.name}</span>
                  {x.p ? (
                    <span className="tabular-nums">
                      RM estimada <span className="font-semibold">{x.p.e1rm != null ? `${formatNum(x.p.e1rm, 1)} kg` : "—"}</span>
                      <span className="text-xs text-muted-foreground">
                        {" "}
                        · R² {formatNum(x.p.r2, 2)}
                        {x.p.reliable ? "" : " (orientativa)"}
                      </span>
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">{x.n} series: faltan cargas distintas (mínimo 3)</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">Anota la velocidad media (m/s) de tus series al registrar fuerza (campo «VBT») y aquí verás tu perfil.</p>
          )}
          <p className="text-xs text-muted-foreground">
            RM a la velocidad mínima de {formatNum(prefs.vbtMvt, 2)} m/s (cámbiala en Mis reglas). Es una estimación: mejor con un encoder o app fiable y la misma técnica.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
