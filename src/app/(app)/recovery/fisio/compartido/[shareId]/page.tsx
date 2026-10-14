import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { SharedProtocol } from "@/components/recovery/physio-athlete";
import { ApiError } from "@/lib/api";
import { pageUser } from "@/lib/auth/page";
import { getShared } from "@/lib/recovery/physio-service";

export const metadata = { title: "Protocolo compartido · Atlenza" };

export default async function SharedPage({ params }: { params: Promise<{ shareId: string }> }) {
  const user = await pageUser();
  const { shareId } = await params;
  const s = await getShared(user, shareId).catch((e) => {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  });
  return (
    <>
      <PageHeader title={s.title} description={`Compartido por ${s.owner}`} />
      <p className="mb-3 text-sm">
        <Link href="/recovery/fisio" className="underline underline-offset-4">← Fisio y readaptación</Link>
      </p>
      {s.notes ? <p className="mb-3 whitespace-pre-line text-sm">{s.notes}</p> : null}
      <SharedProtocol shareId={s.shareId} initial={{ phases: s.phases, progress: s.progress, painToday: s.painToday, phase: s.phase, done: s.done, total: s.total, pct: s.pct }} />
    </>
  );
}
