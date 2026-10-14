import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { NewExercise } from "@/components/training/exercise-forms";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { pageUser } from "@/lib/auth/page";
import { resolveAthleteId } from "@/lib/auth/session";
import { listLibrary } from "@/lib/training/exercise-library";

export const metadata = { title: "Biblioteca de ejercicios · Atlenza" };

export default async function ExercisesPage({ searchParams }: { searchParams: Promise<{ q?: string; athlete?: string }> }) {
  const user = await pageUser();
  const sp = await searchParams;
  const ownerId = await resolveAthleteId(user, sp.athlete, "SESSIONS");
  const readOnly = ownerId !== user.id;
  const q = sp.q?.trim() ?? "";
  const all = await listLibrary(ownerId, q);
  const mine = all.filter((e) => e.mine);
  const catalog = all.filter((e) => e.global);
  const suffix = readOnly ? `?athlete=${ownerId}` : "";
  const row = (e: (typeof all)[number]) => (
    <li key={e.id}>
      <Link href={`/training/exercises/${e.id}${suffix}`} className="flex min-h-11 items-center justify-between gap-2 rounded-md px-1 py-2 text-sm hover:bg-muted">
        <span className="min-w-0 truncate">{e.name}</span>
        {e.hasVideo ? <Badge variant="secondary">Vídeo</Badge> : null}
      </Link>
    </li>
  );
  return (
    <>
      <PageHeader title="Biblioteca de ejercicios" description={readOnly ? "Solo lectura: ejercicios de tu atleta." : "Tus ejercicios con instrucciones y un clip propio de demostración."} />
      <form role="search" className="mb-4 flex gap-2">
        {readOnly ? <input type="hidden" name="athlete" value={ownerId} /> : null}
        <Input name="q" defaultValue={q} placeholder="Buscar ejercicio" aria-label="Buscar ejercicio" />
        <button type="submit" className="rounded-md border px-3 text-sm">
          Buscar
        </button>
      </form>
      {readOnly ? null : (
        <div className="mb-4">
          <NewExercise />
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="gap-2 py-4">
          <CardContent className="px-4">
            <h2 className="mb-1 text-sm font-semibold">Mis ejercicios</h2>
            {mine.length ? <ul>{mine.map(row)}</ul> : <p className="text-sm text-muted-foreground">{q ? "Sin resultados." : "Aún no hay ejercicios propios."}</p>}
          </CardContent>
        </Card>
        <Card className="gap-2 py-4">
          <CardContent className="px-4">
            <h2 className="mb-1 text-sm font-semibold">Catálogo</h2>
            {catalog.length ? <ul>{catalog.map(row)}</ul> : <p className="text-sm text-muted-foreground">Sin resultados.</p>}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
