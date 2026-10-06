import { NextResponse } from "next/server";

import { enforceRateLimit, parseBody, route } from "@/lib/api";
import { createUser, registerSchema } from "@/lib/auth/users";
import { clientIp } from "@/lib/rate-limit";

export const POST = route(async (req) => {
  enforceRateLimit("register", clientIp(req.headers));
  const user = await createUser(await parseBody(req, registerSchema));
  return NextResponse.json(user, { status: 201 });
});
