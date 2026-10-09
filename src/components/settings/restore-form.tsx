"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client-api";

/** Restaurar «Descargar mis datos» en una cuenta vacía (p. ej. al cambiar de servidor). */
export function RestoreForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  async function go() {
    if (!file) return;
    if (!confirm("Se importan tus entrenos, recuperación, salud, calendario, comidas y estudio. Las finanzas y los apuntes no. ¿Seguir?")) return;
    setBusy(true);
    const form = new FormData();
    form.append("file", file);
    try {
      const r = await api<{ counts: Record<string, number>; skipped: number }>("/api/account/restore", { form });
      const summary = Object.entries(r.counts).map(([k, n]) => `${n} ${k}`).join(", ");
      setResult(`${summary || "Nada que restaurar"}${r.skipped ? ` · ${r.skipped} elementos no se pudieron importar` : ""}`);
      toast.success("Datos restaurados");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="grid gap-2 text-sm">
      <Input type="file" accept="application/json,.json" aria-label="Exportación de LifeOS (JSON)" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      <Button type="button" variant="outline" disabled={busy || !file} onClick={go}>
        Restaurar en esta cuenta
      </Button>
      {result ? (
        <p role="status" className="text-xs text-muted-foreground">
          {result}
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">Solo funciona si esta cuenta está vacía. No incluye finanzas, apuntes, chats ni planes importados.</p>
    </div>
  );
}
