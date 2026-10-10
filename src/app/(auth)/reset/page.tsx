import Link from "next/link";
import { connection } from "next/server";

import { ResetPasswordForm } from "@/components/auth-forms";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { findPasswordReset } from "@/lib/auth/access";

export const metadata = { title: "Nueva contraseña · Atlenza" };

/** v1.9 · Poner una contraseña nueva con el enlace de un solo uso (1 h) que genera la administración. */
export default async function ResetPage({ searchParams }: PageProps<"/reset">) {
  await connection();
  const { token } = await searchParams;
  const t = typeof token === "string" ? token : null;
  const r = await findPasswordReset(t);
  if (r && t) return <ResetPasswordForm token={t} email={r.user.email} />;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Enlace no válido</CardTitle>
        <CardDescription>Ha caducado (dura 1 hora) o ya se ha usado.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm text-muted-foreground">
        <p>Pide otro a la administración. Si tienes un código de recuperación o una llave de acceso, también puedes entrar con ellos.</p>
        <Link href="/login" className="font-medium text-foreground underline underline-offset-4">
          Volver a entrar
        </Link>
      </CardContent>
    </Card>
  );
}
