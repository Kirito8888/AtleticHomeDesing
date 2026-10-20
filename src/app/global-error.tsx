"use client";

import { RouteError } from "@/components/route-error";
import "./globals.css";

/** Último recurso: falla el layout raíz. Define su propio documento (en español) y reutiliza el límite común. */
export default function GlobalError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="es">
      <body className="flex min-h-full flex-col">
        <title>Error · Atlenza</title>
        <main className="mx-auto w-full max-w-md px-4 pt-10">
          <RouteError where="Atlenza" {...props} />
        </main>
      </body>
    </html>
  );
}
