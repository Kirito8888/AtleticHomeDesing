"use server";

import { AuthError, CredentialsSignin } from "next-auth";
import { headers } from "next/headers";

import { signIn, signOut } from "@/auth";
import { Prisma } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api";
import { createUser, registerSchema } from "@/lib/auth/users";
import { clientIp, LIMITS, rateLimit } from "@/lib/rate-limit";

export interface FormState {
  error?: string;
}

/** Solo rutas internas como destino tras el login (evita open redirects). */
function safeCallback(value: FormDataEntryValue | null): string {
  const v = typeof value === "string" ? value : "";
  return v.startsWith("/") && !v.startsWith("//") ? v : "/";
}

const TOO_MANY = "Demasiados intentos. Espera unos minutos y vuelve a probar.";

export async function loginAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    await signIn("credentials", {
      email: form.get("email"),
      password: form.get("password"),
      redirectTo: safeCallback(form.get("callbackUrl")),
    });
    return {};
  } catch (err) {
    if (err instanceof CredentialsSignin && err.code === "rate_limited") return { error: TOO_MANY };
    if (err instanceof AuthError) return { error: "Email o contraseña incorrectos" };
    throw err; // NEXT_REDIRECT debe propagarse
  }
}

export async function registerAction(_prev: FormState, form: FormData): Promise<FormState> {
  const ip = clientIp(await headers());
  if (!rateLimit(`register:${ip}`, LIMITS.register.limit, LIMITS.register.windowMs).ok) return { error: TOO_MANY };

  const parsed = registerSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no válidos" };
  try {
    await createUser(parsed.data);
  } catch (err) {
    if (err instanceof ApiError) return { error: err.message };
    // Mensaje neutro: no confirmar a un desconocido que ese email tiene cuenta.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { error: "No se pudo crear la cuenta. Si ya tienes una, inicia sesión." };
    }
    throw err;
  }
  await signIn("credentials", { email: parsed.data.email, password: parsed.data.password, redirectTo: "/settings?welcome=1" });
  return {};
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}
