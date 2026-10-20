import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { rateLimitPersistent } from "@/lib/rate-limit-db";
import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";

import type { UserRole } from "@/generated/prisma/enums";
import { clearIpFailures, deviceCookieName, deviceToken, isKnownDevice, loginGate, recordLoginFailure } from "@/lib/auth/login-guard";
import { verifyLogin } from "@/lib/auth/passkey";
import { cookies } from "next/headers";

import { hashPassword, needsRehash, verifyAgainstDummy, verifyPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/prisma";
import { sendToUser } from "@/lib/push/service";
import { clientIp, LIMITS } from "@/lib/rate-limit";
import { auditContext, recordEvent } from "@/lib/security/audit";
import { authFailureLine, failureLog, type AuthFailReason } from "@/lib/security/auth-log";
import { verifySecondFactor } from "@/lib/security/totp";
import { log } from "@/lib/log";

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
  // Segundo factor (opcional): TOTP de 6 dígitos o código de recuperación.
  code: z.string().trim().max(32).optional(),
});

const passkeySchema = z.object({
  challengeId: z.string().min(1).max(40),
  response: z.string().max(20_000).transform((v, ctx) => {
    try {
      return JSON.parse(v) as AuthenticationResponseJSON;
    } catch {
      ctx.addIssue({ code: "custom", message: "respuesta no válida" });
      return z.NEVER;
    }
  }),
});

