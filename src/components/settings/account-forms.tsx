"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Field } from "@/components/form/chips";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/constants";
import { api } from "@/lib/client-api";

const str = (f: FormData, k: string) => String(f.get(k) ?? "");

/**
 * Tras invalidar la sesión (sessionVersion++ o cuenta borrada) el servidor ya no
 * la acepta: una server action de signOut la interceptaría el proxy. Basta con
 * navegar al login con recarga completa, que además vacía la caché del router
 * con páginas privadas (router.push la conservaría).
 */
// eslint-disable-next-line @next/next/no-location-assign-relative-destination -- recarga completa intencionada
const backToLogin = () => window.location.assign("/login");

/** Ejecuta una operación de cuenta; si invalida las sesiones, vuelve al login. */
function useAccountAction() {
  const [busy, setBusy] = useState(false);
  return {
    busy,
    run: async (url: string, method: string, body: unknown, ok: string) => {
      setBusy(true);
      try {
        const res = await api<{ signedOut?: boolean }>(url, { method, body });
        toast.success(ok);
        if (res.signedOut) backToLogin();
        return true;
      } catch (e) {
        toast.error((e as Error).message);
        return false;
      } finally {
        setBusy(false);
      }
    },
  };
}

export function ChangePasswordForm() {
  const { busy, run } = useAccountAction();
  return (
    <form
      className="grid gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        if (str(f, "newPassword") !== str(f, "confirmPassword")) {
          toast.error("Las contraseñas nuevas no coinciden");
          return;
        }
        await run(
          "/api/account/password",
          "POST",
          { currentPassword: str(f, "currentPassword"), newPassword: str(f, "newPassword") },
          "Contraseña cambiada. Vuelve a entrar.",
        );
      }}
    >
      <Field label="Contraseña actual" htmlFor="pw-current">
        <Input id="pw-current" name="currentPassword" type="password" autoComplete="current-password" required />
      </Field>
      <Field label="Nueva contraseña" htmlFor="pw-new" hint={`Mínimo ${MIN_PASSWORD_LENGTH} caracteres.`}>
        <Input id="pw-new" name="newPassword" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required />
      </Field>
      <Field label="Repite la nueva contraseña" htmlFor="pw-confirm">
        <Input id="pw-confirm" name="confirmPassword" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required />
      </Field>
      <Button type="submit" disabled={busy}>
        Cambiar contraseña
      </Button>
    </form>
  );
}

export function ChangeEmailForm({ email }: { email: string }) {
  const { busy, run } = useAccountAction();
  return (
    <form
      className="grid gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        await run(
          "/api/account/email",
          "POST",
          { email: str(f, "email"), currentPassword: str(f, "currentPassword") },
          "Email cambiado. Entra con el nuevo.",
        );
      }}
    >
      <Field label="Nuevo email" htmlFor="email-new">
        <Input id="email-new" name="email" type="email" autoComplete="email" defaultValue={email} required />
      </Field>
      <Field label="Contraseña actual" htmlFor="email-pw">
        <Input id="email-pw" name="currentPassword" type="password" autoComplete="current-password" required />
      </Field>
      <Button type="submit" variant="outline" disabled={busy}>
        Cambiar email
      </Button>
    </form>
  );
}

export function SignOutEverywhere() {
  const { busy, run } = useAccountAction();
  return (
    <Button
      variant="outline"
      disabled={busy}
      onClick={() => {
        if (confirm("¿Cerrar la sesión en todos tus dispositivos, incluido este?")) {
          void run("/api/account/sessions", "DELETE", undefined, "Sesiones cerradas");
        }
      }}
    >
      Cerrar sesión en todos los dispositivos
    </Button>
  );
}

export function AiConsentToggle({ initial, configured, provider }: { initial: boolean; configured: boolean; provider: string }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initial);
  const [busy, setBusy] = useState(false);
  return (
    <div className="grid gap-3 text-sm">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="ai-consent" className="font-medium">
          Permitir enviar datos a {provider}
        </label>
        <Switch
          id="ai-consent"
          checked={enabled}
          disabled={busy}
          onCheckedChange={async (value) => {
            setBusy(true);
            try {
              await api("/api/account/ai-consent", { method: "PUT", body: { enabled: value } });
              setEnabled(value);
              toast.success(value ? "Atlenza IA activado" : "Atlenza IA desactivado");
              router.refresh();
            } catch (e) {
              toast.error((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        />
      </div>
      <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
        <li>Apuntes: el texto de los documentos que subas y tus preguntas al tutor.</li>
        <li>Coach semanal: un resumen numérico de tu semana (carga, VFC, sueño, competiciones). Sin nombre ni email.</li>
        <li>Transferencia internacional: un proveedor externo puede tratarlos fuera del Espacio Económico Europeo según sus condiciones. Un modelo local de este servidor no saca nada de él.</li>
        <li>Si cambias de proveedor, este permiso se desactiva y tienes que volver a darlo.</li>
        <li>Nunca se envían datos de salud, finanzas ni nutrición.</li>
      </ul>
      {!configured ? <p className="text-xs text-muted-foreground">Aún no tienes una IA configurada (sección IA, arriba): no funcionará aunque lo actives.</p> : null}
    </div>
  );
}

export function DeleteAccountForm() {
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="grid gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setBusy(true);
        try {
          await api("/api/account", { method: "DELETE", body: { password: str(f, "password"), confirm: str(f, "confirm") } });
          toast.success("Cuenta eliminada");
          backToLogin();
        } catch (err) {
          toast.error((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="text-sm text-muted-foreground">
        Borra para siempre tu cuenta, entrenos, finanzas, nutrición, apuntes y conversaciones. Descarga antes tus datos si los quieres conservar.
      </p>
      <Field label="Contraseña" htmlFor="del-pw">
        <Input id="del-pw" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <Field label='Escribe "ELIMINAR" para confirmar' htmlFor="del-confirm">
        <Input id="del-confirm" name="confirm" autoComplete="off" pattern="ELIMINAR" required />
      </Field>
      <Button type="submit" variant="destructive" disabled={busy}>
        Eliminar mi cuenta
      </Button>
    </form>
  );
}
