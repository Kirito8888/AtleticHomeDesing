import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";

import type { UserRole } from "@/generated/prisma/enums";
import { verifyPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/prisma";

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Credenciales → las sesiones deben ser JWT (Auth.js no persiste sesiones de credenciales).
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: "/login" },
  trustHost: true,
  providers: [
    Credentials({
      credentials: { email: { type: "email" }, password: { type: "password" } },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) throw new CredentialsSignin();
        const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
        if (!user?.passwordHash || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
          throw new CredentialsSignin();
        }
        return { id: user.id, email: user.email, name: user.name, image: user.image, role: user.role };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role ?? "ATHLETE";
      }
      return token;
    },
    session({ session, token }) {
      if (token.id) session.user.id = token.id;
      session.user.role = (token.role ?? "ATHLETE") as UserRole;
      return session;
    },
  },
});
