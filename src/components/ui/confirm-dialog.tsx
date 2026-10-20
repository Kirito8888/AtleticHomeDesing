"use client";

import * as React from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Acción que borra o quita algo: el botón principal sale en rojo. */
  destructive?: boolean;
};

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };

// Almacén mínimo: `confirmDialog()` encola la petición y `<ConfirmHost />` las muestra de una en una.
let queue: Pending[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
const head = () => queue[0] ?? null;

/** Sustituye a `window.confirm`: `if (!(await confirmDialog({ title: "¿Borrar?" }))) return;` */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    queue = [...queue, { ...options, resolve }];
    emit();
  });
}

/** Resuelve `item` solo si sigue siendo el de delante: Radix también avisa de «cerrado» tras pulsar un botón. */
function settle(item: Pending | null, ok: boolean) {
  const cur = queue[0];
  if (!cur || cur !== item) return;
  queue = queue.slice(1);
  emit();
  cur.resolve(ok);
}

/** Monta una sola vez en el layout raíz. */
export function ConfirmHost() {
  const cur = React.useSyncExternalStore(subscribe, head, () => null);
  return (
    <AlertDialog open={cur != null} onOpenChange={(open) => !open && settle(cur, false)}>
      {cur ? (
        <AlertDialogContent>
          <AlertDialogTitle>{cur.title}</AlertDialogTitle>
          {cur.description ? <AlertDialogDescription>{cur.description}</AlertDialogDescription> : null}
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => settle(cur, false)}>{cur.cancelLabel ?? "Cancelar"}</AlertDialogCancel>
            <AlertDialogAction destructive={cur.destructive} onClick={() => settle(cur, true)}>
              {cur.confirmLabel ?? "Seguir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      ) : null}
    </AlertDialog>
  );
}
