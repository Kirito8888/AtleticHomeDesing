"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/client-api";
import { confirmDialog } from "@/components/ui/confirm-dialog";

export function NewExercise() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  if (!open)
    return (
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        + Nuevo ejercicio
      </Button>
    );
  return (
    <form
      className="grid gap-3 rounded-lg border p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const ex = await api<{ id: string }>("/api/training/exercises", { body: { name, description: description || null, loadType: "BODYWEIGHT" } });
          toast.success("Ejercicio creado");
          router.push(`/training/exercises/${ex.id}`);
        } catch (err) {
          toast.error((err as Error).message);
          setBusy(false);
        }
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="ex-name">Nombre</Label>
        <Input id="ex-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="ex-desc">Instrucciones técnicas</Label>
        <Textarea id="ex-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} rows={4} />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy || !name.trim()}>
          Crear
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

export function ExerciseEditor({ id, name: n0, description: d0 }: { id: string; name: string; description: string }) {
  const router = useRouter();
  const [name, setName] = useState(n0);
  const [description, setDescription] = useState(d0);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="grid gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await api(`/api/training/exercises/${id}`, { method: "PATCH", body: { name, description } });
          toast.success("Ejercicio guardado");
          router.refresh();
        } catch (err) {
          toast.error((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="ex-name">Nombre</Label>
        <Input id="ex-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="ex-desc">Instrucciones técnicas</Label>
        <Textarea id="ex-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} rows={6} />
      </div>
      <Button type="submit" size="sm" className="justify-self-start" disabled={busy || !name.trim()}>
        Guardar
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="justify-self-start text-destructive"
        disabled={busy}
        onClick={async () => {
          if (!(await confirmDialog({ title: "¿Borrar este ejercicio y su vídeo?", description: "No se puede deshacer.", confirmLabel: "Borrar", destructive: true }))) return;
          setBusy(true);
          try {
            await api(`/api/training/exercises/${id}`, { method: "DELETE" });
            toast.success("Ejercicio borrado");
            router.push("/training/exercises");
            router.refresh();
          } catch (err) {
            toast.error((err as Error).message);
            setBusy(false);
          }
        }}
      >
        Borrar ejercicio
      </Button>
    </form>
  );
}
