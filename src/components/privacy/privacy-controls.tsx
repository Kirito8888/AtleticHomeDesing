"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/client-api";

/** Limitación del tratamiento (art. 18): nada sale de tu cuenta mientras esté activa. */
export function RestrictionToggle({ initial }: { initial: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <label htmlFor="restrict" className="font-medium">
        Limitar el tratamiento de mis datos
      </label>
      <Switch
        id="restrict"
        checked={on}
        disabled={busy}
        onCheckedChange={async (v) => {
          setBusy(true);
          try {
            await api("/api/account/privacy", { body: { restrict: v } });
            setOn(v);
            toast.success(v ? "Tratamiento limitado: no sale nada de tu cuenta" : "Limitación levantada");
            router.refresh();
          } catch (e) {
            toast.error((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}

/** Dejar constancia de una petición (rectificación u oposición que la app no resuelve sola). */
export function PrivacyRequestForm() {
  const router = useRouter();
  const [right, setRight] = useState("RECTIFICATION");
  const [detail, setDetail] = useState("");
  return (
    <form
      className="grid gap-2 text-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await api("/api/account/privacy", { body: { right, detail } });
          toast.success("Petición anotada");
          setDetail("");
          router.refresh();
        } catch (err) {
          toast.error((err as Error).message);
        }
      }}
    >
      <Select aria-label="Derecho" value={right} onChange={(e) => setRight(e.target.value)}>
        <option value="RECTIFICATION">Rectificación</option>
        <option value="OBJECTION">Oposición</option>
        <option value="ERASURE">Supresión parcial</option>
      </Select>
      <textarea
        aria-label="Qué pides"
        className="min-h-20 rounded-md border bg-transparent px-3 py-2"
        maxLength={500}
        value={detail}
        onChange={(e) => setDetail(e.target.value)}
        placeholder="Qué dato y qué quieres que se haga"
      />
      <Button type="submit" variant="outline" disabled={!detail.trim()}>
        Enviar petición
      </Button>
    </form>
  );
}
