import Link from "next/link";
import { Repeat } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { ImportActivity } from "@/components/training/import-activity";
import { VoiceSessionForm } from "@/components/training/voice-session";
import { TemplateChips } from "@/components/training/template-chips";
import { CoachLibrary, ShareTemplates } from "@/components/training/coach-library";
import { sharedFromCoaches } from "@/lib/training/template-library";
import { Button } from "@/components/ui/button";
import { pageUser } from "@/lib/auth/page";
import { formatDate } from "@/lib/format";
import { today, toIsoDay } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { sessionToFormInitial, templateToFormInitial } from "@/lib/training/form-initial";
import { exerciseOptions, formSessionInclude } from "@/lib/training/session-queries";
import { autoregContext } from "@/lib/training/rm-service";

export const metadata = { title: "Nueva sesión · Atlenza" };

export default async function NewSessionPage({ searchParams }: PageProps<"/training/new">) {
  const user = await pageUser();
  const autoreg = await autoregContext(user.id);
  const { type, repeat, template } = await searchParams;
  const [exercises, profile, lastStrength, templates, library] = await Promise.all([
    exerciseOptions(user.id),
    prisma.athleteProfile.findUnique({ where: { userId: user.id }, select: { bodyWeightKg: true } }),
    prisma.trainingSession.findFirst({
      where: { userId: user.id, type: "STRENGTH", status: "COMPLETED" },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      include: formSessionInclude,
    }),
    prisma.sessionTemplate.findMany({ where: { userId: user.id }, orderBy: { name: "asc" }, select: { id: true, name: true, payload: true, shared: true } }),
    sharedFromCoaches(user.id),
  ]);
  const todayIso = toIsoDay(today());
  // "Repetir": mismas series y pesos que la última sesión de fuerza, con fecha de hoy.
  const chosen = typeof template === "string" ? templates.find((t) => t.id === template) : undefined;
  let fromTemplate = chosen ? (() => {
    try {
      return templateToFormInitial(chosen.payload, todayIso);
    } catch {
      return undefined; // plantilla antigua que ya no valida: formulario vacío
    }
  })() : undefined;
  if (fromTemplate) fromTemplate = { ...fromTemplate, planned: false };
  const initial =
    fromTemplate ??
    (repeat === "strength" && lastStrength
      ? sessionToFormInitial(lastStrength, { date: todayIso, planned: false, rpe: null, notes: "", feelings: [] }, { repeat: true })
      : undefined);
  const initialType = type === "TECHNICAL" || type === "TRACK" ? type : "STRENGTH";
  return (
    <>
      <PageHeader
        title="Nueva sesión"
        description={
          chosen && fromTemplate
            ? `Desde la plantilla «${chosen.name}»: ajusta lo que cambie hoy.`
            : initial
              ? `Copia de la sesión de fuerza del ${formatDate(lastStrength!.date, { day: "numeric", month: "long" })}: ajusta pesos y repeticiones.`
              : "Registra series, intentos o tu sesión de pista."
        }
        action={
          lastStrength && !initial ? (
            <Button asChild variant="outline" size="sm">
              <Link href="/training/new?repeat=strength">
                <Repeat /> Repetir última fuerza
              </Link>
            </Button>
          ) : undefined
        }
      />
      {!initial ? <ImportActivity /> : null}
      <TemplateChips templates={templates.map((t) => ({ id: t.id, name: t.name }))} activeId={chosen?.id} />
      {!initial ? <CoachLibrary templates={library.map((t) => ({ id: t.id, name: t.name, coach: t.user.name?.split(" ")[0] ?? "Entrenadora" }))} /> : null}
      {user.role === "COACH" && !initial ? <ShareTemplates templates={templates.map((t) => ({ id: t.id, name: t.name, shared: t.shared }))} /> : null}
      <VoiceSessionForm
        formKey={chosen ? `tpl-${chosen.id}` : initial ? "repeat" : "new"}
        exercises={exercises}
        defaultDate={todayIso}
        bodyWeightKg={profile?.bodyWeightKg ?? null}
        initialType={initialType}
        initial={initial}
        autoreg={autoreg}
      />
    </>
  );
}
