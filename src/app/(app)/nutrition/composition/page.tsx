import { CompositionEvolution, MassBreakdown, Somatochart } from "@/components/nutrition/body-composition-charts";
import { BodyCompositionImport } from "@/components/nutrition/body-composition-import";
import { BodyCompositionCard, BodyCompositionForm, BodyCompositionHistory } from "@/components/nutrition/body-composition";
import { PageHeader } from "@/components/page-header";
import { pageUser } from "@/lib/auth/page";
import { listBodyComposition } from "@/lib/health/isak-service";
import { prisma } from "@/lib/prisma";
import { dataKeyConfigured } from "@/lib/security/data-key";

export const metadata = { title: "Composición corporal · Atlenza" };

/** v2.9 · Cineantropometría ISAK: somatotipo y 4 masas. Salud cifrada, solo para ti (ni IA ni entrenadora). */
export default async function CompositionPage() {
  const user = await pageUser();
  if (!dataKeyConfigured()) {
    return (
      <>
        <PageHeader title="Composición corporal" description="Cineantropometría ISAK." />
        <p role="alert" className="text-sm">El servidor no tiene clave de cifrado (DATA_ENCRYPTION_KEY): no se pueden guardar datos de salud.</p>
      </>
    );
  }
  const [records, profile] = await Promise.all([
    listBodyComposition(user.id),
    prisma.athleteProfile.findUnique({ where: { userId: user.id }, select: { sex: true, heightCm: true, bodyWeightKg: true } }),
  ]);
  const points = records.map((r) => ({ id: r.id, date: r.date, weightKg: r.input.weightKg, somatotype: r.result.somatotype, masses: r.result.masses }));
  return (
    <>
      <PageHeader title="Composición corporal" description="Somatotipo (Heath-Carter) y 4 masas (grasa, músculo, hueso, residual) a partir de tus medidas ISAK. Se guarda cifrado y no lo ve la IA ni tu entrenadora." />
      <div className="grid gap-4">
        <BodyCompositionCard title="Somatocarta">
          <Somatochart points={points} />
        </BodyCompositionCard>
        <BodyCompositionCard title="Las 4 masas">
          <MassBreakdown points={points} />
        </BodyCompositionCard>
        <BodyCompositionCard title="Evolución">
          <CompositionEvolution points={points} />
        </BodyCompositionCard>
        <BodyCompositionCard title="Nueva medición">
          <BodyCompositionForm defaults={{ sex: profile?.sex === "MALE" ? "M" : "F", heightCm: profile?.heightCm ?? undefined, weightKg: profile?.bodyWeightKg ?? undefined }} />
        </BodyCompositionCard>
        <BodyCompositionCard title="Importar CSV o JSON">
          <BodyCompositionImport />
        </BodyCompositionCard>
        <BodyCompositionCard title="Histórico">
          <BodyCompositionHistory records={records} />
        </BodyCompositionCard>
      </div>
    </>
  );
}
