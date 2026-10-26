import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { QuestPlay } from "@/components/study/quest/quest-play";
import { pageUser } from "@/lib/auth/page";
import { today, toIsoDay } from "@/lib/dates";
import { BOSS_ID } from "@/lib/study/quest";
import { moduleView } from "@/lib/study/modules-service";

export const metadata = { title: "Partida · Modo Juego · Atlenza" };

export default async function QuestPlayPage({ params, searchParams }: PageProps<"/study/modules/[id]/quest/play">) {
  const user = await pageUser();
  const { id } = await params;
  const sp = await searchParams;
  const data = await moduleView(user.id, id, toIsoDay(today())).catch(() => null);
  if (!data) notFound();
  const level = typeof sp.level === "string" ? sp.level : "";
  const dungeon = sp.mode === "dungeon";
  if (!dungeon && !level) notFound();
  const mode = dungeon ? "dungeon" : level === BOSS_ID ? "boss" : "level";
  return (
    <>
      <PageHeader title={`Modo Juego · ${data.name}`} description={dungeon ? "Mazmorra de fallos" : "Partida"} />
      <Link href={`/study/modules/${id}/quest`} className="mb-3 inline-flex min-h-11 items-center text-sm underline underline-offset-4">
        ← Mapa
      </Link>
      <QuestPlay key={`${mode}:${dungeon ? "dungeon" : level}`} moduleId={id} mode={mode} nodeId={dungeon ? "dungeon" : level} topics={data.topics.map((t) => ({ id: t.id, name: t.name, tag: t.tag, minutes: t.minutes }))} />
    </>
  );
}
