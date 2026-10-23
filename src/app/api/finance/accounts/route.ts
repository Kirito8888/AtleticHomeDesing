import { NextResponse } from "next/server";
import { z } from "zod";

import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { createAccount, listAccounts } from "@/lib/finance/service";

export const GET = route(async () => {
  const user = await requireUser();
  return listAccounts(user.id);
});

const schema = z.object({
  name: z.string().trim().min(1).max(100),
  type: z.enum(["ASSET", "LIABILITY", "INCOME", "EXPENSE", "EQUITY"]),
  institution: z.string().max(100).nullish(),
  /** Saldo actual al dar de alta la cuenta (céntimos). Se registra contra "Saldo inicial". */
  openingBalanceCents: z.number().int().optional(),
});

export const POST = route(async (req) => {
  const user = await requireUser();
  return NextResponse.json(await createAccount(user.id, await parseBody(req, schema)), { status: 201 });
});
