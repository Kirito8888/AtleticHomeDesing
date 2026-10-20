"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SHARE_TARGETS, shareTargetsFor } from "@/lib/share";
import { clearSharedFiles, peekSharedFiles } from "@/lib/share-client";
import { formatBytes } from "@/lib/format";

function kb(n: number) {
  return formatBytes(n);
}

export function SharedFiles() {
  const [files, setFiles] = useState<File[] | null>(null);
  useEffect(() => {
    void peekSharedFiles().then(setFiles);
  }, []);

  if (files === null) return <p className="text-sm text-muted-foreground">Leyendo…</p>;
  if (!files.length) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        No hay nada compartido. Desde otra app, pulsa «Compartir» y elige Atlenza (con la app instalada en la pantalla de inicio).
      </p>
    );
  }
  const first = files[0];
  const targets = shareTargetsFor(first.name, first.type);
  return (
    <div className="grid max-w-xl gap-4">
      <Card className="py-3">
        <CardContent className="px-4 text-sm">
          <ul aria-label="Ficheros compartidos" className="grid gap-1">
            {files.map((f, i) => (
              <li key={i} className="flex justify-between gap-2">
                <span className="truncate">{f.name}</span>
                <span className="shrink-0 text-muted-foreground">{kb(f.size)}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      {targets.length ? (
        <nav aria-label="Qué hacer con el fichero" className="grid gap-2">
          {targets.map((t) => (
            <Link key={t} href={SHARE_TARGETS[t].href} className="rounded-md border p-3 text-sm hover:bg-accent">
              <span className="font-medium">{SHARE_TARGETS[t].label}</span>
              <span className="block text-xs text-muted-foreground">{SHARE_TARGETS[t].hint}</span>
            </Link>
          ))}
        </nav>
      ) : (
        <p role="status" className="text-sm">
          Atlenza no sabe qué hacer con este tipo de fichero.
        </p>
      )}
      <Button
        type="button"
        variant="ghost"
        onClick={async () => {
          await clearSharedFiles();
          setFiles([]);
        }}
      >
        Descartar
      </Button>
    </div>
  );
}
