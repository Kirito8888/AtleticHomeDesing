import type { DefaultSession } from "next-auth";

import type { UserRole } from "@/generated/prisma/enums";

declare module "next-auth" {
  interface Session {
    user: { id: string; role: UserRole } & DefaultSession["user"];
  }
  interface User {
    role?: UserRole;
    sessionVersion?: number;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id?: string;
    role?: UserRole;
    /** Versión de sesión del usuario al iniciar sesión (revocación). */
    sv?: number;
  }
}
