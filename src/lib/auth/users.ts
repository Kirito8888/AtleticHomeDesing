import "server-only";
import { z } from "zod";

import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/prisma";

export const registerSchema = z.object({
  name: z.string().trim().min(1, "Indica tu nombre").max(100),
  email: z.string().trim().toLowerCase().email("Email no válido"),
  password: z.string().min(10, "Mínimo 10 caracteres").max(200),
  role: z.enum(["ATHLETE", "COACH"]).default("ATHLETE"),
});

export async function createUser(data: z.infer<typeof registerSchema>) {
  return prisma.user.create({
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
}
