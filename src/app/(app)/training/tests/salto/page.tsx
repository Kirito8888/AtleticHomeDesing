import { PageHeader } from "@/components/page-header";
import { TestsNav } from "@/components/training/tests-nav";
import { JumpGuide } from "@/components/training/jump-guide";
import { JumpMeter } from "@/components/training/jump-meter";
import { pageUser } from "@/lib/auth/page";
import { today, toIsoDay } from "@/lib/dates";

export const metadata = { title: "Medir salto · Atlenza" };

export default async function JumpPage() {
  await pageUser();
  return (
    <>
      <PageHeader title="Medir salto con vídeo" description="Tiempo de vuelo fotograma a fotograma (Balsalobre-Fernández et al., 2015). Cuantos más fps, más preciso (100, 120 o 240); el vídeo no se sube." />
      <TestsNav />
      <div className="max-w-xl">
        <JumpMeter today={toIsoDay(today())} />
        <JumpGuide />
      </div>
    </>
  );
}
