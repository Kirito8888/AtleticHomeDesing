import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { QuestMap } from "@/components/study/quest-map";
import { pageUser } from "@/lib/auth/page";
import { today, toIsoDay } from "@/lib/dates";
import { moduleView } from "@/lib/study/modules-service";

export const metadata = { title: "Modo Juego · Atlenza" };

export default async function QuestPage({ params }: PageProps<"/study/modules/[id]/quest">) {
  const user = await pageUser();
  const { id } = await params;
  const data = await moduleView(user.id, id, toIsoDay(today())).catch(() => null);
  if (!data) notFound();
  return (
    <>
      <PageHeader title={`Modo Juego · ${data.name}`} description="Un nivel por tema y un jefe final" />
      <Link href={`/study/modules/${id}`} className="mb-3 inline-flex min-h-11 items-center text-sm underline underline-offset-4">
        ← {data.name}
      </Link>
      <QuestMap moduleId={id} moduleName={data.name} topics={data.topics.map((t) => ({ id: t.id, name: t.name, tag: t.tag, minutes: t.minutes }))} />
    </>
  );
}
