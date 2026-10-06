import Link from "next/link";
import { connection } from "next/server";

import { RegisterForm } from "@/components/auth-forms";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { registrationOpen } from "@/lib/auth/users";

export const metadata = { title: "Crear cuenta · LifeOS" };

export default async function RegisterPage() {
  await connection();
  if (await registrationOpen()) return <RegisterForm />;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Registro cerrado</CardTitle>
        <CardDescription>Esta instalación de LifeOS no admite cuentas nuevas.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm text-muted-foreground">
        <p>Pide al administrador que te cree una cuenta.</p>
        <Link href="/login" className="font-medium text-foreground underline underline-offset-4">
          Volver a entrar
        </Link>
      </CardContent>
    </Card>
  );
}
