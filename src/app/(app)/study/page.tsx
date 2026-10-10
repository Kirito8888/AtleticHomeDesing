import Link from "next/link";
import { Sparkles } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { CoachPanel, type CoachReportView } from "@/components/study/coach-panel";
import { DocumentsPanel } from "@/components/study/documents-panel";
import { FlashcardReview } from "@/components/study/flashcard-review";
import { ManualCards } from "@/components/v17/study-v17";
import { StudyChat } from "@/components/study/study-chat";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { pageUser } from "@/lib/auth/page";
import { toIsoDay } from "@/lib/dates";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Astras AI · LifeOS" };

export default async function StudyPage({ searchParams }: PageProps<"/study">) {
  const user = await pageUser();
  const { tab } = await searchParams;
  const aiConfigured = Boolean(env().GEMINI_API_KEY);
  const now = new Date();
  const [me, docs, threads, decks, due, reports] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { aiConsentAt: true } }),
    prisma.studyDocument.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { chunks: true, flashcards: true } } },
    }),
    prisma.chatThread.findMany({ where: { userId: user.id, kind: "STUDY" }, orderBy: { updatedAt: "desc" }, take: 30, select: { id: true, title: true } }),
    prisma.flashcardDeck.findMany({ where: { userId: user.id }, orderBy: { updatedAt: "desc" }, include: { _count: { select: { cards: true } } } }),
    prisma.flashcard.groupBy({ by: ["deckId"], where: { deck: { userId: user.id }, dueAt: { lte: now } }, _count: { _all: true } }),
    prisma.coachReport.findMany({ where: { userId: user.id }, orderBy: { weekStart: "desc" }, take: 8 }),
  ]);
  const aiConsent = me.aiConsentAt != null;
  const aiEnabled = aiConfigured && aiConsent;
  const defaultTab = ["docs", "chat", "cards", "coach"].includes(String(tab)) ? String(tab) : "docs";

  return (
    <>
      <PageHeader
        title="Astras AI"
        description="Estudio con tus apuntes, coach de rendimiento y planes de entrenamiento (Gemini)"
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
        <Link href="/study/schedule" className="underline underline-offset-4">
          Horario y exámenes
        </Link>
        <Link href="/study/focus" className="underline underline-offset-4">
          Pomodoro y horas de estudio
        </Link>
        <Link href="/study/exams" className="underline underline-offset-4">
          Exámenes y notas
        </Link>
        <Link href="/study/assignments" className="underline underline-offset-4">
          Trabajos y entregas
        </Link>
      </nav>
      {!aiConfigured ? (
        <p role="status" className="mb-4 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          La IA no está configurada: añade <code>GEMINI_API_KEY</code> a tu fichero de entorno y reinicia. Puedes seguir repasando flashcards existentes.
        </p>
      ) : !aiConsent ? (
        <p role="status" className="mb-4 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          Astras AI está desactivado: tus apuntes y tu resumen semanal solo se envían a Google Gemini si lo autorizas en{" "}
          <Link href="/settings" className="font-medium text-foreground underline underline-offset-4">
            Ajustes → Privacidad e IA
          </Link>
          . Puedes seguir repasando flashcards existentes.
        </p>
      ) : null}
      <Tabs defaultValue={defaultTab}>
        <TabsList>
          <TabsTrigger value="docs">Apuntes</TabsTrigger>
          <TabsTrigger value="chat">Chat</TabsTrigger>
          <TabsTrigger value="cards">Flashcards</TabsTrigger>
          <TabsTrigger value="coach">Coach</TabsTrigger>
        </TabsList>
        <TabsContent value="docs">
          <DocumentsPanel
            aiEnabled={aiEnabled}
            docs={docs.map((d) => ({
              id: d.id,
              title: d.title,
              subject: d.subject,
              status: d.status,
              error: d.error,
              createdAt: toIsoDay(d.createdAt),
              chunks: d._count.chunks,
              flashcards: d._count.flashcards,
            }))}
          />
        </TabsContent>
        <TabsContent value="chat">
          <StudyChat threads={threads} aiEnabled={aiEnabled && docs.some((d) => d.status === "EMBEDDED")} />
        </TabsContent>
        <TabsContent value="cards">
          <div className="grid gap-4">
            <FlashcardReview decks={decks.map((d) => ({ id: d.id, name: d.name, total: d._count.cards, due: due.find((x) => x.deckId === d.id)?._count._all ?? 0 }))} />
            <ManualCards decks={decks.map((d) => d.name)} />
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
