import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { ExerciseEditor } from "@/components/training/exercise-forms";
import { ExerciseVideo } from "@/components/training/exercise-video";
import { Card, CardContent } from "@/components/ui/card";
import { ApiError } from "@/lib/api";
import { pageUser } from "@/lib/auth/page";
import { resolveAthleteId } from "@/lib/auth/session";
import { getExercise } from "@/lib/training/exercise-library";

export const metadata = { title: "Ejercicio · Atlenza" };

export default async function ExercisePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ athlete?: string }> }) {
  const user = await pageUser();
  const { id } = await params;
  const sp = await searchParams;
  const ownerId = await resolveAthleteId(user, sp.athlete, "SESSIONS");
  const ex = await getExercise(ownerId, id).catch((e) => {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  });
  const editable = ex.mine && ownerId === user.id;
  const q = ownerId === user.id ? "" : `?athlete=${ownerId}`;
  return (
    <>
      <PageHeader title={ex.name} description={ex.global ? "Ejercicio del catálogo (solo lectura)." : undefined} />
      <p className="mb-3 text-sm">
        <Link href={`/training/exercises${q}`} className="underline underline-offset-4">
          ← Biblioteca
        </Link>
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="gap-2 py-4">
          <CardContent className="grid gap-3 px-4">
            {editable ? (
              <ExerciseEditor id={ex.id} name={ex.name} description={ex.description ?? ""} />
            ) : (
              <>
                <h2 className="text-sm font-semibold">Instrucciones técnicas</h2>
                <p className="whitespace-pre-wrap text-sm">{ex.description || "Sin instrucciones."}</p>
              </>
            )}
          </CardContent>
        </Card>
        {ex.global ? null : (
          <Card className="gap-2 py-4">
            <CardContent className="grid gap-3 px-4">
              <h2 className="text-sm font-semibold">Vídeo de demostración</h2>
              <ExerciseVideo id={ex.id} hasVideo={ex.hasVideo} bytes={ex.videoBytes ?? 0} editable={editable} athlete={ownerId === user.id ? undefined : ownerId} />
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
