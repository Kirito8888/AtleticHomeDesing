"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

import { parseQuest, questKey, type QuestState } from "@/lib/study/quest";

const EVENT = "atlenza-quest";
const subscribe = (cb: () => void) => {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENT, cb);
  };
};

/** Estado de la partida de una asignatura en localStorage (en el servidor es la partida vacía, sin romper la hidratación). */
export function useQuestStore(moduleId: string): [QuestState, (next: QuestState) => void] {
  const key = questKey(moduleId);
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
  const state = useMemo(() => parseQuest(raw), [raw]);
  const save = useCallback(
    (next: QuestState) => {
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* sin almacenamiento: el cambio no se conserva */
      }
      window.dispatchEvent(new Event(EVENT));
    },
    [key],
  );
  return [state, save];
}
