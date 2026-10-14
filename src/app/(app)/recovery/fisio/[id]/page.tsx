import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { DeleteProtocol, ProtocolEditor, SharePanel } from "@/components/recovery/physio-coach";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError } from "@/lib/api";
import { pageUser } from "@/lib/auth/page";
import { phasesToText } from "@/lib/recovery/physio-protocol";
import { getOwn, shareableAthletes } from "@/lib/recovery/physio-service";

export const metadata = { title: "Protocolo de fisio · Atlenza" };

export default async function ProtocolPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await pageUser();
  const { id } = await params;
  const p = await getOwn(user, id).catch((e) => {
    if (e instanceof ApiError && (e.status === 404 || e.status === 403)) notFound();
    throw e;
  });
  const athletes = await shareableAthletes(user);
  return (
    <>
      <PageHeader title={p.title} description="Compartes en lectura: la atleta solo marca criterios y su dolor." />
      <p className="mb-3 text-sm">
        <Link href="/recovery/fisio" className="underline underline-offset-4">← Protocolos</Link>
      </p>
      <div className="grid gap-4">
        <Card className="gap-3 py-4">
          <CardHeader className="px-4"><CardTitle className="text-base">Compartir y seguimiento</CardTitle></CardHeader>
          <CardContent className="px-4">
            <SharePanel id={p.id} athletes={athletes} shares={p.shares} phaseNames={p.phases.map((x) => x.name)} />
          </CardContent>
        </Card>
        <Card className="gap-3 py-4">
          <CardHeader className="px-4"><CardTitle className="text-base">Contenido</CardTitle></CardHeader>
          <CardContent className="grid gap-3 px-4">
            <ProtocolEditor id={p.id} initial={{ title: p.title, notes: p.notes ?? "", text: phasesToText(p.phases) }} />
            <DeleteProtocol id={p.id} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
