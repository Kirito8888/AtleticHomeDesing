"use client";

import { useState } from "react";

import { EXPORT_MODULES, EXPORT_MODULE_KEYS, type ExportModuleKey, exportQuery, SENSITIVE_INCLUDES } from "@/lib/account/export-modules";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * v3.2 N · Exportación guiada (art. 20): eliges módulos, ves qué lleva cada uno y descargas.
 * Lo cifrado va aparte, desmarcado, con su aviso. El enlace apunta a `GET /api/account/export`.
 */
export function GuidedExport() {
  const [mods, setMods] = useState<ExportModuleKey[]>([...EXPORT_MODULE_KEYS]);
  const [sensitive, setSensitive] = useState(false);
  const toggle = (k: ExportModuleKey) => setMods((m) => (m.includes(k) ? m.filter((x) => x !== k) : EXPORT_MODULE_KEYS.filter((x) => x === k || m.includes(x))));
  const href = `/api/account/export?${exportQuery({ modules: mods, sensitive })}`;
  const empty = mods.length === 0 && !sensitive;
  return (
    <div id="exportar" className="grid gap-3 scroll-mt-4" data-testid="guided-export">
      <p className="text-sm">
        Elige qué módulos quieres llevarte. Siempre va tu cuenta (perfil, accesos, consentimientos y avisos). <strong>No incluye datos de otras personas</strong> (de los comentarios de tu
        entrenadora solo queda que existen), ni contraseñas, claves o ficheros originales.
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "min-h-11")} onClick={() => setMods([...EXPORT_MODULE_KEYS])}>
          Todo
        </button>
        <button type="button" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "min-h-11")} onClick={() => setMods([])}>
          Nada
        </button>
      </div>
      <ul className="grid gap-2" aria-label="Módulos a exportar">
        {EXPORT_MODULES.map((m) => (
          <li key={m.key} className="rounded-md border">
            <label className="flex min-h-11 items-center gap-3 px-3 py-2 font-medium">
              <input type="checkbox" className="size-5" checked={mods.includes(m.key)} onChange={() => toggle(m.key)} />
              {m.label}
            </label>
            <details className="px-3 pb-2 text-xs text-muted-foreground">
              <summary className="flex min-h-11 cursor-pointer items-center">Qué incluye {m.label}</summary>
              <ul className="ml-4 grid list-disc gap-1 pb-1">
                {m.includes.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </details>
          </li>
        ))}
      </ul>
      <div className="rounded-md border border-amber-500/60 bg-amber-500/10 p-3 text-sm">
        <label className="flex min-h-11 items-start gap-3 font-medium">
          <input type="checkbox" className="mt-0.5 size-5 shrink-0" checked={sensitive} onChange={(e) => setSensitive(e.target.checked)} />
          Incluir también mis datos de salud cifrados
        </label>
        <p className="mt-1 text-xs">
          Son: {SENSITIVE_INCLUDES.join(", ").toLowerCase()}. <strong>Por defecto no salen.</strong> Si lo marcas, el fichero los lleva <strong>descifrados y legibles</strong>: guárdalo en un sitio
          seguro y no lo compartas.
        </p>
        {sensitive && (
          <p role="status" data-testid="sensitive-warning" className="mt-2 text-xs font-medium">
            Aviso: este archivo incluirá datos de salud sin cifrar.
          </p>
        )}
      </div>
      {empty ? (
        <span aria-disabled="true" className={cn(buttonVariants(), "min-h-11 w-fit cursor-not-allowed opacity-50")}>
          Descargar (elige algo)
        </span>
      ) : (
        <a href={href} download className={cn(buttonVariants(), "min-h-11 w-fit")} data-testid="export-download">
          Descargar mis datos (JSON)
        </a>
      )}
    </div>
  );
}
