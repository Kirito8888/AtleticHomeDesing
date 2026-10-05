"use server";

import { AuthError } from "next-auth";

import { signIn, signOut } from "@/auth";
import { createUser, registerSchema } from "@/lib/auth/users";
import { Prisma } from "@/generated/prisma/client";

export interface FormState {
  error?: string;
}

/** Solo rutas internas como destino tras el login (evita open redirects). */
function safeCallback(value: FormDataEntryValue | null): string {
  const v = typeof value === "string" ? value : "";
  return v.startsWith("/") && !v.startsWith("//") ? v : "/";
}

export async function loginAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    await signIn("credentials", {
      email: form.get("email"),
      password: form.get("password"),
      redirectTo: safeCallback(form.get("callbackUrl")),
    });
    return {};
  } catch (err) {
    if (err instanceof AuthError) return { error: "Email o contraseña incorrectos" };
    throw err; // NEXT_REDIRECT debe propagarse
  }
}

export async function registerAction(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = registerSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no válidos" };
  try {
    await createUser(parsed.data);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { error: "Ya existe una cuenta con ese email" };
    }
    throw err;
  }
  await signIn("credentials", { email: parsed.data.email, password: parsed.data.password, redirectTo: "/settings?welcome=1" });
  return {};
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}
