import Link from "next/link";
import { Sparkles } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { CoachPanel, type CoachReportView } from "@/components/study/coach-panel";
import { AdaptPanel } from "@/components/study/adapt-panel";
import { ManualPanel } from "@/components/study/manual-panel";
import { MicroStepsPanel } from "@/components/study/micro-steps-panel";
import { StorageMeter } from "@/components/study/storage-meter";
import { studyStorageUsage } from "@/lib/ai/rag";
import { ModulesPanel } from "@/components/study/modules-panel";
import { listModules } from "@/lib/study/modules-service";
import { today } from "@/lib/dates";
import { DocumentsPanel } from "@/components/study/documents-panel";
import { publicDocError } from "@/lib/ai/doc-error";
import { listDecks } from "@/lib/ai/flashcards";
import { FlashcardReview } from "@/components/study/flashcard-review";
import { ManualCards } from "@/components/study/coursework";
import { StudyChat } from "@/components/study/study-chat";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { aiAvailable } from "@/lib/ai/provider";
import { pageUser } from "@/lib/auth/page";
import { toIsoDay } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Atlenza IA · Atlenza" };

export default async function StudyPage({ searchParams }: PageProps<"/study">) {
  const user = await pageUser();
  const { tab } = await searchParams;
  const aiConfigured = await aiAvailable(user.id);
  const [me, docs, threads, decks, reports, storage, modules] = await Promise.all([
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
  ]);
  const aiConsent = me.aiConsentAt != null;
  const aiEnabled = aiConfigured && aiConsent;
  const defaultTab = ["docs", "modules", "adapt", "steps", "manual", "chat", "cards", "coach"].includes(String(tab)) ? String(tab) : "docs";

  return (
    <>
      <PageHeader
        title="Atlenza IA"
        description="Estudio con tus apuntes, coach de rendimiento y planes de entrenamiento (con la IA que elijas)"
        action={
          <div className="flex gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href="/study/ask">Pregunta a tus datos</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/study/plan">
                <Sparkles /> Crear plan
              </Link>
            </Button>
          </div>
        }
      />
      <nav aria-label="Organización del estudio" className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <Link href="/study/schedule" className="inline-flex min-h-11 items-center underline underline-offset-4">
          Horario y exámenes
        </Link>
        <Link href="/study/focus" className="inline-flex min-h-11 items-center underline underline-offset-4">
          Pomodoro y horas de estudio
        </Link>
        <Link href="/study/exams" className="inline-flex min-h-11 items-center underline underline-offset-4">
          Exámenes y notas
        </Link>
        <Link href="/study/assignments" className="inline-flex min-h-11 items-center underline underline-offset-4">
          Trabajos y entregas
        </Link>
      </nav>
      {!aiConfigured ? (
        <p role="status" className="mb-4 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          Aún no tienes una IA configurada: pon tu clave (Google, OpenAI, Anthropic o un modelo local) en{" "}
          <Link href="/settings#ia" className="font-medium text-foreground underline underline-offset-4">
            Ajustes → IA
          </Link>
          . Puedes seguir repasando flashcards existentes.
        </p>
      ) : !aiConsent ? (
        <p role="status" className="mb-4 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          Atlenza IA está desactivado: tus apuntes y tu resumen semanal solo se envían a tu IA si lo autorizas en{" "}
          <Link href="/settings" className="font-medium text-foreground underline underline-offset-4">
            Ajustes → Privacidad e IA
          </Link>
          . Puedes seguir repasando flashcards existentes.
        </p>
      ) : null}
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
          <StorageMeter used={storage.used} limit={storage.limit} />
          <DocumentsPanel
            aiEnabled={aiEnabled}
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
          <AdaptPanel aiEnabled={aiEnabled || process.env.LIFEOS_FAKE_AI === "1"} docs={docs.filter((d) => d.status === "EMBEDDED").map((d) => ({ id: d.id, title: d.title }))} />
        </TabsContent>
        <TabsContent value="steps">
          <MicroStepsPanel aiEnabled={aiEnabled || process.env.LIFEOS_FAKE_AI === "1"} docs={docs.filter((d) => d.status === "EMBEDDED").map((d) => ({ id: d.id, title: d.title }))} />
        </TabsContent>
        <TabsContent value="manual">
          <ManualPanel aiEnabled={aiEnabled || process.env.LIFEOS_FAKE_AI === "1"} docs={docs.filter((d) => d.status === "EMBEDDED").map((d) => ({ id: d.id, title: d.title }))} />
        </TabsContent>
        <TabsContent value="chat">
          <StudyChat threads={threads} aiEnabled={aiEnabled && docs.some((d) => d.status === "EMBEDDED")} />
        </TabsContent>
        <TabsContent value="cards">
          <div className="grid gap-4">
            <FlashcardReview decks={decks} />
            <ManualCards decks={decks.map((d) => d.name)} />
            <Link href="/study/exam" className="text-sm font-medium underline underline-offset-4">
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
