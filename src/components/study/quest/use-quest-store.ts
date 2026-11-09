"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";

import { emptyQuest, freshQuest, parseQuest, questKey, type QuestState } from "@/lib/study/quest";
import { hasProgress, mergeQuest, sanitizeQuest } from "@/lib/study/quest-progress";

const EVENT = "atlenza-quest";
const subscribe = (cb: () => void) => {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENT, cb);
  };
};

// ───────────── Sincronización con el servidor (v2.6) ─────────────
// localStorage sigue siendo la copia local (rápida y sin conexión). El servidor guarda el progreso por usuaria con versión:
// `.sync` = { version, dirty }. Con `dirty` hay cambios sin enviar; sin `.sync` este dispositivo nunca se ha sincronizado.

interface Meta {
  version: number;
  dirty: boolean;
}
const metaKey = (id: string) => `${questKey(id)}.sync`;
const url = (id: string) => `/api/study/quest-progress/${id}`;
const JSON_HEADERS = { "content-type": "application/json" };

function readLocal(id: string): QuestState {
  try {
    return parseQuest(localStorage.getItem(questKey(id)));
  } catch {
    return emptyQuest();
  }
}
function writeLocal(id: string, s: QuestState) {
  try {
    localStorage.setItem(questKey(id), JSON.stringify(s));
  } catch {
    /* sin almacenamiento: el cambio no se conserva en este dispositivo */
  }
  window.dispatchEvent(new Event(EVENT));
}
function readMeta(id: string): Meta | null {
  try {
    const m = JSON.parse(localStorage.getItem(metaKey(id)) ?? "null") as Meta | null;
    return m && typeof m.version === "number" && typeof m.dirty === "boolean" ? m : null;
  } catch {
    return null;
  }
}
function writeMeta(id: string, m: Meta) {
  try {
    localStorage.setItem(metaKey(id), JSON.stringify(m));
  } catch {
    /* idem */
  }
}

const same = (a: QuestState, b: QuestState) => JSON.stringify(a) === JSON.stringify(b);
const inflight = new Set<string>();
const again = new Set<string>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

/** Envía el estado local. Ante un conflicto de versión lo une con el del servidor y reintenta. Nunca lanza: sin red queda pendiente. */
async function push(id: string, keepalive = false): Promise<void> {
  if (inflight.has(id)) {
    again.add(id);
    return;
  }
  inflight.add(id);
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const sent = readLocal(id);
      const res = await fetch(url(id), { method: "PUT", headers: JSON_HEADERS, keepalive, body: JSON.stringify({ state: sent, baseVersion: readMeta(id)?.version ?? 0 }) });
      if (res.ok) {
        const j = (await res.json()) as { version: number };
        writeMeta(id, { version: j.version, dirty: !same(readLocal(id), sent) });
        break;
      }
      if (res.status !== 409) break;
      const j = (await res.json().catch(() => null)) as { details?: { state: unknown; version: number } } | null;
      if (!j?.details) break;
      writeLocal(id, mergeQuest(readLocal(id), sanitizeQuest(j.details.state)));
      writeMeta(id, { version: j.details.version, dirty: true });
    }
  } catch {
    /* sin conexión: sigue pendiente y se reintenta en el siguiente cambio */
  } finally {
    inflight.delete(id);
    // Cambios llegados mientras se enviaba: otra vuelta. (Sin red no se reintenta en bucle: queda `dirty` para el siguiente cambio.)
    if (again.delete(id) && !keepalive) schedule(id, 300);
  }
}
function schedule(id: string, ms = 700) {
  clearTimeout(timers.get(id));
  timers.set(id, setTimeout(() => void push(id), ms));
}

/** Al abrir: une o adopta lo del servidor según este dispositivo se haya sincronizado ya o no. */
async function pull(id: string): Promise<void> {
  try {
    const res = await fetch(url(id));
    if (!res.ok) return;
    const j = (await res.json()) as { state: unknown; version: number };
    const local = readLocal(id);
    const meta = readMeta(id);
    if (j.state === null) {
      if (hasProgress(local)) {
        writeMeta(id, { version: 0, dirty: true });
        void push(id);
      }
      return;
    }
    const server = sanitizeQuest(j.state);
    // Dispositivo ya sincronizado y sin cambios pendientes: manda el servidor (así un «Reiniciar» en otro dispositivo se respeta).
    const next = !meta || meta.dirty ? mergeQuest(local, server) : server;
    if (!same(next, local)) writeLocal(id, next);
    const dirty = !same(next, server);
    writeMeta(id, { version: j.version, dirty });
    if (dirty) void push(id);
  } catch {
    /* sin conexión: se queda con la copia local */
  }
}

/**
 * «Reiniciar partida» (v2.8): deja la partida a cero aquí y en el servidor (`DELETE`, sin control de versión). Un envío anterior
 * aún en vuelo choca (409) y se une con el servidor ya vacío. Sin red devuelve `false`: queda pendiente y se envía con el
 * siguiente cambio (por versión, así que si otro dispositivo guardó entretanto se unirán sus progresos).
 */
export async function resetQuest(id: string): Promise<boolean> {
  clearTimeout(timers.get(id));
  timers.delete(id);
  writeLocal(id, freshQuest());
  try {
    const res = await fetch(url(id), { method: "DELETE" });
    if (res.ok) {
      const j = (await res.json()) as { version: number };
      writeMeta(id, { version: j.version, dirty: false });
      return true;
    }
  } catch {
    /* sin conexión: se envía como un cambio normal */
  }
  writeMeta(id, { version: readMeta(id)?.version ?? 0, dirty: true });
  schedule(id);
  return false;
}

/**
 * Estado de la partida de una asignatura: copia en localStorage (en el servidor es la partida vacía, sin romper la hidratación)
 * sincronizada con el servidor. Cada cambio se guarda al momento en local y se envía en segundo plano.
 */
export function useQuestStore(moduleId: string): [QuestState, (next: QuestState) => void, () => Promise<boolean>] {
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
  useEffect(() => {
    void pull(moduleId);
    const flush = () => {
      if (document.visibilityState === "hidden" && readMeta(moduleId)?.dirty) void push(moduleId, true);
    };
    document.addEventListener("visibilitychange", flush);
    return () => document.removeEventListener("visibilitychange", flush);
  }, [moduleId]);
  const save = useCallback(
    (next: QuestState) => {
      writeLocal(moduleId, next);
      writeMeta(moduleId, { version: readMeta(moduleId)?.version ?? 0, dirty: true });
      schedule(moduleId);
    },
    [moduleId],
  );
  const reset = useCallback(() => resetQuest(moduleId), [moduleId]);
  return [state, save, reset];
}
