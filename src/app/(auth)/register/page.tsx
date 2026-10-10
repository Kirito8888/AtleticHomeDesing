import Link from "next/link";
import { connection } from "next/server";

import { RegisterForm } from "@/components/auth-forms";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { findInvitation } from "@/lib/auth/access";
import { registrationOpen } from "@/lib/auth/users";

export const metadata = { title: "Crear cuenta · Atlenza" };

/** Registro: abierto solo en una instalación vacía o con ALLOW_REGISTRATION; si no, con invitación (v1.9). */
export default async function RegisterPage({ searchParams }: PageProps<"/register">) {
  await connection();
  const { invite } = await searchParams;
  const token = typeof invite === "string" ? invite : null;
  if (await registrationOpen()) return <RegisterForm />;
  const inv = await findInvitation(token);
  if (inv && token) return <RegisterForm invite={{ token, email: inv.email, role: inv.role }} />;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{token ? "Invitación no válida" : "Registro cerrado"}</CardTitle>
        <CardDescription>
          {token ? "El enlace ha caducado o ya se ha usado." : "Atlenza solo se puede usar con permiso de su autor."}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm text-muted-foreground">
        <p>Pide una invitación a la administración de esta instalación.</p>
        <Link href="/login" className="font-medium text-foreground underline underline-offset-4">
          Volver a entrar
        </Link>
      </CardContent>
    </Card>
  );
}
