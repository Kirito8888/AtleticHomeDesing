import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { ModuleDetail } from "@/components/study/module-detail";
import { pageUser } from "@/lib/auth/page";
import { today, toIsoDay } from "@/lib/dates";
import { moduleView } from "@/lib/study/modules-service";

export const metadata = { title: "Asignatura · Atlenza" };

export default async function ModulePage({ params }: PageProps<"/study/modules/[id]">) {
  const user = await pageUser();
  const { id } = await params;
  const data = await moduleView(user.id, id, toIsoDay(today())).catch(() => null);
  if (!data) notFound();
  return (
    <>
      <PageHeader title={data.name} description="Fecha de examen, temas por prioridad y apuntes de esta asignatura" />
      <Link href="/study?tab=modules" className="mb-3 inline-flex min-h-11 items-center text-sm underline underline-offset-4">
        ← Asignaturas
      </Link>
      <ModuleDetail data={data} />
    </>
  );
}
