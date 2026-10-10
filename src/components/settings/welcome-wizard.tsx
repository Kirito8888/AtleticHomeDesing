"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Chips, Field, MultiChips } from "@/components/form/chips";
import { MODULE_LABEL, type ModuleKey } from "@/components/layout/nav-items";
import { DISCIPLINES } from "@/components/settings/settings-forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { api } from "@/lib/client-api";

const STEPS = ["Para qué", "Tú", "Avisos"] as const;
type Discipline = keyof typeof DISCIPLINES;

/**
 * v1.8 · Primer uso: qué partes de Atlenza vas a usar (el resto se oculta y se puede recuperar en
 * Ajustes → Módulos), tu perfil básico y las horas de silencio. Todo opcional.
 */
export function WelcomeWizard({ initial }: { initial: { name: string; sex: "MALE" | "FEMALE" | "OTHER" | null; birthDate: string; disciplines: Discipline[]; hidden: ModuleKey[] } }) {
  const router = useRouter();
  const all = Object.keys(MODULE_LABEL) as ModuleKey[];
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [modules, setModules] = useState<ModuleKey[]>(all.filter((m) => !initial.hidden.includes(m)));
  const [name, setName] = useState(initial.name);
  const [sex, setSex] = useState(initial.sex);
  const [birthDate, setBirthDate] = useState(initial.birthDate);
  const [disciplines, setDisciplines] = useState<Discipline[]>(initial.disciplines);
  const [quiet, setQuiet] = useState(true);

  async function finish() {
    setBusy(true);
    try {
      await api("/api/settings/prefs", { method: "PATCH", body: { hiddenModules: all.filter((m) => !modules.includes(m)), quietHours: quiet ? { from: "22:30", to: "07:30" } : null } });
      await api("/api/profile", { method: "PATCH", body: { name: name.trim() || undefined, sex, birthDate: birthDate || null, disciplines } });
      await api("/api/account/onboarded", { method: "POST" });
      toast.success("¡Listo! Puedes cambiarlo todo en Ajustes");
      router.push("/");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 text-sm">
      <div className="grid gap-1">
        <p className="text-xs text-muted-foreground">
          Paso {step + 1} de {STEPS.length} · {STEPS[step]}
        </p>
        <Progress value={((step + 1) / STEPS.length) * 100} aria-label="Progreso de la bienvenida" />
      </div>
      {step === 0 ? (
        <>
          <p>¿Qué vas a usar? Lo demás se oculta (sin borrar nada) y lo recuperas cuando quieras en Ajustes → Módulos.</p>
          <MultiChips label="Partes de Atlenza" options={all.map((m) => ({ value: m, label: MODULE_LABEL[m] }))} value={modules} onChange={setModules} />
        </>
      ) : null}
      {step === 1 ? (
        <>
          <Field label="Cómo te llamas" htmlFor="wz-name">
            <Input id="wz-name" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Sexo" hint="Ajusta algunos cálculos (FC, fuerza relativa, salud de la mujer)">
            <Chips
              label="Sexo"
              allowDeselect
              options={[
                { value: "FEMALE" as const, label: "Mujer" },
                { value: "MALE" as const, label: "Hombre" },
                { value: "OTHER" as const, label: "Otro" },
              ]}
              value={sex}
              onChange={setSex}
            />
          </Field>
          <Field label="Fecha de nacimiento" htmlFor="wz-birth" hint="Para la categoría por edad y los récords por temporada">
            <Input id="wz-birth" type="date" className="w-44" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
          </Field>
          <Field label="Disciplinas">
            <MultiChips label="Disciplinas" options={(Object.keys(DISCIPLINES) as Discipline[]).map((d) => ({ value: d, label: DISCIPLINES[d] }))} value={disciplines} onChange={setDisciplines} />
          </Field>
        </>
      ) : null}
      {step === 2 ? (
        <>
          <label className="flex items-center gap-2">
            <input type="checkbox" className="size-4" checked={quiet} onChange={() => setQuiet(!quiet)} />
            Sin notificaciones de 22:30 a 7:30 (las de seguridad llegan siempre)
          </label>
          <p className="text-muted-foreground">Para recibir avisos en el móvil, actívalos después en Ajustes → Notificaciones. Mientras, quedan en la campana de arriba.</p>
        </>
      ) : null}
      <div className="flex justify-between gap-2">
        <Button type="button" variant="ghost" disabled={step === 0 || busy} onClick={() => setStep(step - 1)}>
          Atrás
        </Button>
        {step < STEPS.length - 1 ? (
          <Button type="button" disabled={step === 0 && !modules.length} onClick={() => setStep(step + 1)}>
            Siguiente
          </Button>
        ) : (
          <Button type="button" disabled={busy} onClick={finish}>
            {busy ? "Guardando…" : "Empezar"}
          </Button>
        )}
      </div>
    </div>
  );
}
