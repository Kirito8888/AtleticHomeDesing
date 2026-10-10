import { connection } from "next/server";

import { LoginForm } from "@/components/auth-forms";
import { registrationOpen } from "@/lib/auth/users";

export const metadata = { title: "Entrar · Atlenza" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  await connection(); // depende de la BD (¿registro abierto?): nunca prerenderizar
  const [{ callbackUrl }, canRegister] = await Promise.all([searchParams, registrationOpen()]);
  return <LoginForm callbackUrl={typeof callbackUrl === "string" ? callbackUrl : undefined} canRegister={canRegister} />;
}
