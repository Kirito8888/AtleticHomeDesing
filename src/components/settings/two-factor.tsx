"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Field } from "@/components/form/chips";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client-api";

interface Status {
  enabled: boolean;
  enabledAt: string | null;
  recoveryCodesLeft: number;
  configured: boolean;
}

type Step = { kind: "idle" } | { kind: "scan"; qrDataUrl: string; secret: string } | { kind: "codes"; codes: string[] };

const str = (f: FormData, k: string) => String(f.get(k) ?? "");

function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const download = () => {
    const blob = new Blob([`Códigos de recuperación de Atlenza (cada uno vale una vez)\n\n${codes.join("\n")}\n`], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "lifeos-codigos-recuperacion.txt";
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <div className="grid gap-3">
      <p className="text-sm font-medium">Guarda estos códigos ahora: no se volverán a mostrar.</p>
      <p className="text-xs text-muted-foreground">Si pierdes el móvil, cada código sirve una vez en lugar del de la app.</p>
      <ul aria-label="Códigos de recuperación" className="grid grid-cols-2 gap-1 rounded-md border p-3 font-mono text-sm">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" onClick={download}>
          Descargar .txt
        </Button>
        <Button type="button" onClick={onDone}>
          Ya los he guardado
        </Button>
      </div>
    </div>
  );
}

export function TwoFactorSettings({ initial }: { initial: Status }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const [busy, setBusy] = useState(false);

  async function call<T>(fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(true);
    try {
      return await fn();
    } catch (e) {
      toast.error((e as Error).message);
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  if (!initial.configured && !initial.enabled) {
    return (
      <p className="text-sm text-muted-foreground">
        El servidor no tiene <code>TOTP_ENCRYPTION_KEY</code>: no se puede activar la verificación en dos pasos.
      </p>
    );
  }

  if (step.kind === "codes") {
    return (
      <RecoveryCodes
        codes={step.codes}
        onDone={() => {
          setStep({ kind: "idle" });
          router.refresh();
        }}
      />
    );
  }

  if (step.kind === "scan") {
    return (
      <form
        className="grid gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const code = str(new FormData(e.currentTarget), "code");
          const res = await call(() => api<{ recoveryCodes: string[] }>("/api/account/2fa", { method: "PUT", body: { code } }));
          if (res) {
            toast.success("Verificación en dos pasos activada");
            setStep({ kind: "codes", codes: res.recoveryCodes });
          }
        }}
      >
        <p className="text-sm">Escanea el código con tu app (Google Authenticator, Aegis, 1Password…):</p>
        {/* eslint-disable-next-line @next/next/no-img-element -- data URL generada en el servidor */}
        <img src={step.qrDataUrl} alt="Código QR para la app de autenticación" className="size-48 justify-self-center rounded bg-white p-2" />
        <p className="text-xs text-muted-foreground">
          ¿No puedes escanear? Clave manual: <code className="break-all">{step.secret}</code>
        </p>
        <Field label="Código de 6 dígitos" htmlFor="totp-confirm">
          <Input id="totp-confirm" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" onClick={() => setStep({ kind: "idle" })}>
            Cancelar
          </Button>
          <Button type="submit" disabled={busy}>
            Activar
          </Button>
        </div>
      </form>
    );
  }

  if (!initial.enabled) {
    return (
      <form
        className="grid gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const password = str(new FormData(e.currentTarget), "password");
          const res = await call(() => api<{ qrDataUrl: string; secret: string }>("/api/account/2fa", { body: { password } }));
          if (res) setStep({ kind: "scan", qrDataUrl: res.qrDataUrl, secret: res.secret });
        }}
      >
        <p className="text-sm text-muted-foreground">
          Además de la contraseña, al entrar se pedirá un código de tu móvil. Protege tu cuenta aunque alguien conozca tu contraseña.
        </p>
        <Field label="Contraseña actual" htmlFor="totp-pw">
          <Input id="totp-pw" name="password" type="password" autoComplete="current-password" required />
        </Field>
        <Button type="submit" disabled={busy}>
          Configurar verificación en dos pasos
        </Button>
      </form>
    );
  }

  return (
    <div className="grid gap-4">
      <p className="text-sm">
        ✅ Activada{initial.enabledAt ? ` desde el ${new Date(initial.enabledAt).toLocaleDateString("es-ES")}` : ""}. Te quedan{" "}
        <strong>{initial.recoveryCodesLeft}</strong> códigos de recuperación.
      </p>
      <form
        className="grid gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const password = str(new FormData(form), "password");
          const res = await call(() => api<{ recoveryCodes: string[] }>("/api/account/2fa/recovery-codes", { body: { password } }));
          if (res) {
            form.reset();
            setStep({ kind: "codes", codes: res.recoveryCodes });
          }
        }}
      >
        <Field label="Contraseña (para generar códigos nuevos)" htmlFor="rc-pw">
          <Input id="rc-pw" name="password" type="password" autoComplete="current-password" required />
        </Field>
        <Button type="submit" variant="outline" disabled={busy}>
          Generar códigos de recuperación nuevos
        </Button>
      </form>
      <form
        className="grid gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          if (!confirm("¿Desactivar la verificación en dos pasos? Tu cuenta quedará protegida solo por la contraseña.")) return;
          const res = await call(() => api("/api/account/2fa", { method: "DELETE", body: { password: str(f, "password"), code: str(f, "code") } }));
          if (res) {
            toast.success("Verificación en dos pasos desactivada");
            router.refresh();
          }
        }}
      >
        <Field label="Contraseña" htmlFor="totp-off-pw">
          <Input id="totp-off-pw" name="password" type="password" autoComplete="current-password" required />
        </Field>
        <Field label="Código de la app o de recuperación" htmlFor="totp-off-code">
          <Input id="totp-off-code" name="code" autoComplete="one-time-code" required maxLength={20} />
        </Field>
        <Button type="submit" variant="destructive" disabled={busy}>
          Desactivar verificación en dos pasos
        </Button>
      </form>
    </div>
  );
}
