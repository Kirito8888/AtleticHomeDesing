import "server-only";

import { z } from "zod";

import { documentsToReindex } from "@/lib/ai/rag";
import {
  AI_PROVIDERS,
  ANTHROPIC_URL,
  assertSafeBaseUrl,
  buildClient,
  localBaseUrls,
  normalizeUrl,
  providerLabel,
  serverConfig,
  userConfig,
  type AiConfig,
  type AiProvider,
} from "@/lib/ai/provider";
import { ApiError } from "@/lib/api";
import { enqueueIngest } from "@/lib/jobs/queue";
import { prisma } from "@/lib/prisma";
import { recordConsent } from "@/lib/privacy/service";
import { recordEvent, type AuditContext } from "@/lib/security/audit";
import { sealJson } from "@/lib/security/data-key";

/** Modelos por defecto al elegir proveedor (se pueden cambiar). */
export const DEFAULT_MODELS: Record<AiProvider, { model: string; embeddingModel: string | null }> = {
  GEMINI: { model: "gemini-2.5-flash", embeddingModel: "gemini-embedding-001" },
  OPENAI: { model: "gpt-4.1-mini", embeddingModel: "text-embedding-3-small" },
  ANTHROPIC: { model: "claude-sonnet-4-5", embeddingModel: null },
};

const name = z.string().trim().min(1).max(120).regex(/^[\w.:/@+-]+$/, "Nombre de modelo no válido");

export const credentialSchema = z.object({
  provider: z.enum(AI_PROVIDERS),
  baseUrl: z.string().trim().max(300).nullish(),
  model: name,
  embeddingModel: name.nullish().or(z.literal("").transform(() => null)),
  // Vacío = conservar la clave guardada (para cambiar solo el modelo)
  apiKey: z.string().trim().max(400).nullish(),
});
export type CredentialInput = z.infer<typeof credentialSchema>;

/** Lo que ve el usuario: nunca la clave, solo sus últimos 4 caracteres. */
export async function credentialView(userId: string) {
  const c = await prisma.aiCredential.findUnique({
    where: { userId },
    select: { provider: true, baseUrl: true, model: true, embeddingModel: true, keyHint: true, verifiedAt: true, updatedAt: true },
  });
  const server = serverConfig();
  return {
    own: c ? { ...c, provider: c.provider as AiProvider, label: providerLabel(c.provider as AiProvider, c.baseUrl) } : null,
    serverFallback: server ? { label: "Google Gemini (clave del servidor)", model: server.model } : null,
  };
}

/** Prueba real: una respuesta corta y, si hay modelo de embeddings, un vector de 768 dimensiones. */
export async function testConfig(cfg: AiConfig) {
  const client = buildClient(cfg);
  const started = Date.now();
  const r = await client.text({ system: "Responde solo con la palabra OK.", messages: [{ role: "user", text: "Prueba de conexión de Atlenza. Responde OK." }], temperature: 0 });
  if (client.embed) await client.embed(["Prueba de conexión de Atlenza"], "RETRIEVAL_QUERY");
  return { ok: true, ms: Date.now() - started, reply: r.text.trim().slice(0, 40), embeddings: Boolean(client.embed), label: providerLabel(cfg.provider, cfg.baseUrl) };
}

async function reindex(userId: string, tag: string | null) {
  const ids = await documentsToReindex(userId, tag);
  for (const id of ids) await enqueueIngest(id).catch(() => undefined); // si la cola no responde, quedan pendientes hasta volver a guardar
  return ids.length;
}

/**
 * Guarda la IA propia tras probarla. Si cambia el proveedor (o su URL), los datos irían a otro
 * sitio: se retira el consentimiento de IA y hay que volver a darlo. Los apuntes vectorizados con
 * otro modelo se reindexan en segundo plano.
 */
