import "server-only";
import { z } from "zod";

import { ApiError } from "@/lib/api";
import { hashPassword, MIN_PASSWORD_LENGTH } from "@/lib/auth/password";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

export const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Mínimo ${MIN_PASSWORD_LENGTH} caracteres`)
  .max(200);

export const registerSchema = z.object({
  name: z.string().trim().min(1, "Indica tu nombre").max(100),
  email: z.string().trim().toLowerCase().email("Email no válido"),
  password: passwordSchema,
  role: z.enum(["ATHLETE", "COACH"]).default("ATHLETE"),
});

/**
 * ¿Se aceptan cuentas nuevas? Solo con ALLOW_REGISTRATION=true, salvo en una
 * instalación vacía: el primer usuario siempre puede registrarse.
 */
export async function registrationOpen(): Promise<boolean> {
  if (env().ALLOW_REGISTRATION) return true;
  return (await prisma.user.count()) === 0;
}

/** v1.9 · Con una invitación válida (ya comprobada) se crea aunque el registro esté cerrado, con su rol. */
export async function createUser(data: z.infer<typeof registerSchema>, invited?: { role: "ATHLETE" | "COACH" | "ADMIN" }) {
  if (!invited && !(await registrationOpen())) throw new ApiError(403, "El registro de cuentas nuevas está cerrado");
  return prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      role: invited?.role ?? data.role,
      passwordHash: await hashPassword(data.password),
      // Todo usuario puede entrenar: el perfil se crea siempre (un coach también puede ser atleta).
      athleteProfile: { create: {} },
    },
    select: { id: true, email: true, name: true, role: true },
  });
}
