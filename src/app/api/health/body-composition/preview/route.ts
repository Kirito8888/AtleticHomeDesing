import { z } from "zod";

import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { previewBodyComposition } from "@/lib/health/isak-service";

export const POST = route(async (req) => {
  await requireUser();
  return previewBodyComposition(await parseBody(req, z.object({}).passthrough()));
});
