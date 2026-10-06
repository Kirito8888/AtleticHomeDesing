import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";

import type { UserRole } from "@/generated/prisma/enums";
import { verifyAgainstDummy, verifyPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/prisma";
import { clientIp, LIMITS, rateLimit } from "@/lib/rate-limit";
import { authFailureLine, type AuthFailReason } from "@/lib/security/auth-log";

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
});

/** Intentos fallidos seguidos antes de bloquear la cuenta. */
export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;

/** Demasiados intentos (por IP o cuenta bloqueada). Mismo mensaje en ambos casos para no revelar cuentas. */
class TooManyAttempts extends CredentialsSignin {
  code = "rate_limited";
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
      credentials: { email: { type: "email" }, password: { type: "password" } },
      async authorize(raw, request) {
        const ip = clientIp(request.headers);
        const fail = (reason: AuthFailReason, err: CredentialsSignin = new CredentialsSignin()) => {
          console.warn(authFailureLine(ip, reason));
          return err;
        };
        if (!rateLimit(`login:${ip}`, LIMITS.login.limit, LIMITS.login.windowMs).ok) {
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
          const failed = user.failedLogins + 1;
          const lock = failed >= MAX_FAILED_LOGINS;
          await prisma.user.update({
            where: { id: user.id },
            data: lock
              ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) }
              : { failedLogins: failed },
          });
          throw lock ? fail("locked", new TooManyAttempts()) : fail("credentials");
        }

        if (user.failedLogins || user.lockedUntil) {
          await prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });
        }
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
        select: { sessionVersion: true, role: true, email: true, name: true },
      });
      if (!current || current.sessionVersion !== (token.sv ?? 1)) return null;
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
