import { NextResponse } from "next/server";

import { parseBody, route } from "@/lib/api";
import { createInvitation, invitationSchema, listInvitations } from "@/lib/auth/access";
import { requireAdmin } from "@/lib/auth/admin";
import { auditContext } from "@/lib/security/audit";

/** v1.9 · Invitaciones pendientes (sin el token: solo se muestra al crearla). */
export const GET = route(async () => {
  await requireAdmin();
  return listInvitations();
});

/** Crea una invitación de un solo uso y devuelve su enlace (una única vez). */
export const POST = route(async (req) => {
  const admin = await requireAdmin();
  return NextResponse.json(await createInvitation(admin.id, await parseBody(req, invitationSchema), auditContext(req.headers)), { status: 201 });
});
