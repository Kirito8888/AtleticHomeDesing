"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Field } from "@/components/form/chips";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/client-api";
import { EQUIPMENT_KINDS, type EquipmentKind } from "@/lib/training/equipment";

const num = (s: string) => (s.trim() ? Number(s.replace(",", ".")) : null);

/** Alta de material: jabalina (cuenta lanzamientos con su peso), clavos, zapatillas u otro. */
export function EquipmentForm({ today, expenses }: { today: string; expenses: Array<{ id: string; label: string }> }) {
  const router = useRouter();
  const [f, setF] = useState({ name: "", kind: "JAVELIN" as EquipmentKind, weight: "800", purchasedOn: today, lifeUses: "", lifeMonths: "", tx: "" });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  async function save() {
    if (!f.name.trim()) return toast.error("Ponle un nombre");
    setBusy(true);
    try {
      await api("/api/training/equipment", {
        body: {
          name: f.name,
          kind: f.kind,
          implementWeightG: f.kind === "JAVELIN" ? num(f.weight) : null,
          purchasedOn: f.purchasedOn || null,
          lifeUses: num(f.lifeUses),
          lifeMonths: num(f.lifeMonths),
          transactionId: f.tx || null,
        },
      });
      toast.success("Material añadido");
      setF({ ...f, name: "", lifeUses: "", lifeMonths: "", tx: "" });
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-3">
      <Field label="Nombre" htmlFor="e-name">
        <Input id="e-name" value={f.name} maxLength={80} placeholder="Nemeth 800 g" onChange={set("name")} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tipo" htmlFor="e-kind">
          <Select id="e-kind" value={f.kind} onChange={set("kind")}>
            {Object.entries(EQUIPMENT_KINDS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </Select>
        </Field>
        {f.kind === "JAVELIN" ? (
          <Field label="Peso (g)" htmlFor="e-weight">
            <Input id="e-weight" inputMode="numeric" value={f.weight} onChange={set("weight")} />
          </Field>
        ) : (
          <Field label="Comprado el" htmlFor="e-date">
            <Input id="e-date" type="date" className="w-full min-w-0" value={f.purchasedOn} onChange={set("purchasedOn")} />
          </Field>
        )}
      </div>
      {f.kind === "JAVELIN" ? (
        <Field label="Comprada el" htmlFor="e-date">
          <Input id="e-date" type="date" value={f.purchasedOn} onChange={set("purchasedOn")} />
        </Field>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <Field label={`Vida útil (${EQUIPMENT_KINDS[f.kind].unit})`} htmlFor="e-uses">
          <Input id="e-uses" inputMode="numeric" value={f.lifeUses} onChange={set("lifeUses")} />
        </Field>
        <Field label="o en meses" htmlFor="e-months">
          <Input id="e-months" inputMode="numeric" value={f.lifeMonths} onChange={set("lifeMonths")} />
        </Field>
      </div>
      {expenses.length ? (
        <Field label="Gasto de la compra (opcional)" htmlFor="e-tx">
          <Select id="e-tx" value={f.tx} onChange={set("tx")}>
            <option value="">Ninguno</option>
            {expenses.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      <Button type="button" onClick={save} disabled={busy}>
        Añadir material
      </Button>
    </div>
  );
}

/** Anotar usos que la app no ve (p. ej. lanzamientos sin registrar), retirar o borrar. */
export function EquipmentActions({ id, name, retired }: { id: string; name: string; retired: boolean }) {
  const router = useRouter();
  const [uses, setUses] = useState("");
  async function call(body: unknown, method = "PATCH") {
    try {
      await api(`/api/training/equipment/${id}`, { method, body: method === "DELETE" ? undefined : body });
      setUses("");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {!retired ? (
        <>
          <Input aria-label={`Usos extra de ${name}`} inputMode="numeric" placeholder="+usos" className="h-8 w-20" value={uses} onChange={(e) => setUses(e.target.value)} />
          <Button type="button" size="sm" variant="outline" onClick={() => Number(uses) && call({ addUses: Math.round(Number(uses)) })}>
            Anotar
          </Button>
        </>
      ) : null}
      <Button type="button" size="sm" variant="ghost" onClick={() => call({ retired: !retired })}>
        {retired ? "Reactivar" : "Retirar"}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="text-destructive"
        onClick={() => {
          if (confirm(`¿Borrar «${name}»?`)) call(null, "DELETE");
        }}
      >
        Borrar
      </Button>
    </div>
  );
}
