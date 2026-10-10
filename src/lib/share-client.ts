"use client";

import { useEffect, useRef, useState } from "react";

import { SHARE_CACHE, type ShareTarget } from "@/lib/share";

/** Ficheros compartidos pendientes (sin borrarlos). */
export async function peekSharedFiles(): Promise<File[]> {
  if (typeof window === "undefined" || !("caches" in window)) return [];
  try {
    const cache = await caches.open(SHARE_CACHE);
    const files: File[] = [];
    for (const req of await cache.keys()) {
      const res = await cache.match(req);
      if (!res) continue;
      const name = decodeURIComponent(res.headers.get("x-name") ?? "fichero");
      files.push(new File([await res.blob()], name, { type: res.headers.get("content-type") ?? "" }));
    }
    return files;
  } catch {
    return [];
  }
}

/** Vacía los ficheros compartidos (una vez usados o descartados). */
export async function clearSharedFiles() {
  if (typeof window === "undefined" || !("caches" in window)) return;
  try {
    await caches.delete(SHARE_CACHE);
  } catch {
    // sin Cache Storage: nada que borrar
  }
}

const TAKEN = "lifeos:shared-taken";

function sharedParam(): string | null {
  return typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("shared");
}

/** Recoge automáticamente lo compartido si la página se abrió con ?shared=<target>. */
export function useSharedFiles(target: ShareTarget, onFiles: (files: File[]) => void) {
  const done = useRef(false);
  const cb = useRef(onFiles);
  useEffect(() => {
    cb.current = onFiles;
  });
  useEffect(() => {
    if (done.current || sharedParam() !== target) return;
    done.current = true;
    void (async () => {
      const files = await peekSharedFiles();
      if (!files.length) return;
      await clearSharedFiles();
      cb.current(files);
    })();
  }, [target]);
}

/**
 * Para destinos con varios candidatos (cada molestia, cada movimiento): el fichero queda
 * pendiente hasta que se pulsa «Usar el fichero compartido» en uno de ellos.
 */
export function usePendingShared(target: ShareTarget) {
  const [file, setFile] = useState<File | null>(null);
  useEffect(() => {
    if (sharedParam() !== target) return;
    let alive = true;
    void peekSharedFiles().then((f) => alive && setFile(f[0] ?? null));
    // Al usarlo en un candidato, desaparece de los demás
    const gone = () => setFile(null);
    window.addEventListener(TAKEN, gone);
    return () => {
      alive = false;
      window.removeEventListener(TAKEN, gone);
    };
  }, [target]);
  async function take() {
    const f = file;
    await clearSharedFiles();
    window.dispatchEvent(new Event(TAKEN));
    return f;
  }
  return { file, take };
}
