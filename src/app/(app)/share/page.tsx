import { PageHeader } from "@/components/page-header";
import { SharedFiles } from "@/components/share/shared-files";
import { pageUser } from "@/lib/auth/page";

export const metadata = { title: "Compartir · Atlenza" };

/** v1.8 · Destino de «Compartir con Atlenza» desde otras apps del móvil. */
export default async function SharePage() {
  await pageUser();
  return (
    <>
      <PageHeader title="Compartir con Atlenza" description="Elige qué hacer con lo que has compartido. Nada se guarda hasta que lo confirmes en la siguiente pantalla." />
      <SharedFiles />
    </>
  );
}
