"use client";

import Link from "next/link";
import { useActionState } from "react";

import { loginAction, registerAction, type FormState } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/constants";

function ErrorText({ state }: { state: FormState }) {
  return state.error ? (
    <p role="alert" className="text-sm text-destructive">
      {state.error}
    </p>
  ) : null;
}

export function LoginForm({ callbackUrl, canRegister = false }: { callbackUrl?: string; canRegister?: boolean }) {
  const [state, action, pending] = useActionState(loginAction, {});
  return (
    <Card>
      <CardHeader>
        <CardTitle>Entrar</CardTitle>
        <CardDescription>Accede a tu panel de rendimiento.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid gap-4">
          <input type="hidden" name="callbackUrl" value={callbackUrl ?? "/"} />
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">Contraseña</Label>
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
          <ErrorText state={state} />
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? "Entrando…" : "Entrar"}
          </Button>
          {canRegister && (
            <p className="text-center text-sm text-muted-foreground">
              ¿Sin cuenta?{" "}
              <Link href="/register" className="font-medium text-foreground underline underline-offset-4">
                Regístrate
              </Link>
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

export function RegisterForm() {
  const [state, action, pending] = useActionState(registerAction, {});
  return (
    <Card>
      <CardHeader>
        <CardTitle>Crear cuenta</CardTitle>
        <CardDescription>Atleta o entrenador.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Nombre</Label>
            <Input id="name" name="name" autoComplete="name" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">Contraseña</Label>
            <Input id="password" name="password" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required />
            <p className="text-xs text-muted-foreground">Mínimo {MIN_PASSWORD_LENGTH} caracteres.</p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="role">Soy</Label>
            <Select id="role" name="role" defaultValue="ATHLETE">
              <option value="ATHLETE">Atleta</option>
              <option value="COACH">Entrenador</option>
            </Select>
          </div>
          <ErrorText state={state} />
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? "Creando…" : "Crear cuenta"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            ¿Ya tienes cuenta?{" "}
            <Link href="/login" className="font-medium text-foreground underline underline-offset-4">
              Entra
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
