import { NextResponse } from "next/server";
import { z } from "zod";

import { parseBody, route } from "@/lib/api";
import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(10, "Mínimo 10 caracteres").max(200),
  role: z.enum(["ATHLETE", "COACH"]).default("ATHLETE"),
});

export const POST = route(async (req) => {
  const data = await parseBody(req, schema);
  const user = await prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      role: data.role,
      passwordHash: await hashPassword(data.password),
      // Todo usuario puede entrenar: el perfil se crea siempre (un coach también puede ser atleta).
      athleteProfile: { create: {} },
    },
    select: { id: true, email: true, name: true, role: true },
  });
  return NextResponse.json(user, { status: 201 });
});
