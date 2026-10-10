import Link from "next/link";

import { PlanWizard } from "@/components/ai-plan/plan-wizard";
import { PageHeader } from "@/components/page-header";
import type { AGE_BANDS } from "@/lib/ai-plan/options";
import { aiAvailable } from "@/lib/ai/provider";
import { pageUser } from "@/lib/auth/page";
import { today, toIsoDay } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { activeInjuries } from "@/lib/recovery/injuries";
import { womenMode } from "@/lib/health/women-service";

export const metadata = { title: "Crear mi planificación · Atlenza" };

function ageBand(birth: Date | null | undefined): keyof typeof AGE_BANDS | null {
  if (!birth) return null;
  const age = Math.floor((Date.now() - birth.getTime()) / (365.25 * 864e5));
  return age < 18 ? "u18" : age < 30 ? "18-29" : age < 40 ? "30-39" : age < 50 ? "40-49" : age < 60 ? "50-59" : "60+";
}

/** Atlenza IA → Crear planificación: cuestionario sin escribir → plan con la IA del usuario (borrador). */
export default async function CreatePlanPage() {
  const user = await pageUser();
  const now = today();
  const [me, profile, injuries, events, cycle, drafts, mode] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { aiConsentAt: true } }),
    prisma.athleteProfile.findUnique({ where: { userId: user.id }, select: { sex: true, birthDate: true } }),
    activeInjuries(user.id),
    prisma.calendarEvent.findMany({ where: { userId: user.id, type: "COMPETITION", startAt: { gte: now } }, orderBy: { startAt: "asc" }, take: 30, select: { id: true, title: true, startAt: true } }),
    prisma.cycleProfile.count({ where: { userId: user.id } }),
    prisma.planMeso.findMany({ where: { userId: user.id, source: "AI" }, orderBy: { createdAt: "desc" }, select: { code: true, name: true, status: true } }),
    womenMode(user.id),
  ]);
  const fake = process.env.LIFEOS_FAKE_AI === "1";
  const configured = fake || (await aiAvailable(user.id));
  const consent = fake || me.aiConsentAt != null;

  return (
    <>
      <PageHeader title="Crear mi planificación" description="Responde con unos toques; la IA que elijas prepara un plan a tu medida que revisas antes de activarlo." />
      {mode !== "NONE" ? (
        <p role="status" className="mb-4 rounded-md border border-amber-500/50 bg-amber-500/5 p-3 text-sm">
          Tienes activo el modo {mode === "PREGNANT" ? "embarazo" : "posparto"}: aquí no se generan planes con IA. Sigue las pautas de tu médica o matrona y la guía por fases de{" "}
          <Link href="/recovery/women" className="font-medium underline underline-offset-4">
            Salud de la mujer
          </Link>
          .
        </p>
      ) : !configured ? (
        <p role="status" className="mb-4 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          Aún no tienes una IA configurada: pon tu clave (Google, OpenAI, Anthropic o un modelo local) en{" "}
          <Link href="/settings#ia" className="font-medium text-foreground underline underline-offset-4">
            Ajustes → IA
          </Link>
          .
        </p>
      ) : !consent ? (
        <p role="status" className="mb-4 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          Para generar el plan, autoriza la IA en{" "}
          <Link href="/settings" className="font-medium text-foreground underline underline-offset-4">
            Ajustes → Privacidad e IA
          </Link>
          . A la IA solo le llegan tus respuestas del cuestionario: ni tu nombre, ni tu email, ni tus datos de salud.
        </p>
      ) : null}
      {drafts.length ? (
        <ul className="mb-4 grid gap-1 text-sm" aria-label="Tus planes con IA">
          {drafts.map((d) => (
            <li key={d.code}>
              <Link href={`/planning/meso/${d.code}`} className="underline-offset-2 hover:underline">
                {d.code} · {d.name}
              </Link>{" "}
              <span className="text-xs text-muted-foreground">{d.status === "DRAFT" ? "borrador" : "activo"}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <PlanWizard
        isFemale={profile?.sex === "FEMALE"}
        hasCycle={cycle > 0}
        presetAreas={[...new Set(injuries.map((i) => i.area))]}
        competitions={events.map((e) => ({ id: e.id, title: e.title, date: toIsoDay(e.startAt) }))}
        defaultAgeBand={ageBand(profile?.birthDate)}
      />
    </>
  );
}
