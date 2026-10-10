"use client";

import { startAuthentication } from "@simplewebauthn/browser";
import { KeyRound } from "lucide-react";
import Link from "next/link";
import { useActionState, useState, useTransition } from "react";

import { loginAction, passkeyLoginAction, registerAction, type FormState } from "@/app/(auth)/actions";
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
  const [, startTransition] = useTransition();
  // Envío manual (sin <form action>): React reiniciaría los campos tras cada envío
  // y, en el paso del código 2FA, se perderían el email y la contraseña.
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => action(data));
  };
  const needCode = Boolean(state.needCode);
  const [pk, setPk] = useState<FormState>({});
  const [pkBusy, setPkBusy] = useState(false);
  // v1.7 · Entrar con llave de acceso: reto del servidor → el dispositivo firma → Auth.js comprueba
  async function passkey() {
    setPkBusy(true);
    setPk({});
    try {
      const res = await fetch("/api/passkeys/login-options", { method: "POST" });
      if (!res.ok) throw new Error(res.status === 429 ? "Demasiados intentos. Espera unos minutos." : "No se pudo iniciar");
      const { challengeId, options } = await res.json();
      const response = await startAuthentication({ optionsJSON: options });
      const r = await passkeyLoginAction(challengeId, JSON.stringify(response), callbackUrl ?? "/");
      if (r.error) setPk(r);
    } catch (err) {
      const e = err as Error;
      // NEXT_REDIRECT llega como error: es el login correcto
      if (e.message?.includes("NEXT_REDIRECT")) throw err;
      setPk({ error: e.name === "NotAllowedError" ? "Cancelado o sin llave en este dispositivo." : e.message });
    } finally {
      setPkBusy(false);
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>{needCode ? "Verificación en dos pasos" : "Entrar"}</CardTitle>
        <CardDescription>
          {needCode ? "Escribe el código de 6 dígitos de tu app de autenticación o un código de recuperación." : "Accede a tu panel de rendimiento."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-4">
          <input type="hidden" name="callbackUrl" value={callbackUrl ?? "/"} />
          <div className={needCode ? "hidden" : "grid gap-2"}>
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className={needCode ? "hidden" : "grid gap-2"}>
            <Label htmlFor="password">Contraseña</Label>
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
          {needCode ? (
            <div className="grid gap-2">
              <Label htmlFor="code">Código</Label>
              <Input
                id="code"
                name="code"
                inputMode="text"
                autoComplete="one-time-code"
                autoFocus
                required
                maxLength={20}
                placeholder="123456"
                className="text-center text-lg tracking-widest"
              />
            </div>
          ) : null}
          <ErrorText state={state} />
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? "Comprobando…" : needCode ? "Verificar" : "Entrar"}
          </Button>
          {!needCode ? (
            <>
              <Button type="button" variant="outline" size="lg" onClick={passkey} disabled={pkBusy}>
                <KeyRound /> Entrar con llave de acceso
              </Button>
              <ErrorText state={pk} />
            </>
          ) : null}
          <p className="text-center text-xs text-muted-foreground">
            <Link href="/legal/privacidad" className="underline underline-offset-2">
              Privacidad
            </Link>{" "}
            ·{" "}
            <Link href="/legal/aviso" className="underline underline-offset-2">
              Aviso legal
            </Link>
          </p>
          {canRegister && !needCode && (
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
