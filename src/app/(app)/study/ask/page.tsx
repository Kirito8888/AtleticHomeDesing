import { AskData } from "@/components/ai/ask-data";
import { PageHeader } from "@/components/page-header";
import { pageUser } from "@/lib/auth/page";

export const metadata = { title: "Pregunta a tus datos · Atlenza" };

export default async function AskPage() {
  await pageUser();
  return (
    <>
      <PageHeader title="Pregunta a tus datos" description="Respuestas con tus cifras de entreno (requiere la IA activada en Ajustes)." />
      <div className="max-w-2xl">
        <AskData />
      </div>
    </>
  );
}
