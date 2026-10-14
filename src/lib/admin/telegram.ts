import "server-only";

import { env } from "@/lib/env";

/** Hay bot (v1.10: para los usuarios que lo vinculen). */
export const telegramBotConfigured = () => Boolean(env().TELEGRAM_BOT_TOKEN);
/** Hay bot y chat de la administración (avisos de la vigilancia interna, v1.9). */
export const telegramConfigured = () => Boolean(env().TELEGRAM_BOT_TOKEN && env().TELEGRAM_ADMIN_CHAT_ID);

const apiBase = () => env().TELEGRAM_API_URL.replace(/\/$/, "");
const scrub = (msg: string) => {
  const token = env().TELEGRAM_BOT_TOKEN;
  return token ? msg.split(token).join("•••") : msg;
};

/** Llamada a la API del bot. Nunca lanza ni escribe el token en los logs; null si falla. */
export async function telegramApi<T = unknown>(method: string, body: Record<string, unknown>, fetcher: typeof fetch = fetch, timeoutMs = 10_000): Promise<T | null> {
  const token = env().TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  try {
    const r = await fetcher(`${apiBase()}/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!r.ok) {
      console.warn(`[telegram] ${method}: respuesta ${r.status}`);
      return null;
    }
    const j = (await r.json()) as { ok?: boolean; result?: T };
    return j.ok ? (j.result ?? null) : null;
  } catch (e) {
    console.warn(`[telegram] ${method}:`, scrub(e instanceof Error ? e.message : String(e)));
    return null;
  }
}

/** v1.10 · Mensaje a un chat concreto. Devuelve si se envió. */
export async function sendTelegram(chatId: string, text: string, fetcher: typeof fetch = fetch): Promise<boolean> {
  return (await telegramApi("sendMessage", { chat_id: chatId, text: text.slice(0, 4000), disable_web_page_preview: true }, fetcher)) != null;
}

/** v1.9 · Mensaje a la administración por Telegram (si está configurado). */
export async function sendAdminTelegram(text: string, fetcher: typeof fetch = fetch): Promise<boolean> {
  const chat = env().TELEGRAM_ADMIN_CHAT_ID;
  if (!chat || !env().TELEGRAM_BOT_TOKEN) return false;
  return sendTelegram(chat, text, fetcher);
}
