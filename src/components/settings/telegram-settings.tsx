"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/client-api";

type Status = { configured: boolean; linked: boolean; enabled: boolean; linkedAt: string | null; bot: string | null };

/** v1.10 · Vincular Telegram con un código de un solo uso (15 min). */
export function TelegramSettings({ status }: { status: Status }) {
  const router = useRouter();
  const [code, setCode] = useState<{ code: string; url: string | null; bot: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  if (!status.configured) return <p className="text-sm text-muted-foreground">Telegram no está activado en este servidor (lo configura la administración).</p>;
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (status.linked) {
    return (
      <div className="grid gap-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="tg-enabled" className="font-medium">
            Recibir los avisos también por Telegram
          </label>
          <Switch
            id="tg-enabled"
            checked={status.enabled}
            disabled={busy}
            onCheckedChange={(v) =>
              run(async () => {
                await api("/api/account/telegram", { method: "PATCH", body: { enabled: v } });
                router.refresh();
              })
            }
          />
        </div>
        <p className="text-xs text-muted-foreground">Vinculado{status.linkedAt ? ` el ${new Date(status.linkedAt).toLocaleDateString("es-ES")}` : ""}. Respeta tus horas de silencio; los avisos de salud llegan sin detalles.</p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="justify-self-start"
          disabled={busy}
          onClick={() =>
            run(async () => {
              await api("/api/account/telegram", { method: "DELETE" });
              toast.success("Telegram desvinculado");
              router.refresh();
            })
          }
        >
          Desvincular Telegram
        </Button>
      </div>
    );
  }
  return (
    <div className="grid gap-3 text-sm">
      {code ? (
        <div role="status" aria-label="Código de Telegram" className="grid gap-2 rounded-md border border-primary/40 bg-primary/5 p-3">
          <p>
            Envía al bot{code.bot ? ` @${code.bot}` : ""} este mensaje (vale 15 minutos):
          </p>
          <p className="font-mono text-lg tracking-widest">/start {code.code}</p>
          {code.url ? (
            <a href={code.url} target="_blank" rel="noopener noreferrer" className="justify-self-start font-medium underline underline-offset-4">
              Abrir Telegram
            </a>
          ) : null}
          <Button type="button" size="sm" variant="outline" className="justify-self-start" onClick={() => router.refresh()}>
            Ya lo he enviado
          </Button>
        </div>
      ) : null}
      <Button
        type="button"
        variant="outline"
        className="justify-self-start"
        disabled={busy}
        onClick={() =>
          run(async () => {
            setCode(await api<{ code: string; url: string | null; bot: string | null }>("/api/account/telegram", { method: "POST" }));
          })
        }
      >
        Vincular Telegram
      </Button>
      <p className="text-xs text-muted-foreground">Recibirás los mismos avisos que en el móvil. Nada de tu salud viaja en el texto.</p>
    </div>
  );
}
