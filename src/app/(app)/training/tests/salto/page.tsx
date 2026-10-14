import { PageHeader } from "@/components/page-header";
import { JumpMeter } from "@/components/training/jump-meter";
import { pageUser } from "@/lib/auth/page";
import { today, toIsoDay } from "@/lib/dates";

export const metadata = { title: "Medir salto · Atlenza" };

export default async function JumpPage() {
  await pageUser();
  return (
    <>
      <PageHeader title="Medir salto con vídeo" description="Tiempo de vuelo fotograma a fotograma (Balsalobre-Fernández et al., 2015). Graba en cámara lenta (120 o 240 fps); el vídeo no se sube." />
      <div className="max-w-xl">
        <JumpMeter today={toIsoDay(today())} />
      </div>
    </>
  );
}
