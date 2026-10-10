import { z } from "zod";

import { parseBody, route } from "@/lib/api";
import { issuePasswordReset, reactivateUser, suspendUser } from "@/lib/auth/access";
import { requireAdmin } from "@/lib/auth/admin";
import { auditContext } from "@/lib/security/audit";
import { sendTelegram } from "@/lib/admin/telegram";
import { prisma } from "@/lib/prisma";

const schema = z.object({ action: z.enum(["suspend", "reactivate", "reset-password", "reset-password-telegram"]) });

/** v1.9 · Suspender, reactivar o generar un enlace de contraseña nueva (1 h, un solo uso). */
export const POST = route(async (req, ctx: RouteContext<"/api/admin/users/[id]">) => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const { action } = await parseBody(req, schema);
  const audit = auditContext(req.headers);
  if (action === "suspend") await suspendUser(admin.id, id, audit);
  else if (action === "reactivate") await reactivateUser(admin.id, id, audit);
  else if (action === "reset-password") return issuePasswordReset(admin.id, id, audit);
  else {
    // v1.10 · El enlace va directo al Telegram vinculado de esa cuenta (además se muestra aquí)
    const r = await issuePasswordReset(admin.id, id, audit);
    const link = await prisma.telegramLink.findUnique({ where: { userId: id }, select: { chatId: true } });
    const sentTelegram = link ? await sendTelegram(link.chatId, `Atlenza: enlace para poner una contraseña nueva (1 hora, un solo uso):\n${r.url}`) : false;
    return { ...r, sentTelegram };
  }
  return { ok: true };
});
