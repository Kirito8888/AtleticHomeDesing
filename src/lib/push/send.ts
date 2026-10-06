// Envío Web Push (RFC 8030/8291/8292) con la librería web-push. Sin BD: se
// prueba de forma aislada descifrando el mensaje como lo haría el navegador.
import webpush from "web-push";

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushMessage {
  title: string;
  body: string;
  /** Ruta interna que se abre al tocar la notificación. */
  url?: string;
  /** Misma etiqueta = la nueva sustituye a la anterior en el móvil. */
  tag?: string;
}

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
  subject: string;
}

const options = (vapid: VapidKeys) => ({
  vapidDetails: vapid,
  TTL: 24 * 3600, // si el móvil está apagado, el servicio de push lo guarda un día
  contentEncoding: "aes128gcm" as const,
});

const toSubscription = (t: PushTarget) => ({ endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } });

/** Petición cifrada que se enviaría (para tests y diagnóstico). */
export function buildPushRequest(target: PushTarget, msg: PushMessage, vapid: VapidKeys) {
  return webpush.generateRequestDetails(toSubscription(target), JSON.stringify(msg), options(vapid));
}

export type SendResult = { ok: true } | { ok: false; gone: boolean; status?: number };

/** Envía una notificación. gone = la suscripción ya no existe (404/410) y debe borrarse. */
export async function sendPush(target: PushTarget, msg: PushMessage, vapid: VapidKeys): Promise<SendResult> {
  try {
    await webpush.sendNotification(toSubscription(target), JSON.stringify(msg), options(vapid));
    return { ok: true };
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    return { ok: false, gone: status === 404 || status === 410, status };
  }
}

export const generateVapidKeys = () => webpush.generateVAPIDKeys();
