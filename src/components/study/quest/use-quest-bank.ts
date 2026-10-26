"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

import { BANK_CAP, mergeBank, parseBank, questBankKey, type QuestBank } from "@/lib/study/quest-ai";
import type { QuestItem } from "@/lib/study/quest-mock";

const EVENT = "atlenza-quest-bank";
const subscribe = (cb: () => void) => {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENT, cb);
  };
};

/** Caché local de las preguntas generadas de una asignatura: la mazmorra resuelve con ella los ids de fallos. Solo por dispositivo. */
export function useQuestBank(moduleId: string): [QuestBank, (items: QuestItem[], keep: string[]) => void] {
  const key = questBankKey(moduleId);
  const raw = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    () => null,
  );
  const bank = useMemo(() => parseBank(raw), [raw]);
  const merge = useCallback(
    (items: QuestItem[], keep: string[]) => {
      try {
        localStorage.setItem(key, JSON.stringify(mergeBank(parseBank(localStorage.getItem(key)), items, keep, BANK_CAP)));
      } catch {
        /* sin almacenamiento: la mazmorra no recordará estas preguntas */
      }
      window.dispatchEvent(new Event(EVENT));
    },
    [key],
  );
  return [bank, merge];
}
