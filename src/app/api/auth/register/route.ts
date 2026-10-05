import { NextResponse } from "next/server";

import { parseBody, route } from "@/lib/api";
import { createUser, registerSchema } from "@/lib/auth/users";

export const POST = route(async (req) => {
  const user = await createUser(await parseBody(req, registerSchema));
  return NextResponse.json(user, { status: 201 });
});
