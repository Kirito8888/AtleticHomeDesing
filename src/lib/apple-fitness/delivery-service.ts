import "server-only";

import { ZodError } from "zod";

import { ApiError } from "@/lib/api";
import type { Prisma } from "@/generated/prisma/client";
import { log } from "@/lib/log";
import { prisma } from "@/lib/prisma";

import { appleTokenStatus } from "./token-service";

/**
 * v3.1 · Bloque C · Diagnóstico de conexión del Atajo: último envío real y última prueba por vía.
 * Los resúmenes llevan SOLO recuentos y nombres de campo (nunca valores de salud ni mensajes con texto recibido).
 */
export type Channel = "FITNESS" | "HEALTH";
export type DeliveryKind = "last" | "test";
export interface DeliverySummary {
  counts?: Record<string, number>;
  /** Campos rechazados (rutas del esquema, sin índices ni valores). */
  fields?: string[];
  /** Texto fijo del servidor («second_factor», «rate_limit», «prueba incoherente»…). */
  reason?: string;
}

/** Campos del esquema que fallaron: solo rutas, con los índices como «[]», únicas y acotadas. */
export function failedFields(err: ZodError): string[] {
  const out = new Set<string>();
  const walk = (issues: readonly { path: PropertyKey[]; errors?: unknown }[]) => {
    for (const i of issues) {
      const p = i.path.map((x) => (typeof x === "number" ? "[]" : String(x))).join(".").replace(/\.\[\]/g, "[]");
      if (p) out.add(p.slice(0, 40));
      if (Array.isArray(i.errors)) for (const e of i.errors) if (Array.isArray(e)) walk(e);
    }
  };
  walk(err.issues as never);
  return [...out].slice(0, 8);
}

export async function recordDelivery(userId: string, channel: Channel, kind: DeliveryKind, status: number, summary: DeliverySummary) {
  try {
    const at = new Date();
    const data = kind === "last" ? { lastAt: at, lastStatus: status, lastSummary: summary as Prisma.InputJsonValue } : { testAt: at, testStatus: status, testSummary: summary as Prisma.InputJsonValue };
    await prisma.appleDelivery.upsert({ where: { userId_channel: { userId, channel } }, create: { userId, channel, ...data }, update: data });
  } catch (e) {
    // El diagnóstico nunca rompe el envío
    log.warn("apple-delivery: no se pudo anotar", { kind: "apple-delivery", err: e });
  }
}

/** Anota un fallo (400 con los campos, 403/429/otros con motivo fijo). No relanza: lo hace quien llama. */
export async function recordFailure(userId: string, channel: Channel, kind: DeliveryKind, err: unknown) {
  if (err instanceof ZodError) return recordDelivery(userId, channel, kind, 400, { fields: failedFields(err) });
  if (err instanceof ApiError) {
    const code = (err.details as { code?: string } | undefined)?.code;
    return recordDelivery(userId, channel, kind, err.status, { reason: code ?? (err.status === 429 ? "rate_limit" : err.status === 400 ? "json" : `http_${err.status}`) });
  }
  return recordDelivery(userId, channel, kind, 500, { reason: "error_interno" });
}

export interface DeliveryView {
  lastAt: string | null;
  lastStatus: number | null;
  lastSummary: DeliverySummary | null;
  testAt: string | null;
  testStatus: number | null;
  testSummary: DeliverySummary | null;
}
const EMPTY: DeliveryView = { lastAt: null, lastStatus: null, lastSummary: null, testAt: null, testStatus: null, testSummary: null };

/** Estado de las dos vías de la usuaria (solo las suyas). */
export async function deliveryStatus(userId: string): Promise<Record<Channel, DeliveryView>> {
  const rows = await prisma.appleDelivery.findMany({ where: { userId } });
  const view = (c: Channel): DeliveryView => {
    const r = rows.find((x) => x.channel === c);
    return r
      ? {
          lastAt: r.lastAt?.toISOString() ?? null,
          lastStatus: r.lastStatus,
          lastSummary: (r.lastSummary as DeliverySummary | null) ?? null,
          testAt: r.testAt?.toISOString() ?? null,
          testStatus: r.testStatus,
          testSummary: (r.testSummary as DeliverySummary | null) ?? null,
        }
      : EMPTY;
  };
  return { FITNESS: view("FITNESS"), HEALTH: view("HEALTH") };
}

export const EMPTY_DELIVERIES: Record<Channel, DeliveryView> = { FITNESS: EMPTY, HEALTH: EMPTY };

/** Estado del token + diagnóstico de las dos vías (Ajustes → Apple Fitness). */
export async function appleConnectionState(userId: string) {
  return { ...(await appleTokenStatus(userId)), deliveries: await deliveryStatus(userId) };
}