/** Demasiados intentos (por IP o cuenta bloqueada). Mismo mensaje en ambos casos para no revelar cuentas. */
class TooManyAttempts extends CredentialsSignin {
  code = "rate_limited";
}
/** Contraseña correcta, falta el código de la app de autenticación. */
class TotpRequired extends CredentialsSignin {
  code = "totp_required";
}
/** Contraseña correcta, código de 2FA incorrecto. */
class TotpInvalid extends CredentialsSignin {
  code = "totp_invalid";
}
/** v1.9 · Cuenta suspendida por la administración (solo se dice a quien ya tiene la contraseña o la llave). */
class AccountSuspended extends CredentialsSignin {
  code = "suspended";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Credenciales → las sesiones deben ser JWT (Auth.js no persiste sesiones de credenciales).
  // 7 días, renovándose con el uso (updateAge por defecto: 24 h).
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60 },
  pages: { signIn: "/login" },
  trustHost: true,
  // Un login fallido no es un error del servidor: authorize() ya escribe una línea con la IP
  // (la que lee fail2ban); aquí se silencia la traza que Auth.js añadiría.
  logger: {
    error(error) {
      if (!(error instanceof CredentialsSignin)) log.error("fallo de autenticación", { err: error });
    },
  },
  providers: [
    Credentials({
      credentials: { email: { type: "email" }, password: { type: "password" }, code: { type: "text" } },
      async authorize(raw, request) {
        const ip = clientIp(request.headers);
        const ctx = auditContext(request.headers);
        const fail = (reason: AuthFailReason, err: CredentialsSignin = new CredentialsSignin()) => {
          failureLog(authFailureLine(ip, reason));
          return err;
        };
        if (!(await rateLimitPersistent(`login:${ip}`, LIMITS.login.limit, LIMITS.login.windowMs)).ok) {
          throw fail("rate_limited", new TooManyAttempts());
        }
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) throw fail("credentials");
        const { email } = parsed.data;

        const user = await prisma.user.findUnique({ where: { email } });
        // Dispositivo ya usado por esta cuenta: no se frena por los fallos de otras IP (ver login-guard.ts)
        const cookieValue = await cookies().then((c) => c.get(deviceCookieName(email))?.value).catch(() => undefined);
        const known = Boolean(user) && isKnownDevice(email, user!.sessionVersion, cookieValue);
        const gate = await loginGate(email, ip, known);
        if (gate.blocked) throw fail("locked", new TooManyAttempts());
        if (gate.delayMs) await new Promise((r) => setTimeout(r, gate.delayMs));

        if (!user?.passwordHash) {
          await verifyAgainstDummy(parsed.data.password); // mismo tiempo exista o no el email
          await recordLoginFailure(email, ip);
          throw fail("credentials");
        }

        if (!(await verifyPassword(parsed.data.password, user.passwordHash))) {
          await recordLoginFailure(email, ip);
          await recordEvent(user.id, "LOGIN_FAILED", ctx, "contraseña incorrecta");
          throw fail("credentials");
        }
        if (user.suspendedAt) throw fail("suspended", new AccountSuspended());

        // Verificación en dos pasos. Pedir el código solo revela que la contraseña es
        // correcta a quien ya la tiene; los códigos erróneos cuentan para el bloqueo.
        if (user.totpEnabledAt) {
          if (!parsed.data.code) throw new TotpRequired();
          const used = await verifySecondFactor(user, parsed.data.code);
          if (!used) {
            await recordLoginFailure(email, ip);
            await recordEvent(user.id, "LOGIN_FAILED", ctx, "código de verificación incorrecto");
            throw fail("totp", new TotpInvalid());
          }
          if (used === "recovery") await recordEvent(user.id, "RECOVERY_CODE_USED", ctx);
        }

        await clearIpFailures(email, ip);
        // Recuerda este navegador para esta cuenta (la cookie no lleva el email ni datos: es una firma)
        await cookies()
          .then((c) =>
            c.set(deviceCookieName(email), deviceToken(email, user.sessionVersion), {
              httpOnly: true,
              sameSite: "lax",
              secure: process.env.AUTH_URL?.startsWith("https://") ?? false,
              path: "/",
              maxAge: 180 * 24 * 3600,
            }),
          )
          .catch(() => undefined);
        // v1.7: hash antiguo (scrypt) → Argon2id, aprovechando que tenemos la contraseña en claro ahora
        if (needsRehash(user.passwordHash)) {
          await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(parsed.data.password) } }).catch(() => undefined);
        }
        await recordEvent(user.id, "LOGIN_SUCCESS", ctx);
        // Aviso de nuevo inicio de sesión a sus dispositivos (sin esperar: no retrasa el login).
        void sendToUser(user.id, {
          title: "Nuevo inicio de sesión en Atlenza",
          body: `Desde ${ctx.ip && ctx.ip !== "unknown" ? `la IP ${ctx.ip}` : "un dispositivo"}. Si no has sido tú, cambia la contraseña.`,
          url: "/settings",
          tag: "login",
        });
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          role: user.role,
          sessionVersion: user.sessionVersion,
        };
      },
    }),
    // v1.7 · Entrar con una llave de acceso (passkey). Cuenta como segundo factor: no pide el código 2FA.
    Credentials({
      id: "passkey",
      credentials: { challengeId: { type: "text" }, response: { type: "text" } },
      async authorize(raw, request) {
        const ip = clientIp(request.headers);
        const ctx = auditContext(request.headers);
        // Contador propio: una firma de llave no se puede adivinar, así que no gasta los intentos de contraseña
        if (!(await rateLimitPersistent(`passkey:${ip}`, LIMITS.login.limit, LIMITS.login.windowMs)).ok) {
          failureLog(authFailureLine(ip, "rate_limited"));
          throw new TooManyAttempts();
        }
        const parsed = passkeySchema.safeParse(raw);
        const userId = parsed.success ? await verifyLogin(parsed.data.challengeId, parsed.data.response, new URL(request.url).origin).catch(() => null) : null;
        if (!userId) {
          failureLog(authFailureLine(ip, "credentials"));
          throw new CredentialsSignin();
        }
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new CredentialsSignin();
        if (user.suspendedAt) throw new AccountSuspended();
        await recordEvent(user.id, "PASSKEY_LOGIN", ctx);
        void sendToUser(user.id, { title: "Nuevo inicio de sesión en Atlenza", body: "Con una llave de acceso. Si no has sido tú, revisa Ajustes → Seguridad.", url: "/settings", tag: "login" });
        return { id: user.id, email: user.email, name: user.name, image: user.image, role: user.role, sessionVersion: user.sessionVersion };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role ?? "ATHLETE";
        token.sv = user.sessionVersion ?? 1;
        return token;
      }
      if (!token.id) return null;
      // Revocación: si la versión de sesión cambió (cambio de contraseña, "cerrar sesión
      // en todos los dispositivos") o el usuario ya no existe, la sesión deja de valer.
      const current = await prisma.user.findUnique({
        where: { id: token.id },
        select: { sessionVersion: true, role: true, email: true, name: true, suspendedAt: true },
      });
      if (!current || current.sessionVersion !== (token.sv ?? 1) || current.suspendedAt) return null;
      token.role = current.role;
      token.email = current.email;
      token.name = current.name;
      return token;
    },
    session({ session, token }) {
      if (token.id) session.user.id = token.id;
      session.user.role = (token.role ?? "ATHLETE") as UserRole;
      return session;
    },
  },
});
