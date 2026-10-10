"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/client-api";

/** La clave VAPID llega en base64url; pushManager.subscribe la quiere en bytes. */
function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const b64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type Support = "checking" | "unsupported" | "denied" | "ready";

export function PushSettings({ configured, publicKey, devices }: { configured: boolean; publicKey: string | null; devices: number }) {
  const [support, setSupport] = useState<Support>("checking");
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setSupport("unsupported");
      if (Notification.permission === "denied") return setSupport("denied");
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setSubscribed(Boolean(sub));
      setSupport(reg ? "ready" : "unsupported");
    })();
  }, []);

  if (!configured || !publicKey) {
    return <p className="text-sm text-muted-foreground">El servidor no tiene claves VAPID configuradas: las notificaciones están desactivadas.</p>;
  }

  async function enable() {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setSupport(permission === "denied" ? "denied" : "ready");
        return toast.error("Sin permiso para notificaciones");
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey!) });
      await api("/api/push/subscription", { body: sub.toJSON() });
      setSubscribed(true);
      toast.success("Notificaciones activadas en este dispositivo");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await api("/api/push/subscription", { method: "DELETE", body: { endpoint: sub.endpoint } });
        await sub.unsubscribe();
      }
      setSubscribed(false);
      toast.success("Notificaciones desactivadas en este dispositivo");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-3 text-sm">
      <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
        <li>Cada mañana: sesiones planificadas para hoy y suscripciones que se cobran mañana.</li>
        <li>Cuando el informe semanal del coach esté listo.</li>
        <li>Cada nuevo inicio de sesión en tu cuenta (seguridad).</li>
      </ul>
      {support === "unsupported" ? (
        <p className="text-muted-foreground">
          Este navegador no admite notificaciones push. En iPhone (iOS 16.4+) solo funcionan con Atlenza instalada en la pantalla de inicio.
        </p>
      ) : support === "denied" ? (
        <p className="text-muted-foreground">Has bloqueado las notificaciones para este sitio: permítelas en los ajustes del navegador.</p>
      ) : subscribed ? (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" disabled={busy} onClick={() => api("/api/push/test", { method: "POST" }).then(() => toast.success("Enviada"), (e: Error) => toast.error(e.message))}>
            Enviar prueba
          </Button>
          <Button variant="ghost" disabled={busy} onClick={disable}>
            Desactivar aquí
          </Button>
        </div>
      ) : (
        <Button disabled={busy || support === "checking"} onClick={enable}>
          Activar notificaciones en este dispositivo
        </Button>
      )}
      <p className="text-xs text-muted-foreground">Dispositivos con notificaciones: {devices}.</p>
    </div>
  );
}
