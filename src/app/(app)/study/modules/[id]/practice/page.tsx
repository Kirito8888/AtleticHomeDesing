import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { Practice } from "@/components/study/practice";
import { pageUser } from "@/lib/auth/page";
import { today, toIsoDay } from "@/lib/dates";
import { moduleView } from "@/lib/study/modules-service";

export const metadata = { title: "Practicar · Atlenza" };

export default async function PracticePage({ params }: PageProps<"/study/modules/[id]/practice">) {
  const user = await pageUser();
  const { id } = await params;
  const data = await moduleView(user.id, id, toIsoDay(today())).catch(() => null);
  if (!data) notFound();
  return (
    <>
      <PageHeader title={`Practicar · ${data.name}`} description="Ejercicios sobre tus apuntes, con pistas y corrección explicada" />
      <Link href={`/study/modules/${id}`} className="mb-3 inline-flex min-h-11 items-center text-sm underline underline-offset-4">
        ← {data.name}
      </Link>
      <Practice moduleId={id} documents={data.documents.filter((d) => d.status === "EMBEDDED").map((d) => ({ id: d.id, title: d.title }))} />
    </>
  );
}
