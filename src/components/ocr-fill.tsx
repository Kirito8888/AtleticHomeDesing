"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { reencodeImage } from "@/lib/client-image";

/**
 * v1.10 · Botón para leer una foto (o PDF) con el OCR del servidor y rellenar un formulario.
 * Las fotos se reescalan y pierden el EXIF en el navegador antes de subir. Nada se guarda: solo propone.
 */
export function OcrFill<T>({ endpoint, label, accept = "image/*,application/pdf", onResult }: { endpoint: string; label: string; accept?: string; onResult: (r: T) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept={accept}
        className="sr-only"
        aria-label={label}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setBusy(true);
          try {
            const body = new FormData();
            body.set("file", file.type.startsWith("image/") ? new File([await reencodeImage(file, 2400, 0.9)], "foto.jpg", { type: "image/jpeg" }) : file);
            const res = await fetch(endpoint, { method: "POST", body });
            const data = (await res.json()) as T & { error?: string };
            if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
            onResult(data);
          } catch (err) {
            toast.error((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      />
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()} className="justify-self-start">
        {busy ? "Leyendo…" : label}
      </Button>
    </>
  );
}
