import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { SummaryView } from "@/components/study/pack/summary-view";
import { getPack } from "@/lib/ai/study-pack";
import { pageUser } from "@/lib/auth/page";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Resumen del tema · Atlenza" };

export default async function TopicSummaryPage({ params }: PageProps<"/study/modules/[id]/topics/[topicId]/summary">) {
  const user = await pageUser();
  const { id, topicId } = await params;
  const topic = await prisma.studyTopic.findFirst({ where: { id: topicId, moduleId: id, userId: user.id }, select: { name: true, module: { select: { name: true } } } });
  if (!topic) notFound();
  const pack = await getPack(user.id, topicId).catch(() => null);
  return (
    <>
      <PageHeader title={topic.name} description={`Resumen por prioridad · ${topic.module.name}`} />
      <Link href={`/study/modules/${id}`} className="mb-3 inline-flex min-h-11 items-center text-sm underline underline-offset-4">
        ← {topic.module.name}
      </Link>
      {pack?.summary ? (
        <SummaryView summary={pack.summary} />
      ) : (
        <p role="status" className="rounded-lg border p-3 text-sm text-muted-foreground">
          Este tema aún no tiene resumen. Genera su paquete en la asignatura.
        </p>
      )}
    </>
  );
}
