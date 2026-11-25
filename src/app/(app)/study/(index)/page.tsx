import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import type { CoachReportView } from "@/components/study/coach-panel";
import { AdaptPanel, CoachPanel, FlashcardReview, ManualCards, ManualPanel, MicroStepsPanel, PreloadStudyTabs, StudyChat } from "@/components/study/lazy";
import { ModulesPanel } from "@/components/study/modules-panel";
import { StorageMeter } from "@/components/study/storage-meter";
import { studyStorageUsage } from "@/lib/ai/rag";
import { listModules } from "@/lib/study/modules-service";
import { todayBlocks } from "@/lib/study/exam-plan-service";
import { knownSubjects } from "@/lib/study/schedule-service";
import { listMicroSessions } from "@/lib/study/study-history-service";
import { today } from "@/lib/dates";
import { DocumentsPanel } from "@/components/study/documents-panel";
import { publicDocError } from "@/lib/ai/doc-error";
import { dailyCap, listDecks } from "@/lib/ai/flashcards";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { aiAvailable } from "@/lib/ai/provider";
import { pageUser } from "@/lib/auth/page";
import { toIsoDay } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Estudio · Atlenza" };

export default async function StudyPage({ searchParams }: PageProps<"/study">) {
  const user = await pageUser();
  const { tab } = await searchParams;
  const aiConfigured = await aiAvailable(user.id);
  const [me, docs, threads, decks, reports, storage, modules, microSessions, subjects, cap, blocks] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { aiConsentAt: true } }),
    prisma.studyDocument.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { chunks: true, flashcards: true } } },
    }),
    prisma.chatThread.findMany({ where: { userId: user.id, kind: "STUDY" }, orderBy: { updatedAt: "desc" }, take: 30, select: { id: true, title: true } }),
    listDecks(user.id),
    prisma.coachReport.findMany({ where: { userId: user.id }, orderBy: { weekStart: "desc" }, take: 8 }),
    studyStorageUsage(user.id),
    listModules(user.id, toIsoDay(today())),
    listMicroSessions(user.id),
    knownSubjects(user.id),
    dailyCap(user.id),
    todayBlocks(user.id, toIsoDay(today())),
  ]);
  const aiConsent = me.aiConsentAt != null;
  const aiEnabled = aiConfigured && aiConsent;
  // v3.2 K · una sola tarea a la vista, con los datos que ya existían: el primer bloque del plan de hoy sin hacer
  // o, si no hay, la asignatura con el examen más cercano. El temporizador es único y vive en «Pasos».
  const block = blocks.find((b) => !b.done) ?? null;
  const exam = modules.find((m) => m.daysLeft != null && m.daysLeft >= 0) ?? null;
  const now = block
    ? { title: block.subject, detail: `${block.minutes} min en el plan de hoy`, why: "Es el siguiente bloque sin hacer de tu plan de hoy." }
    : exam
      ? { title: exam.name, detail: exam.daysLeft === 0 ? "El examen es hoy" : `Examen en ${exam.daysLeft} ${exam.daysLeft === 1 ? "día" : "días"}`, why: "Es el examen más cercano." }
      : null;
  const defaultTab = ["docs", "modules", "adapt", "steps", "manual", "chat", "cards", "coach"].includes(String(tab)) ? String(tab) : "docs";

  return (
    <>
      <PageHeader
        title="Estudio"
        description="Apuntes, repasos, horario y exámenes. La IA que elijas te ayuda donde ves la marca IA."
      />
      <details data-testid="study-more" className="mb-4 rounded-lg border">
        <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-medium">Horario, horas, exámenes y trabajos</summary>
      <nav aria-label="Organización del estudio" className="flex flex-wrap gap-x-4 gap-y-1 px-3 pb-2 text-sm">
        <Link href="/study/schedule" className="inline-flex min-h-11 items-center underline underline-offset-4">
          Horario y exámenes
        </Link>
        <Link href="/study/focus" className="inline-flex min-h-11 items-center underline underline-offset-4">
          Horas de estudio
        </Link>
        <Link href="/study/exams" className="inline-flex min-h-11 items-center underline underline-offset-4">
          Exámenes y notas
        </Link>
        <Link href="/study/assignments" className="inline-flex min-h-11 items-center underline underline-offset-4">
          Trabajos y entregas
        </Link>
      </nav>
      </details>
      {!aiConfigured ? (
        <p role="status" className="mb-4 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          Aún no tienes una IA configurada: pon tu clave (Google, OpenAI, Anthropic o un modelo local) en{" "}
          <Link href="/settings#ia" className="inline-flex min-h-11 items-center font-medium text-foreground underline underline-offset-4">
            Ajustes → IA
          </Link>
          . Puedes seguir repasando flashcards existentes.
        </p>
      ) : !aiConsent ? (
        <p role="status" className="mb-4 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          La IA está desactivada: tus apuntes y tu resumen semanal solo se envían a tu IA si lo autorizas en{" "}
          <Link href="/settings" className="inline-flex min-h-11 items-center font-medium text-foreground underline underline-offset-4">
            Ajustes → Privacidad e IA
          </Link>
          . Puedes seguir repasando flashcards existentes.
        </p>
      ) : null}
      <PreloadStudyTabs />
      <Tabs defaultValue={defaultTab}>
        <TabsList className="justify-start overflow-x-auto">
          <TabsTrigger value="docs">Apuntes</TabsTrigger>
          <TabsTrigger value="modules">Asignaturas</TabsTrigger>
          <TabsTrigger value="adapt">Resumir</TabsTrigger>
          <TabsTrigger value="steps">Pasos</TabsTrigger>
          <TabsTrigger value="manual">Manual PDF</TabsTrigger>
          <TabsTrigger value="chat">Chat</TabsTrigger>
          <TabsTrigger value="cards">Flashcards</TabsTrigger>
          <TabsTrigger value="coach">Coach</TabsTrigger>
        </TabsList>
        <TabsContent value="docs">
          {now ? (
            <section aria-label="Ahora toca" data-testid="study-now" className="mb-4 grid gap-3 rounded-lg border border-primary/40 bg-primary/5 p-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Ahora toca</p>
                <h2 className="text-lg font-semibold leading-tight">{now.title}</h2>
                <p className="text-sm text-muted-foreground">{now.detail}</p>
                <p className="mt-1 text-xs text-muted-foreground">Por qué: {now.why}</p>
              </div>
              <Button asChild className="h-12 w-full sm:w-auto">
                {/* <a> y no <Link>: la pestaña inicial (`defaultValue`) solo se lee al cargar la página */}
                <a href="/study?tab=steps">
                  Empezar <ArrowRight />
                </a>
              </Button>
            </section>
          ) : null}
          <StorageMeter used={storage.used} limit={storage.limit} />
          <DocumentsPanel
            aiEnabled={aiEnabled}
            secondary={!!now}
            modules={modules.map((m) => ({ id: m.id, name: m.name }))}
            docs={docs.map((d) => ({
              id: d.id,
              title: d.title,
              subject: d.subject,
              moduleId: d.moduleId,
              status: d.status,
              error: publicDocError(d.error),
              createdAt: toIsoDay(d.createdAt),
              chunks: d._count.chunks,
              flashcards: d._count.flashcards,
            }))}
          />
        </TabsContent>
        <TabsContent value="modules">
          <ModulesPanel modules={modules} />
        </TabsContent>
        <TabsContent value="adapt">
          <AdaptPanel aiEnabled={aiEnabled || process.env.LIFEOS_FAKE_AI === "1"} docs={docs.filter((d) => d.status === "EMBEDDED").map((d) => ({ id: d.id, title: d.title, moduleName: modules.find((m) => m.id === d.moduleId)?.name ?? null }))} />
        </TabsContent>
        <TabsContent value="steps">
          <MicroStepsPanel history={microSessions} aiEnabled={aiEnabled || process.env.LIFEOS_FAKE_AI === "1"} docs={docs.filter((d) => d.status === "EMBEDDED").map((d) => ({ id: d.id, title: d.title, subject: modules.find((m) => m.id === d.moduleId)?.name ?? d.subject }))} subjects={subjects} modules={modules.map((m) => ({ id: m.id, name: m.name }))} />
        </TabsContent>
        <TabsContent value="manual">
          <ManualPanel aiEnabled={aiEnabled || process.env.LIFEOS_FAKE_AI === "1"} docs={docs.filter((d) => d.status === "EMBEDDED").map((d) => ({ id: d.id, title: d.title }))} />
        </TabsContent>
        <TabsContent value="chat">
          <StudyChat threads={threads} aiEnabled={aiEnabled && docs.some((d) => d.status === "EMBEDDED")} />
        </TabsContent>
        <TabsContent value="cards">
          <div className="grid gap-4">
            <FlashcardReview decks={decks} cap={cap} />
            <ManualCards decks={decks.map((d) => d.name)} />
            <Link href="/study/exam" className="inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4">
              Examen simulado con tus tarjetas →
            </Link>
          </div>
        </TabsContent>
        <TabsContent value="coach">
          <CoachPanel
            aiEnabled={aiEnabled}
            reports={reports.map((r) => ({ id: r.id, weekStart: toIsoDay(r.weekStart), model: r.model, report: r.recommendations as unknown as CoachReportView["report"] }))}
          />
        </TabsContent>
      </Tabs>
    </>
  );
}
