import { NextResponse } from "next/server";
import { z } from "zod";

import { ApiError, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { isAllowedPushEndpoint } from "@/lib/push/send";
import { pushConfigured, removeSubscription, saveSubscription } from "@/lib/push/service";

// Formato de PushSubscription.toJSON() del navegador. Solo servicios de push reales
// (Google, Mozilla, Apple, Microsoft): el servidor enviará peticiones a ese endpoint.
const subscriptionSchema = z.object({
  endpoint: z.string().max(1000).refine(isAllowedPushEndpoint, "Servicio de notificaciones no reconocido"),
  keys: z.object({ p256dh: z.string().min(40).max(200), auth: z.string().min(16).max(50) }),
});

export const POST = route(async (req) => {
  const user = await requireUser();
  if (!pushConfigured()) throw new ApiError(503, "Las notificaciones no están configuradas en el servidor (faltan las claves VAPID)");
  const sub = await parseBody(req, subscriptionSchema);
  return NextResponse.json(await saveSubscription(user.id, sub, req.headers.get("user-agent") ?? undefined), { status: 201 });
});

export const DELETE = route(async (req) => {
  const user = await requireUser();
  const { endpoint } = await parseBody(req, z.object({ endpoint: z.string().max(1000) }));
  return { removed: await removeSubscription(user.id, endpoint) };
});
