import { PageHeader } from "@/components/page-header";
import { CoachPanel, type CoachReportView } from "@/components/study/coach-panel";
import { DocumentsPanel } from "@/components/study/documents-panel";
import { FlashcardReview } from "@/components/study/flashcard-review";
import { StudyChat } from "@/components/study/study-chat";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { pageUser } from "@/lib/auth/page";
import { toIsoDay } from "@/lib/dates";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Astras AI · LifeOS" };

export default async function StudyPage({ searchParams }: PageProps<"/study">) {
  const user = await pageUser();
  const { tab } = await searchParams;
  const aiEnabled = Boolean(env().GEMINI_API_KEY);
  const now = new Date();
  const [docs, threads, decks, due, reports] = await Promise.all([
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
  const defaultTab = ["docs", "chat", "cards", "coach"].includes(String(tab)) ? String(tab) : "docs";

  return (
    <>
      <PageHeader title="Astras AI" description="Estudio con tus apuntes y coach de rendimiento (Gemini)" />
      {!aiEnabled ? (
        <p role="status" className="mb-4 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          La IA no está configurada: añade <code>GEMINI_API_KEY</code> a tu fichero de entorno y reinicia. Puedes seguir repasando flashcards existentes.
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
          <FlashcardReview decks={decks.map((d) => ({ id: d.id, name: d.name, total: d._count.cards, due: due.find((x) => x.deckId === d.id)?._count._all ?? 0 }))} />
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
