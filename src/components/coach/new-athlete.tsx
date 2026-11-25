"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { api } from "@/lib/client-api";
import { MANAGED_NOTICE } from "@/lib/managed/rules";

/** Alta de una atleta sin cuenta en una pantalla: alias, categoría o año, disciplina, grupo y conformidad. */
export function NewAthlete({ groups }: { groups: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [v, setV] = useState({ alias: "", category: "", birthYear: "", discipline: "", group: "", consent: false });
  const set = (k: keyof typeof v, x: string | boolean) => setV((o) => ({ ...o, [k]: x }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = {
        alias: v.alias,
        ...(v.category.trim() ? { category: v.category } : {}),
        ...(v.birthYear.trim() ? { birthYear: Number(v.birthYear) } : {}),
        ...(v.discipline.trim() ? { discipline: v.discipline } : {}),
        ...(v.group.trim() ? { group: v.group } : {}),
        consent: v.consent,
      };
      const r = await api<{ id: string }>("/api/coach/athletes", { body });
      toast.success("Atleta añadida");
      setOpen(false);
      setV({ alias: "", category: "", birthYear: "", discipline: "", group: "", consent: false });
      router.push(`/coach/athletes/${r.id}`);
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button className="h-12 w-full sm:w-auto" data-testid="new-athlete">
          <Plus /> Nueva atleta
        </Button>
      </SheetTrigger>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Nueva atleta (sin cuenta)</SheetTitle>
          <SheetDescription>{MANAGED_NOTICE}</SheetDescription>
        </SheetHeader>
        <form onSubmit={submit} className="grid gap-3 p-4 pt-0 text-sm">
          <label className="grid gap-1">
            Alias
            <Input value={v.alias} onChange={(e) => set("alias", e.target.value)} required maxLength={40} className="h-11" autoComplete="off" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1">
              Categoría
              <Input value={v.category} onChange={(e) => set("category", e.target.value)} maxLength={40} placeholder="Sub-18" className="h-11" />
            </label>
            <label className="grid gap-1">
              Año de nacimiento
              <Input value={v.birthYear} onChange={(e) => set("birthYear", e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" placeholder="2009" className="h-11" />
            </label>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">Indica al menos una de las dos. Mínimo 14 años.</p>
          <label className="grid gap-1">
            Disciplina
            <Input value={v.discipline} onChange={(e) => set("discipline", e.target.value)} maxLength={60} placeholder="Vallas" className="h-11" />
          </label>
          <label className="grid gap-1">
            Grupo
            <Input value={v.group} onChange={(e) => set("group", e.target.value)} maxLength={40} list="athlete-groups" className="h-11" />
            <datalist id="athlete-groups">
              {groups.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </label>
          <label className="flex min-h-11 items-start gap-3">
            <input type="checkbox" checked={v.consent} onChange={(e) => set("consent", e.target.checked)} className="mt-1 size-5" required />
            <span>Tengo su conformidad (o la de su tutor) para llevar su planificación en Atlenza, también con herramientas de IA si algún día se usan.</span>
          </label>
          <Button type="submit" disabled={busy || !v.consent} className="h-12">
            Añadir atleta
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
