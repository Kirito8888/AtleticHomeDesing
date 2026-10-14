import { PageHeader } from "@/components/page-header";
import { MockExam } from "@/components/study/mock-exam";
import { Card, CardContent } from "@/components/ui/card";
import { pageUser } from "@/lib/auth/page";
import { listDecks } from "@/lib/ai/flashcards";

export const metadata = { title: "Examen simulado · Atlenza" };

/** v1.8 · Examen simulado con las flashcards (sin IA). */
export default async function MockExamPage() {
  const user = await pageUser();
  const decks = (await listDecks(user.id)).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <>
      <PageHeader title="Examen simulado" description="Tarjetas al azar con tiempo límite. Tú decides si la sabías; las falladas vuelven hoy al repaso." />
      <Card className="max-w-xl py-4">
        <CardContent className="px-4">
          <MockExam decks={decks.filter((d) => d.total >= 3).map((d) => ({ id: d.id, name: d.name, total: d.total }))} />
        </CardContent>
      </Card>
    </>
  );
}
