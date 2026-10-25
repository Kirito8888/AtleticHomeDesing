import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { SelfTest } from "@/components/study/self-test";
import { pageUser } from "@/lib/auth/page";
import { today, toIsoDay } from "@/lib/dates";
import { moduleView } from "@/lib/study/modules-service";

export const metadata = { title: "Evaluar nivel · Atlenza" };

export default async function SelfTestPage({ params }: PageProps<"/study/modules/[id]/test">) {
  const user = await pageUser();
  const { id } = await params;
  const data = await moduleView(user.id, id, toIsoDay(today())).catch(() => null);
  if (!data) notFound();
  return (
    <>
      <PageHeader title={`Evaluar nivel · ${data.name}`} description="Test sobre tus apuntes para ver qué te falta para el 10" />
      <Link href={`/study/modules/${id}`} className="mb-3 inline-flex min-h-11 items-center text-sm underline underline-offset-4">
        ← {data.name}
      </Link>
      <SelfTest moduleId={id} topics={data.topics.map((t) => ({ name: t.name, tag: t.tag, done: t.done }))} />
    </>
  );
}
