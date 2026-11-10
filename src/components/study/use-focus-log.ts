"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect } from "react";
import { toast } from "sonner";

import { api } from "@/lib/client-api";
import { localDay } from "@/lib/dates";

/** v2.9 · Minutos de foco por anotar cuando falla la red; se reintentan al abrir (la `clientKey` evita duplicados). */
const PENDING = "atlenza.study.pendingFocus";
export interface FocusLogInput {
  subject: string;
  minutes: number;
  moduleId?: string;
  clientKey?: string;
  date?: string;
}

const readPending = (): FocusLogInput[] => {
  try {
    const v = JSON.parse(localStorage.getItem(PENDING) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};
const writePending = (v: FocusLogInput[]) => {
  try {
    if (v.length) localStorage.setItem(PENDING, JSON.stringify(v));
    else localStorage.removeItem(PENDING);
  } catch {
    /* sin almacenamiento: no hay reintento */
  }
};
const post = (i: FocusLogInput) => api("/api/study/sessions", { body: { ...i, date: i.date ?? localDay(new Date()) } });

/** Anota minutos de estudio en `StudySession`. Si falla, quedan en cola local y se reintentan al volver a abrir. */
export function useFocusLog() {
  const router = useRouter();

  useEffect(() => {
    const queued = readPending();
    if (!queued.length) return;
    void (async () => {
      const left: FocusLogInput[] = [];
      for (const q of queued) await post(q).catch(() => left.push(q));
      writePending(left);
      if (left.length < queued.length) router.refresh();
    })();
  }, [router]);

  return useCallback(
    async (i: FocusLogInput): Promise<boolean> => {
      const input = { ...i, date: i.date ?? localDay(new Date()) };
      try {
        await post(input);
        toast.success(`${i.minutes} min de ${i.subject} anotados`);
        router.refresh();
        return true;
      } catch (e) {
        if (input.clientKey) writePending([...readPending().filter((q) => q.clientKey !== input.clientKey), input]);
        toast.error(`No se pudo anotar: ${(e as Error).message}${input.clientKey ? " (se reintentará)" : ""}`);
        return false;
      }
    },
    [router],
  );
}
