"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { Field } from "@/components/form/chips";
import { EVENT_META, LEVEL_META, PHASE_LABEL } from "@/components/planning/meta";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/client-api";

interface CycleOption {
  id: string;
  name: string;
  level: keyof typeof LEVEL_META;
}

export function AddPlanningSheet({ cycles, defaultDate }: { cycles: CycleOption[]; defaultDate: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function send(url: string, body: Record<string, unknown>, ok: string) {
    setBusy(true);
    try {
      await api(url, { body });
      toast.success(ok);
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const val = (f: FormData, k: string) => {
    const v = f.get(k);
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="sm">
          <Plus /> Añadir
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Planificar</SheetTitle>
          <SheetDescription>Ciclos de periodización o eventos clave.</SheetDescription>
        </SheetHeader>
        <Tabs defaultValue="event">
          <TabsList>
            <TabsTrigger value="event">Evento</TabsTrigger>
            <TabsTrigger value="cycle">Ciclo</TabsTrigger>
          </TabsList>
          <TabsContent value="event">
            <form
              className="grid gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void send(
                  "/api/planning/events",
                  {
                    type: val(f, "type"),
                    title: val(f, "title"),
                    startAt: val(f, "startAt"),
                    endAt: val(f, "endAt"),
                    priority: val(f, "priority"),
                    location: val(f, "location"),
                    cycleId: val(f, "cycleId"),
                  },
                  "Evento añadido",
                );
              }}
            >
              <Field label="Tipo" htmlFor="ev-type">
                <Select id="ev-type" name="type" defaultValue="COMPETITION">
                  {Object.entries(EVENT_META).map(([k, m]) => (
                    <option key={k} value={k}>
                      {m.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Título" htmlFor="ev-title">
                <Input id="ev-title" name="title" required placeholder="Campeonato autonómico" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Inicio" htmlFor="ev-start">
                  <Input id="ev-start" name="startAt" type="date" defaultValue={defaultDate} required />
                </Field>
                <Field label="Fin (opcional)" htmlFor="ev-end">
                  <Input id="ev-end" name="endAt" type="date" />
                </Field>
                <Field label="Prioridad (competición)" htmlFor="ev-prio">
                  <Select id="ev-prio" name="priority" defaultValue="B">
                    <option value="A">A — objetivo</option>
                    <option value="B">B — importante</option>
                    <option value="C">C — preparación</option>
                  </Select>
                </Field>
                <Field label="Lugar" htmlFor="ev-loc">
                  <Input id="ev-loc" name="location" />
                </Field>
              </div>
              {cycles.length ? (
                <Field label="Ciclo" htmlFor="ev-cycle">
                  <Select id="ev-cycle" name="cycleId" defaultValue="">
                    <option value="">—</option>
                    {cycles.map((c) => (
                      <option key={c.id} value={c.id}>
                        {LEVEL_META[c.level].label}: {c.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : null}
              <Button type="submit" disabled={busy}>
                Guardar evento
              </Button>
            </form>
          </TabsContent>
          <TabsContent value="cycle">
            <form
              className="grid gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const load = val(f, "plannedLoad");
                void send(
                  "/api/planning/cycles",
                  {
                    level: val(f, "level"),
                    name: val(f, "name"),
                    phase: val(f, "phase"),
                    goal: val(f, "goal"),
                    startDate: val(f, "startDate"),
                    endDate: val(f, "endDate"),
                    parentId: val(f, "parentId"),
                    plannedLoad: load ? Number(load) : null,
                  },
                  "Ciclo creado",
                );
              }}
            >
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nivel" htmlFor="cy-level">
                  <Select id="cy-level" name="level" defaultValue="MESO">
                    {Object.entries(LEVEL_META).map(([k, m]) => (
                      <option key={k} value={k}>
                        {m.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Fase" htmlFor="cy-phase">
                  <Select id="cy-phase" name="phase" defaultValue="">
                    <option value="">—</option>
                    {Object.entries(PHASE_LABEL).map(([k, l]) => (
                      <option key={k} value={k}>
                        {l}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Field label="Nombre" htmlFor="cy-name">
                <Input id="cy-name" name="name" required placeholder="Bloque de fuerza máxima" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Inicio" htmlFor="cy-start">
                  <Input id="cy-start" name="startDate" type="date" defaultValue={defaultDate} required />
                </Field>
                <Field label="Fin" htmlFor="cy-end">
                  <Input id="cy-end" name="endDate" type="date" required />
                </Field>
              </div>
              {cycles.length ? (
                <Field label="Dentro de" htmlFor="cy-parent">
                  <Select id="cy-parent" name="parentId" defaultValue="">
                    <option value="">— (nivel superior)</option>
                    {cycles
                      .filter((c) => c.level !== "MICRO")
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {LEVEL_META[c.level].label}: {c.name}
                        </option>
                      ))}
                  </Select>
                </Field>
              ) : null}
              <Field label="TSS objetivo del ciclo" htmlFor="cy-load">
                <Input id="cy-load" name="plannedLoad" inputMode="numeric" />
              </Field>
              <Field label="Objetivo" htmlFor="cy-goal">
                <Textarea id="cy-goal" name="goal" />
              </Field>
              <Button type="submit" disabled={busy}>
                Crear ciclo
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

export function DeleteButton({ url, label }: { url: string; label: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className="text-xs text-muted-foreground underline-offset-2 hover:underline"
      onClick={async () => {
        if (!confirm(`¿Borrar ${label}?`)) return;
        try {
          await api(url, { method: "DELETE" });
          router.refresh();
        } catch (e) {
          toast.error((e as Error).message);
        }
      }}
    >
      Borrar
    </button>
  );
}
