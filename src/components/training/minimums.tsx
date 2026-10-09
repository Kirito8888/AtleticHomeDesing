"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Field } from "@/components/form/chips";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client-api";

export function MinimumForm() {
  const router = useRouter();
  const [f, setF] = useState({ name: "", mark: "", deadline: "", weight: "800" });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  async function save() {
    const markM = Number(f.mark.replace(",", "."));
    if (!f.name.trim() || !(markM > 0)) return toast.error("Pon el nombre y la marca");
    setBusy(true);
    try {
      await api("/api/training/minimums", { body: { name: f.name, markM, deadline: f.deadline || null, implementWeightG: f.weight ? Number(f.weight) : null } });
      toast.success("Mínima añadida");
      setF({ ...f, name: "", mark: "" });
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="grid gap-3 text-sm">
      <Field label="Campeonato u objetivo" htmlFor="mn-name">
        <Input id="mn-name" value={f.name} maxLength={80} placeholder="Campeonato de España sub-23" onChange={set("name")} />
      </Field>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Marca (m)" htmlFor="mn-mark">
          <Input id="mn-mark" inputMode="decimal" className="w-full min-w-0" value={f.mark} onChange={set("mark")} />
        </Field>
        <Field label="Peso (g)" htmlFor="mn-w">
          <Input id="mn-w" inputMode="numeric" className="w-full min-w-0" value={f.weight} onChange={set("weight")} />
        </Field>
        <Field label="Hasta" htmlFor="mn-dl">
          <Input id="mn-dl" type="date" className="w-full min-w-0" value={f.deadline} onChange={set("deadline")} />
        </Field>
      </div>
      <Button type="button" disabled={busy} onClick={save}>
        Añadir mínima
      </Button>
    </div>
  );
}

export function DeleteMinimum({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      aria-label={`Borrar ${name}`}
      className="text-xs text-muted-foreground underline-offset-2 hover:underline"
      onClick={async () => {
        try {
          await api(`/api/training/minimums/${id}`, { method: "DELETE" });
          router.refresh();
        } catch (e) {
          toast.error((e as Error).message);
        }
      }}
    >
      borrar
    </button>
  );
}
