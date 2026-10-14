import "server-only";

import { createHash, randomInt } from "node:crypto";

import { sendTelegram, telegramApi, telegramBotConfigured } from "@/lib/admin/telegram";
import { ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { recordEvent, type AuditContext } from "@/lib/security/audit";

/**
 * v1.10 · Telegram por usuario. Se vincula con un código de un solo uso que la persona envía al bot
 * (`/start CÓDIGO`); `/stop` desvincula. Los mensajes al bot se leen por sondeo (getUpdates): nada
 * entra desde fuera del servidor.
 */
const CODE_MINUTES = 15;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin 0/O, 1/I
export const hashCode = (code: string) => createHash("sha256").update(code.trim().toUpperCase()).digest("hex");

export function newCode(): string {
  return Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
}

let botName: { at: number; username: string | null } | null = null;
/** Nombre del bot (para el enlace t.me), con caché de 1 h. */
export async function botUsername(fetcher: typeof fetch = fetch): Promise<string | null> {
  if (botName && Date.now() - botName.at < 3600_000) return botName.username;
  const me = await telegramApi<{ username?: string }>("getMe", {}, fetcher);
  botName = { at: Date.now(), username: me?.username ?? null };
  return botName.username;
}

export async function telegramStatus(userId: string) {
  const link = await prisma.telegramLink.findUnique({ where: { userId }, select: { enabled: true, linkedAt: true } });
  return { configured: telegramBotConfigured(), linked: Boolean(link), enabled: link?.enabled ?? false, linkedAt: link?.linkedAt ?? null, bot: telegramBotConfigured() ? await botUsername() : null };
}

/** Código nuevo (invalida los anteriores). Solo se devuelve ahora. */
export async function createLinkCode(userId: string) {
  if (!telegramBotConfigured()) throw new ApiError(503, "Telegram no está configurado en este servidor (TELEGRAM_BOT_TOKEN)");
  const code = newCode();
  await prisma.$transaction([
    prisma.telegramLinkCode.deleteMany({ where: { userId } }),
    prisma.telegramLinkCode.create({ data: { userId, codeHash: hashCode(code), expiresAt: new Date(Date.now() + CODE_MINUTES * 60_000) } }),
  ]);
  const bot = await botUsername();
  return { code, expiresInMinutes: CODE_MINUTES, bot, url: bot ? `https://t.me/${bot}?start=${code}` : null };
}

export async function setTelegramEnabled(userId: string, enabled: boolean) {
  const { count } = await prisma.telegramLink.updateMany({ where: { userId }, data: { enabled } });
  if (!count) throw new ApiError(404, "No tienes Telegram vinculado");
}

export async function unlinkTelegram(userId: string, ctx: AuditContext = {}) {
  const link = await prisma.telegramLink.findUnique({ where: { userId } });
  if (!link) return false;
  await prisma.telegramLink.delete({ where: { userId } });
  await recordEvent(userId, "TELEGRAM_UNLINKED", ctx);
  await sendTelegram(link.chatId, "Atlenza: este chat ya no está vinculado a tu cuenta.");
  return true;
}

type Update = { update_id: number; message?: { chat?: { id?: number; type?: string }; text?: string } };

/** Procesa un mensaje al bot. Devuelve la respuesta enviada (para los tests). */
export async function handleUpdate(u: Update, send: (chatId: string, text: string) => Promise<boolean> = sendTelegram): Promise<string | null> {
  const chat = u.message?.chat;
  const text = u.message?.text?.trim() ?? "";
  if (!chat?.id || chat.type !== "private" || !text.startsWith("/")) return null;
  const chatId = String(chat.id);
  const [cmd, arg] = text.split(/\s+/, 2);
  let reply: string;
  if (cmd === "/start" && arg) {
    const row = await prisma.telegramLinkCode.findUnique({ where: { codeHash: hashCode(arg) } });
    if (!row || row.expiresAt < new Date()) reply = "Ese código no vale o ha caducado. Pide otro en Atlenza → Ajustes → Notificaciones.";
    else {
      await prisma.$transaction([
        prisma.telegramLinkCode.deleteMany({ where: { userId: row.userId } }),
        // Un chat solo puede estar en una cuenta: si estaba en otra, pasa a esta
        prisma.telegramLink.deleteMany({ where: { OR: [{ chatId }, { userId: row.userId }] } }),
        prisma.telegramLink.create({ data: { userId: row.userId, chatId } }),
      ]);
      await recordEvent(row.userId, "TELEGRAM_LINKED", {}, "chat vinculado");
      reply = "✅ Listo: recibirás aquí los avisos de Atlenza. Escribe /stop para dejar de recibirlos.";
    }
  } else if (cmd === "/stop") {
    const link = await prisma.telegramLink.findUnique({ where: { chatId } });
    if (link) {
      await prisma.telegramLink.delete({ where: { chatId } });
      await recordEvent(link.userId, "TELEGRAM_UNLINKED", {}, "desde Telegram");
    }
    reply = "Hecho: este chat ya no recibe avisos de Atlenza.";
  } else {
    reply = "Soy el bot de Atlenza. Para vincular tu cuenta, pide un código en Ajustes → Notificaciones y envíame /start CÓDIGO.";
  }
  await send(chatId, reply);
  return reply;
}

const g = globalThis as unknown as { __lifeosTgOffset?: number; __lifeosTgPolling?: boolean };

/** Lee los mensajes nuevos al bot (getUpdates) y los procesa. Lo llama el planificador cada 30 s. */
export async function pollTelegram(fetcher: typeof fetch = fetch): Promise<number> {
  if (!telegramBotConfigured() || g.__lifeosTgPolling) return 0;
  g.__lifeosTgPolling = true;
  try {
    const updates = await telegramApi<Update[]>("getUpdates", { offset: g.__lifeosTgOffset ?? 0, timeout: 0, allowed_updates: ["message"] }, fetcher);
    if (!updates?.length) return 0;
    for (const u of updates) {
      g.__lifeosTgOffset = u.update_id + 1;
      await handleUpdate(u, (c, t) => sendTelegram(c, t, fetcher)).catch((e) => console.error("[telegram] mensaje:", e));
    }
    return updates.length;
  } finally {
    g.__lifeosTgPolling = false;
  }
}
