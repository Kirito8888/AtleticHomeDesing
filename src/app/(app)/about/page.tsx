import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import pkg from "../../../../package.json";

export const metadata = { title: "Acerca de · Atlenza" };

const REPO = "https://github.com/Kirito8888/AtleticHomeDesing";

/** Atlenza · autoría, licencia y atribuciones de datos de terceros. */
export default function AboutPage() {
  return (
    <>
      <PageHeader title="Acerca de Atlenza" description={`Versión ${pkg.version}`} />
      <div className="grid max-w-2xl gap-4 text-sm">
        <Card className="gap-2 py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-base">Autoría y licencia</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 px-4">
            <p>
              Atlenza es un programa creado por <span className="font-medium">David Ornelas Luna</span>. © 2026. Todos los derechos reservados.
            </p>
            <p className="text-muted-foreground">
              Solo pueden usarlo e instalarlo las personas a las que el autor ha dado permiso por escrito. Copiarlo, modificarlo, distribuirlo u ofrecerlo como servicio también requiere su autorización.
            </p>
            <p>
              <a href={`${REPO}/blob/main/LICENSE`} target="_blank" rel="noopener" className="underline underline-offset-2">
                Licencia completa
              </a>{" "}
              ·{" "}
              <a href={`${REPO}/issues`} target="_blank" rel="noopener" className="underline underline-offset-2">
                Pedir permiso
              </a>
            </p>
            <p className="text-muted-foreground">
              Información orientativa de entrenamiento y bienestar: no es un producto sanitario ni sustituye el consejo de profesionales de la salud.
            </p>
          </CardContent>
        </Card>
        <Card className="gap-2 py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-base">Datos y servicios de terceros</CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            <ul className="grid gap-2" aria-label="Atribuciones">
              <li>
                <span className="font-medium">Alimentos:</span> datos de{" "}
                <a href="https://world.openfoodfacts.org" target="_blank" rel="noopener" className="underline underline-offset-2">
                  Open Food Facts
                </a>
                , © sus colaboradores, bajo la licencia{" "}
                <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noopener" className="underline underline-offset-2">
                  ODbL
                </a>
                ; imágenes bajo CC BY-SA.
              </li>
              <li>
                <span className="font-medium">Tiempo:</span>{" "}
                <a href="https://open-meteo.com" target="_blank" rel="noopener" className="underline underline-offset-2">
                  Open-Meteo
                </a>{" "}
                (CC BY 4.0), uso no comercial.
              </li>
              <li>
                <span className="font-medium">Tipografía e iconos:</span> Geist (SIL Open Font License) y Lucide (ISC).
              </li>
              <li>
                <span className="font-medium">Bibliotecas:</span>{" "}
                <a href={`${REPO}/blob/main/THIRD_PARTY_NOTICES.md`} target="_blank" rel="noopener" className="underline underline-offset-2">
                  lista completa con sus licencias
                </a>
                .
              </li>
              <li className="text-muted-foreground">Las marcas de terceros que se mencionan (Garmin, Strava, Apple Health, Google…) pertenecen a sus titulares y se citan solo para indicar compatibilidad.</li>
            </ul>
          </CardContent>
        </Card>
        <p>
          <Link href="/settings" className="underline underline-offset-2">
            Volver a Ajustes
          </Link>
        </p>
      </div>
    </>
  );
}
