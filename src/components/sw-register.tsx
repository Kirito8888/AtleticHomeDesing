"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

/** Registra el service worker solo en producción (en dev interferiría con HMR) y avisa si hay versión nueva. */
export function ServiceWorkerRegister() {
  const [updated, setUpdated] = useState(false);
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    const sw = navigator.serviceWorker;
    // Sin controlador previo es la primera instalación: no es una «versión nueva».
    const hadController = !!sw.controller;
    const onChange = () => {
      if (hadController) setUpdated(true);
    };
    sw.addEventListener("controllerchange", onChange);
    let reg: ServiceWorkerRegistration | undefined;
    sw.register("/sw.js", { scope: "/", updateViaCache: "none" }).then((r) => (reg = r)).catch(() => {});
    const onVisible = () => {
      if (document.visibilityState === "visible") void reg?.update().catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      sw.removeEventListener("controllerchange", onChange);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  if (!updated) return null;
  return (
    <div role="status" className="fixed inset-x-3 bottom-20 z-50 flex items-center justify-between gap-3 rounded-md border bg-background p-3 text-sm shadow-lg md:bottom-4 md:left-auto md:max-w-sm">
      <span>Nueva versión disponible.</span>
      <Button type="button" size="sm" onClick={() => window.location.reload()}>
        Nueva versión, recargar
      </Button>
    </div>
  );
}
