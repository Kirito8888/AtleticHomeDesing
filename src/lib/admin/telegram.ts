import "server-only";

import { env } from "@/lib/env";

export const telegramConfigured = () => Boolean(env().TELEGRAM_BOT_TOKEN && env().TELEGRAM_ADMIN_CHAT_ID);

/**
 * v1.9 · Mensaje a la administración por Telegram (si está configurado). Nunca lanza ni escribe el
 * token en los logs: devuelve si se envió.
 */
export async function sendAdminTelegram(text: string, fetcher: typeof fetch = fetch): Promise<boolean> {
  const { TELEGRAM_BOT_TOKEN: token, TELEGRAM_ADMIN_CHAT_ID: chat, TELEGRAM_API_URL: base } = env();
  if (!token || !chat) return false;
  try {
    const r = await fetcher(`${base.replace(/\/$/, "")}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text: text.slice(0, 4000), disable_web_page_preview: true }),
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) console.warn(`[telegram] respuesta ${r.status}`);
    return r.ok;
  } catch (e) {
    console.warn("[telegram] no se pudo enviar:", (e instanceof Error ? e.message : String(e)).split(token).join("•••"));
    return false;
  }
}
