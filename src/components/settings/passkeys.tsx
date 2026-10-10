"use client";

import { startRegistration } from "@simplewebauthn/browser";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client-api";

type Passkey = { id: string; name: string; createdAt: string; lastUsedAt: string | null; backedUp: boolean };
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Madrid" }) : "nunca");
const noop = () => () => undefined;

/** v1.7 · Llaves de acceso: entrar con la huella, la cara o el PIN del móvil, sin contraseña ni código. */
export function PasskeySettings({ passkeys }: { passkeys: Passkey[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  // Igual en el servidor y en el primer render del cliente (sin desajuste de hidratación)
  const supported = useSyncExternalStore(noop, () => "PublicKeyCredential" in window, () => true);

  async function add() {
    setBusy(true);
    try {
      const { challengeId, options } = await api<{ challengeId: string; options: Parameters<typeof startRegistration>[0]["optionsJSON"] }>("/api/account/passkeys", { body: { step: "options" } });
      const response = await startRegistration({ optionsJSON: options });
      await api("/api/account/passkeys", { body: { step: "verify", challengeId, name: name.trim() || "Mi llave", response } });
      toast.success("Llave de acceso añadida");
      setName("");
      router.refresh();
    } catch (err) {
      const e = err as Error;
      toast.error(e.name === "NotAllowedError" ? "Cancelado o sin respuesta del dispositivo" : e.message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(p: Passkey) {
    if (!confirm(`¿Quitar la llave «${p.name}»? No podrás entrar con ella.`)) return;
    try {
      await api(`/api/account/passkeys/${p.id}`, { method: "DELETE" });
      toast.success("Llave quitada");
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }
  return (
    <div className="grid gap-3 text-sm">
      <p className="text-muted-foreground">
        Entra con la huella, la cara o el PIN de tu móvil u ordenador. Resiste el phishing (la llave solo funciona en este sitio) y cuenta como segundo factor. La contraseña sigue valiendo.
      </p>
      {passkeys.length ? (
        <ul className="grid gap-1" aria-label="Mis llaves de acceso">
          {passkeys.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5">
              <span className="min-w-0 truncate">
                {p.name}
                <span className="block text-xs text-muted-foreground">
                  Creada {when(p.createdAt)} · último uso {when(p.lastUsedAt)}
                  {p.backedUp ? " · sincronizada" : ""}
                </span>
              </span>
              <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={() => remove(p)}>
                Quitar
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {supported ? (
        <div className="flex gap-2">
          <Input aria-label="Nombre de la llave" placeholder="Móvil, portátil…" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
          <Button type="button" onClick={add} disabled={busy}>
            Añadir llave
          </Button>
        </div>
      ) : (
        <p className="text-muted-foreground">Este navegador no admite llaves de acceso.</p>
      )}
    </div>
  );
}
