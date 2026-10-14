"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { VIDEO_MAX_BYTES } from "@/lib/files/video";

/**
 * Reproductor de bajo consumo: no se pide nada hasta pulsar «Ver vídeo»; entonces se descifra en el servidor (sin
 * URL pública), se guarda como Blob local y se libera al cerrar o salir. Subida: solo MP4/WebM de hasta 25 MB.
 */
export function ExerciseVideo({ id, hasVideo, bytes, editable, athlete }: { id: string; hasVideo: boolean; bytes: number; editable: boolean; athlete?: string }) {
  const router = useRouter();
  const [src, setSrc] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const url = `/api/training/exercises/${id}/video${athlete ? `?athlete=${athlete}` : ""}`;

  useEffect(() => () => { if (src) URL.revokeObjectURL(src); }, [src]);
  const close = () => setSrc(null);

  async function load() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Error ${res.status}`);
      setSrc(URL.createObjectURL(await res.blob()));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function upload(file: File) {
    setError("");
    if (file.size > VIDEO_MAX_BYTES) return setError("El vídeo ocupa demasiado (máx. 25 MB por clip)");
    setBusy(true);
    try {
      const form = new FormData();
      form.set("file", file);
      const res = await fetch(`/api/training/exercises/${id}/video`, { method: "PUT", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
      setSrc(null);
      toast.success("Vídeo guardado");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove() {
    setBusy(true);
    try {
      const res = await fetch(`/api/training/exercises/${id}/video`, { method: "DELETE" });
      if (!res.ok) throw new Error("No se pudo borrar");
      setSrc(null);
      toast.success("Vídeo borrado");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-3">
      {src ? (
        <video src={src} controls playsInline autoPlay muted preload="metadata" aria-label="Vídeo de demostración" className="aspect-video w-full rounded-md bg-black" />
      ) : null}
      <div className="flex flex-wrap gap-2">
        {hasVideo ? (
          src ? (
            <Button type="button" size="sm" variant="outline" onClick={close}>
              Cerrar vídeo
            </Button>
          ) : (
            <Button type="button" size="sm" onClick={load} disabled={busy}>
              Ver vídeo ({(bytes / 1048576).toFixed(1)} MB)
            </Button>
          )
        ) : (
          <p className="text-sm text-muted-foreground">Sin vídeo.</p>
        )}
        {editable ? (
          <>
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => input.current?.click()}>
              {hasVideo ? "Cambiar vídeo" : "Subir vídeo"}
            </Button>
            {hasVideo ? (
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={remove}>
                Borrar vídeo
              </Button>
            ) : null}
            <input ref={input} type="file" accept="video/mp4,video/webm" className="sr-only" aria-label="Elegir vídeo" tabIndex={-1} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          </>
        ) : null}
      </div>
      {editable ? <p className="text-xs text-muted-foreground">Solo tus propios vídeos: MP4 o WebM, hasta 25 MB. Se guardan cifrados; no hay enlaces públicos.</p> : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
