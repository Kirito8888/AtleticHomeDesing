import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { ProtocolEditor } from "@/components/recovery/physio-coach";
import { pageUser } from "@/lib/auth/page";
import { listOwn, listShared } from "@/lib/recovery/physio-service";

export const metadata = { title: "Fisio y readaptación · Atlenza" };

export default async function PhysioPage() {
  const user = await pageUser();
  const [shared, own] = await Promise.all([listShared(user), user.role === "COACH" ? listOwn(user) : Promise.resolve([])]);
  return (
    <>
      <PageHeader title="Fisio y readaptación" description="Protocolos por fases compartidos por tu entrenadora o fisio." />
      <div className="grid gap-4">
        {user.role === "COACH" ? (
          <>
            <section aria-label="Mis protocolos" className="grid gap-2">
              <h2 className="text-base font-semibold">Mis protocolos</h2>
              {own.length ? null : <p className="text-sm text-muted-foreground">Aún no has creado ningún protocolo.</p>}
              {own.map((p) => (
                <Link key={p.id} href={`/recovery/fisio/${p.id}`} className="block min-h-11 rounded-lg border p-3 text-sm hover:bg-accent">
                  <span className="font-medium">{p.title}</span>
                  <span className="block text-muted-foreground">{p.phases} fases · compartido con {p.shares}</span>
                </Link>
              ))}
            </section>
            <details className="rounded-lg border">
              <summary className="flex min-h-11 cursor-pointer items-center px-4 text-base font-semibold">+ Nuevo protocolo</summary>
              <div className="px-4 pb-4"><ProtocolEditor /></div>
            </details>
          </>
        ) : null}
        <section aria-label="Compartidos conmigo" className="grid gap-2">
          <h2 className="text-base font-semibold">Compartidos conmigo</h2>
          {shared.length ? (
            shared.map((s) => (
              <Link key={s.shareId} href={`/recovery/fisio/compartido/${s.shareId}`} className="block min-h-11 rounded-lg border p-3 text-sm hover:bg-accent">
                <span className="font-medium">{s.title}</span>
                <span className="block text-muted-foreground">De {s.owner} · fase {s.phase + 1}/{s.phases} · {s.pct} %</span>
              </Link>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">Nadie te ha compartido ningún protocolo.</p>
          )}
        </section>
      </div>
    </>
  );
}
