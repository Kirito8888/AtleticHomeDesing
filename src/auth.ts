import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { rateLimitPersistent } from "@/lib/rate-limit-db";
import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";

import type { UserRole } from "@/generated/prisma/enums";
import { verifyLogin } from "@/lib/auth/passkey";
import { hashPassword, needsRehash, verifyAgainstDummy, verifyPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/prisma";
import { sendToUser } from "@/lib/push/service";
import { clientIp, LIMITS } from "@/lib/rate-limit";
import { auditContext, recordEvent } from "@/lib/security/audit";
import { authFailureLine, type AuthFailReason } from "@/lib/security/auth-log";
import { verifySecondFactor } from "@/lib/security/totp";

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

/** Intentos fallidos seguidos antes de bloquear la cuenta. */
export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;

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

/** Suma un fallo a la cuenta; al llegar a MAX_FAILED_LOGINS la bloquea. Devuelve si quedó bloqueada. */
async function registerFailure(user: { id: string; failedLogins: number }): Promise<boolean> {
  const failed = user.failedLogins + 1;
  const lock = failed >= MAX_FAILED_LOGINS;
  await prisma.user.update({
    where: { id: user.id },
    data: lock ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) } : { failedLogins: failed },
  });
  return lock;
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
      if (!(error instanceof CredentialsSignin)) console.error("[auth]", error);
    },
  },
  providers: [
    Credentials({
      credentials: { email: { type: "email" }, password: { type: "password" }, code: { type: "text" } },
      async authorize(raw, request) {
        const ip = clientIp(request.headers);
        const ctx = auditContext(request.headers);
        const fail = (reason: AuthFailReason, err: CredentialsSignin = new CredentialsSignin()) => {
          console.warn(authFailureLine(ip, reason));
          return err;
        };
        if (!(await rateLimitPersistent(`login:${ip}`, LIMITS.login.limit, LIMITS.login.windowMs)).ok) {
          throw fail("rate_limited", new TooManyAttempts());
        }
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) throw fail("credentials");

        const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
        if (!user?.passwordHash) {
          await verifyAgainstDummy(parsed.data.password); // mismo tiempo exista o no el email
          throw fail("credentials");
        }
        if (user.lockedUntil && user.lockedUntil > new Date()) throw fail("locked", new TooManyAttempts());

        if (!(await verifyPassword(parsed.data.password, user.passwordHash))) {
          const locked = await registerFailure(user);
          await recordEvent(user.id, locked ? "ACCOUNT_LOCKED" : "LOGIN_FAILED", ctx, "contraseña incorrecta");
          throw locked ? fail("locked", new TooManyAttempts()) : fail("credentials");
        }
        if (user.suspendedAt) throw fail("suspended", new AccountSuspended());

        // Verificación en dos pasos. Pedir el código solo revela que la contraseña es
        // correcta a quien ya la tiene; los códigos erróneos cuentan para el bloqueo.
        if (user.totpEnabledAt) {
          if (!parsed.data.code) throw new TotpRequired();
          const used = await verifySecondFactor(user, parsed.data.code);
          if (!used) {
            const locked = await registerFailure(user);
            await recordEvent(user.id, locked ? "ACCOUNT_LOCKED" : "LOGIN_FAILED", ctx, "código de verificación incorrecto");
            throw locked ? fail("locked", new TooManyAttempts()) : fail("totp", new TotpInvalid());
          }
          if (used === "recovery") await recordEvent(user.id, "RECOVERY_CODE_USED", ctx);
        }

        if (user.failedLogins || user.lockedUntil) {
          await prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });
        }
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
          console.warn(authFailureLine(ip, "rate_limited"));
          throw new TooManyAttempts();
        }
        const parsed = passkeySchema.safeParse(raw);
        const userId = parsed.success ? await verifyLogin(parsed.data.challengeId, parsed.data.response, new URL(request.url).origin).catch(() => null) : null;
        if (!userId) {
          console.warn(authFailureLine(ip, "credentials"));
          throw new CredentialsSignin();
        }
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new CredentialsSignin();
        if (user.lockedUntil && user.lockedUntil > new Date()) throw new TooManyAttempts();
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
