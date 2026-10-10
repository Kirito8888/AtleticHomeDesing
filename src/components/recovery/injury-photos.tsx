"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/client-api";
import { formatDate } from "@/lib/format";
import { usePendingShared } from "@/lib/share-client";

const MAX_SIDE = 1600;

/**
 * Reescala y vuelve a codificar la foto en el navegador: el JPEG nuevo no lleva EXIF (ni ubicación
 * ni modelo del móvil). Así lo que sube ya está limpio y pesa poco.
 */
async function reencode(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("No se pudo procesar la foto"))), "image/jpeg", 0.85));
}

/** v1.7 · Fotos de una molestia: cifradas en el servidor; solo se cargan cuando pulsas «Ver». */
export function InjuryPhotos({ injuryId, today, photos }: { injuryId: string; today: string; photos: Array<{ id: string; takenOn: string }> }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const shared = usePendingShared("injury");

  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.set("file", await reencode(file), "foto.jpg");
      form.set("takenOn", today);
      await api(`/api/recovery/injuries/${injuryId}/photos`, { form });
      toast.success("Foto guardada (cifrada)");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await api(`/api/recovery/photos/${id}`, { method: "DELETE" });
      setOpen(null);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-1.5 border-t pt-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">Fotos ({photos.length})</span>
        <label className="cursor-pointer text-xs font-medium underline underline-offset-4">
          {busy ? "Subiendo…" : "Añadir foto"}
          <input ref={input} type="file" accept="image/*" capture="environment" className="sr-only" disabled={busy} aria-label="Añadir foto de la molestia" onChange={(e) => upload(e.target.files?.[0])} />
        </label>
      </div>
      {shared.file ? (
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={async () => upload((await shared.take()) ?? undefined)}>
          Añadir aquí la foto compartida
        </Button>
      ) : null}
      {photos.length ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Fotos de la molestia">
          {photos.map((p) => (
            <li key={p.id}>
              <Button type="button" size="sm" variant={open === p.id ? "default" : "outline"} onClick={() => setOpen(open === p.id ? null : p.id)}>
                {formatDate(p.takenOn, { day: "numeric", month: "short" })}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {open ? (
        <figure className="grid gap-1">
          {/* eslint-disable-next-line @next/next/no-img-element -- se sirve descifrada y sin caché; next/image la guardaría */}
          <img src={`/api/recovery/photos/${open}`} alt="Foto de la molestia" className="max-h-80 w-full rounded-md object-contain" />
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => remove(open)}>
            Borrar esta foto
          </Button>
        </figure>
      ) : null}
    </div>
  );
}
