import { PageHeader } from "@/components/page-header";
import { MockExam } from "@/components/study/mock-exam";
import { Card, CardContent } from "@/components/ui/card";
import { pageUser } from "@/lib/auth/page";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Examen simulado · LifeOS" };

/** v1.8 · Examen simulado con las flashcards (sin IA). */
export default async function MockExamPage() {
  const user = await pageUser();
  const decks = await prisma.flashcardDeck.findMany({ where: { userId: user.id }, orderBy: { name: "asc" }, select: { id: true, name: true, _count: { select: { cards: true } } } });
  return (
    <>
      <PageHeader title="Examen simulado" description="Tarjetas al azar con tiempo límite. Tú decides si la sabías; las falladas vuelven hoy al repaso." />
      <Card className="max-w-xl py-4">
        <CardContent className="px-4">
          <MockExam decks={decks.filter((d) => d._count.cards >= 3).map((d) => ({ id: d.id, name: d.name, total: d._count.cards }))} />
        </CardContent>
      </Card>
    </>
  );
}
