import "server-only";
import { redirect } from "next/navigation";

import { currentSession } from "@/lib/auth/current";
import type { CurrentUser } from "@/lib/auth/session";

/** Para Server Components: usuario actual o redirección a /login. */
export async function pageUser(): Promise<CurrentUser & { name: string | null; email: string | null }> {
  const session = await currentSession();
  if (!session?.user?.id) redirect("/login");
  return { id: session.user.id, role: session.user.role, name: session.user.name ?? null, email: session.user.email ?? null };
}