export async function saveCredential(userId: string, input: CredentialInput, ctx: AuditContext = {}) {
  const owner = await prisma.user.findUnique({ where: { id: userId }, select: { demoExpiresAt: true } });
  if (owner?.demoExpiresAt) throw new ApiError(403, "Las cuentas de demostración no pueden configurar una IA propia");
  const prev = await prisma.aiCredential.findUnique({ where: { userId } });
  const prevCfg = prev ? await userConfig(userId) : null;
  let baseUrl: string | null = null;
  if (input.provider === "OPENAI") baseUrl = await assertSafeBaseUrl(input.baseUrl ?? "");
  else if (input.provider === "ANTHROPIC" && input.baseUrl) {
    // Otra URL para Anthropic (pasarela propia) solo si la autoriza la administración
    const u = normalizeUrl(input.baseUrl);
    if (u !== ANTHROPIC_URL && !localBaseUrls().includes(u ?? "")) throw new ApiError(400, "Para Anthropic solo vale su URL oficial o una autorizada por la administración");
    baseUrl = u === ANTHROPIC_URL ? null : u;
  }
  const sameEndpoint = prev && prev.provider === input.provider && (prev.baseUrl ?? null) === baseUrl;
  // Sin clave nueva: se conserva la guardada solo si es el mismo proveedor y la misma URL (no se manda a otro sitio)
  const apiKey = input.apiKey || (sameEndpoint ? (prevCfg?.apiKey ?? null) : null);
  if (!apiKey && input.provider !== "OPENAI") throw new ApiError(400, "Falta la clave de API");
  const cfg: AiConfig = { provider: input.provider, baseUrl, model: input.model, embeddingModel: input.embeddingModel ?? null, apiKey };
  await testConfig(cfg); // si falla, no se guarda nada

  const data = {
    provider: cfg.provider,
    baseUrl,
    model: cfg.model,
    embeddingModel: cfg.embeddingModel,
    keySealed: apiKey ? sealJson({ key: apiKey }) : null,
    keyHint: apiKey ? apiKey.slice(-4) : null,
    verifiedAt: new Date(),
  };
  await prisma.aiCredential.upsert({ where: { userId }, create: { userId, ...data }, update: data });
  const label = providerLabel(cfg.provider, baseUrl);
  await recordEvent(userId, "AI_PROVIDER_CHANGED", ctx, `${label} · ${cfg.model}`);
  let consentReset = false;
  if (!sameEndpoint) consentReset = await resetConsent(userId, ctx, `cambio de proveedor a ${label}`);
  const tag = buildClient(cfg).embedTag;
  return { label, consentReset, reindexing: await reindex(userId, tag) };
}

/** Quitar la IA propia: se usará la del servidor si existe (otro proveedor → se retira el consentimiento). */
export async function deleteCredential(userId: string, ctx: AuditContext = {}) {
  const { count } = await prisma.aiCredential.deleteMany({ where: { userId } });
  if (!count) return { removed: false, consentReset: false, reindexing: 0 };
  await recordEvent(userId, "AI_PROVIDER_CHANGED", ctx, "IA propia eliminada");
  const consentReset = await resetConsent(userId, ctx, "IA propia eliminada");
  const server = serverConfig();
  return { removed: true, consentReset, reindexing: await reindex(userId, server ? buildClient(server, "server").embedTag : null) };
}

async function resetConsent(userId: string, ctx: AuditContext, why: string) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { aiConsentAt: true } });
  if (!u?.aiConsentAt) return false;
  await prisma.user.update({ where: { id: userId }, data: { aiConsentAt: null } });
  await recordConsent(userId, "AI", false, ctx, why);
  return true;
}

/** Vuelve a probar la configuración guardada (botón «Probar conexión»). */
export async function testSaved(userId: string) {
  const cfg = await userConfig(userId);
  if (!cfg) throw new ApiError(404, "No tienes una IA propia configurada");
  const r = await testConfig(cfg);
  await prisma.aiCredential.update({ where: { userId }, data: { verifiedAt: new Date() } });
  return r;
}
