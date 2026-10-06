import { z } from "zod";

import { setAiConsent } from "@/lib/account/service";
import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { auditContext } from "@/lib/security/audit";
import { prisma } from "@/lib/prisma";

export const GET = route(async () => {
  const user = await requireUser();
  const { aiConsentAt } = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { aiConsentAt: true } });
  return { enabled: aiConsentAt != null, aiConsentAt };
});

export const PUT = route(async (req) => {
  const user = await requireUser();
  const { enabled } = await parseBody(req, z.object({ enabled: z.boolean() }));
  return setAiConsent(user.id, enabled, auditContext(req.headers));
});
