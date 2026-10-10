"use server";

import { AuthError, CredentialsSignin } from "next-auth";
import { rateLimitPersistent } from "@/lib/rate-limit-db";
import { headers } from "next/headers";

import { signIn, signOut } from "@/auth";
import { Prisma } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api";
import { acceptTerms, findInvitation, resetPassword, resetSchema } from "@/lib/auth/access";
import { auditContext } from "@/lib/security/audit";
import { createUser, registerSchema, registrationOpen } from "@/lib/auth/users";
import { prisma } from "@/lib/prisma";
import { clientIp, LIMITS } from "@/lib/rate-limit";

export interface FormState {
  error?: string;
  /** La cuenta tiene 2FA: el formulario debe pedir el código. */
  needCode?: boolean;
}

/** Solo rutas internas como destino tras el login (evita open redirects). */
function safeCallback(value: FormDataEntryValue | null): string {
  const v = typeof value === "string" ? value : "";
  return v.startsWith("/") && !v.startsWith("//") ? v : "/";
}

const TOO_MANY = "Demasiados intentos. Espera unos minutos y vuelve a probar.";
const SUSPENDED = "Esta cuenta está suspendida. Habla con la administración de Atlenza.";

export async function loginAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    await signIn("credentials", {
      email: form.get("email"),
      password: form.get("password"),
      code: form.get("code") || undefined,
      redirectTo: safeCallback(form.get("callbackUrl")),
    });
    return {};
  } catch (err) {
    if (err instanceof CredentialsSignin && err.code === "rate_limited") return { error: TOO_MANY };
    if (err instanceof CredentialsSignin && err.code === "suspended") return { error: SUSPENDED };
    if (err instanceof CredentialsSignin && err.code === "totp_required") return { needCode: true };
    if (err instanceof CredentialsSignin && err.code === "totp_invalid") {
      return { needCode: true, error: "Código incorrecto o ya usado. Espera al siguiente código de la app." };
    }
    if (err instanceof AuthError) return { error: "Email o contraseña incorrectos" };
    throw err; // NEXT_REDIRECT debe propagarse
  }
}

/** v1.7 · Entrar con una llave de acceso (la firma ya la hizo el navegador). */
export async function passkeyLoginAction(challengeId: string, response: string, callbackUrl: string): Promise<FormState> {
  try {
    await signIn("passkey", { challengeId, response, redirectTo: safeCallback(callbackUrl) });
    return {};
  } catch (err) {
    if (err instanceof CredentialsSignin && err.code === "rate_limited") return { error: TOO_MANY };
    if (err instanceof CredentialsSignin && err.code === "suspended") return { error: SUSPENDED };
    if (err instanceof AuthError) return { error: "No se reconoce esa llave de acceso en esta cuenta o en este sitio." };
    throw err;
  }
}

export async function registerAction(_prev: FormState, form: FormData): Promise<FormState> {
  const ip = clientIp(await headers());
  if (!(await rateLimitPersistent(`register:${ip}`, LIMITS.register.limit, LIMITS.register.windowMs)).ok) return { error: TOO_MANY };

  const parsed = registerSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no válidos" };
  // v1.9 · Condiciones de uso y privacidad: hay que aceptarlas para crear la cuenta
  if (form.get("terms") !== "on") return { error: "Para crear la cuenta tienes que aceptar las condiciones de uso y la política de privacidad." };
  // v1.9 · Con el registro cerrado, solo con una invitación válida (y para su email, si la tiene)
  const token = typeof form.get("invite") === "string" ? String(form.get("invite")) : "";
  const invitation = (await registrationOpen()) ? null : await findInvitation(token);
  if (!(await registrationOpen()) && !invitation) return { error: "El registro está cerrado: necesitas una invitación válida del administrador." };
  if (invitation?.email && invitation.email !== parsed.data.email) return { error: "Esta invitación es para otro email." };
  try {
    const user = await createUser(parsed.data, invitation ? { role: invitation.role } : undefined);
    if (invitation) {
      // Se gasta la invitación; si otra persona la usó a la vez, se deshace la cuenta recién creada
      const { count } = await prisma.invitation.updateMany({ where: { id: invitation.id, usedAt: null }, data: { usedAt: new Date(), usedById: user.id } });
      if (!count) {
        await prisma.user.delete({ where: { id: user.id } });
        return { error: "La invitación ya se ha usado." };
      }
    }
    await acceptTerms(user.id);
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

/** v1.9 · Contraseña nueva con el enlace de un solo uso que da la administración (no hay email). */
export async function resetPasswordAction(_prev: FormState & { done?: boolean }, form: FormData): Promise<FormState & { done?: boolean }> {
  const h = await headers();
  if (!(await rateLimitPersistent(`reset:${clientIp(h)}`, LIMITS.register.limit, LIMITS.register.windowMs)).ok) return { error: TOO_MANY };
  if (form.get("password") !== form.get("confirm")) return { error: "Las contraseñas no coinciden" };
  const parsed = resetSchema.safeParse({ token: form.get("token"), password: form.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no válidos" };
  try {
    await resetPassword(parsed.data.token, parsed.data.password, auditContext(h));
  } catch (err) {
    if (err instanceof ApiError) return { error: err.message };
    throw err;
  }
  return { done: true };
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}
