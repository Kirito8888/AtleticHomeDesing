import { z } from "zod";

import { enforceRateLimit, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { auditContext } from "@/lib/security/audit";
import { createLinkCode, setTelegramEnabled, telegramStatus, unlinkTelegram } from "@/lib/telegram/link";

/** v1.10 · Telegram de la cuenta: estado, código para vincular, pausar y desvincular. */
export const GET = route(async () => {
  const user = await requireUser();
  return telegramStatus(user.id);
});

export const POST = route(async () => {
  const user = await requireUser();
  enforceRateLimit("comment", `tg:${user.id}`);
  return createLinkCode(user.id);
});

export const PATCH = route(async (req) => {
  const user = await requireUser();
  const { enabled } = await parseBody(req, z.object({ enabled: z.boolean() }));
  await setTelegramEnabled(user.id, enabled);
  return { enabled };
});

export const DELETE = route(async (req) => {
  const user = await requireUser();
  return { removed: await unlinkTelegram(user.id, auditContext(req.headers)) };
});
