"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Field } from "@/components/form/chips";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/client-api";
import { parseDuration } from "@/lib/format";
import { cn } from "@/lib/utils";

const DISCIPLINES = {
  SPRINT: "Velocidad",
  MIDDLE_DISTANCE: "Medio fondo",
  LONG_DISTANCE: "Fondo",
  HURDLES: "Vallas",
  JUMPS: "Saltos",
  THROWS: "Lanzamientos",
  COMBINED_EVENTS: "Pruebas combinadas",
  SWIMMING: "Natación",
  CYCLING: "Ciclismo",
  STRENGTH: "Fuerza",
  OTHER: "Otra",
} as const;

function useSave() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return {
    busy,
    save: async (url: string, body: Record<string, unknown>, method = "POST", ok = "Guardado") => {
      setBusy(true);
      try {
        await api(url, { method, body });
        toast.success(ok);
        router.refresh();
        return true;
      } catch (e) {
        toast.error((e as Error).message);
        return false;
      } finally {
        setBusy(false);
      }
    },
  };
}

const s = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" && v.trim() ? v.trim() : null;
};
const n = (f: FormData, k: string) => {
  const v = s(f, k);
  const x = v == null ? NaN : Number(v.replace(",", "."));
  return Number.isNaN(x) ? null : x;
};

export interface ProfileValues {
  name: string;
  sex: string | null;
  birthDate: string | null;
  heightCm: number | null;
  bodyWeightKg: number | null;
  primaryDiscipline: string | null;
  disciplines: string[];
  ctlTimeConstant: number;
  atlTimeConstant: number;
}

export function ProfileForm({ initial }: { initial: ProfileValues }) {
  const { busy, save } = useSave();
  const [disciplines, setDisciplines] = useState<string[]>(initial.disciplines);
  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        void save(
          "/api/profile",
          {
            name: s(f, "name") ?? undefined,
            sex: s(f, "sex"),
            birthDate: s(f, "birthDate"),
            heightCm: n(f, "heightCm"),
            bodyWeightKg: n(f, "bodyWeightKg"),
            primaryDiscipline: s(f, "primaryDiscipline"),
            disciplines,
            ctlTimeConstant: n(f, "ctl") ?? undefined,
            atlTimeConstant: n(f, "atl") ?? undefined,
          },
          "PATCH",
          "Perfil guardado",
        );
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Field label="Nombre" htmlFor="p-name">
            <Input id="p-name" name="name" defaultValue={initial.name} required />
          </Field>
        </div>
        <Field label="Sexo" htmlFor="p-sex" hint="Ajusta la fórmula TRIMP del hrTSS">
          <Select id="p-sex" name="sex" defaultValue={initial.sex ?? ""}>
            <option value="">—</option>
            <option value="MALE">Hombre</option>
            <option value="FEMALE">Mujer</option>
            <option value="OTHER">Otro</option>
          </Select>
        </Field>
        <Field label="Fecha de nacimiento" htmlFor="p-birth">
          <Input id="p-birth" name="birthDate" type="date" defaultValue={initial.birthDate ?? ""} />
        </Field>
        <Field label="Altura (cm)" htmlFor="p-height">
          <Input id="p-height" name="heightCm" inputMode="decimal" defaultValue={initial.heightCm ?? ""} />
        </Field>
        <Field label="Peso (kg)" htmlFor="p-weight">
          <Input id="p-weight" name="bodyWeightKg" inputMode="decimal" defaultValue={initial.bodyWeightKg ?? ""} />
        </Field>
        <div className="col-span-2">
          <Field label="Disciplina principal" htmlFor="p-disc">
            <Select id="p-disc" name="primaryDiscipline" defaultValue={initial.primaryDiscipline ?? ""}>
              <option value="">—</option>
              {Object.entries(DISCIPLINES).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>
      <Field label="Otras disciplinas">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Otras disciplinas">
          {Object.entries(DISCIPLINES).map(([k, l]) => {
            const on = disciplines.includes(k);
            return (
              <button
                key={k}
                type="button"
                aria-pressed={on}
                onClick={() => setDisciplines((d) => (on ? d.filter((x) => x !== k) : [...d, k]))}
                className={cn("h-8 rounded-full border px-3 text-sm", on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent")}
              >
                {l}
              </button>
            );
          })}
        </div>
      </Field>
      <details>
        <summary className="cursor-pointer text-sm font-medium">Avanzado: constantes del modelo de Banister</summary>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <Field label="CTL (días)" htmlFor="p-ctl" hint="Por defecto 42">
            <Input id="p-ctl" name="ctl" inputMode="numeric" defaultValue={initial.ctlTimeConstant} />
          </Field>
          <Field label="ATL (días)" htmlFor="p-atl" hint="Por defecto 7">
            <Input id="p-atl" name="atl" inputMode="numeric" defaultValue={initial.atlTimeConstant} />
          </Field>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Cambiarlas recalcula todo tu histórico de fitness y fatiga.</p>
      </details>
      <Button type="submit" disabled={busy}>
        Guardar perfil
      </Button>
    </form>
  );
}

export function ThresholdForm({ today }: { today: string }) {
  const { busy, save } = useSave();
  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const pace = s(f, "pace");
        const css = s(f, "css");
        void save(
          "/api/training/thresholds",
          {
            effectiveFrom: s(f, "from"),
            hrMax: n(f, "hrMax"),
            hrRest: n(f, "hrRest"),
            lthr: n(f, "lthr"),
            thresholdPaceSecPerKm: pace ? parseDuration(pace) : null,
            thresholdPaceSecPer100mSwim: css ? parseDuration(css) : null,
          },
          "POST",
          "Umbrales guardados",
        );
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Vigentes desde" htmlFor="t-from">
          <Input id="t-from" name="from" type="date" defaultValue={today} required />
        </Field>
        <Field label="FC máxima" htmlFor="t-max">
          <Input id="t-max" name="hrMax" inputMode="numeric" placeholder="195" />
        </Field>
        <Field label="FC en reposo" htmlFor="t-rest">
          <Input id="t-rest" name="hrRest" inputMode="numeric" placeholder="48" />
        </Field>
        <Field label="FC umbral (LTHR)" htmlFor="t-lthr" hint="Base del hrTSS">
          <Input id="t-lthr" name="lthr" inputMode="numeric" placeholder="172" />
        </Field>
        <Field label="Ritmo umbral (/km)" htmlFor="t-pace" hint="mm:ss">
          <Input id="t-pace" name="pace" inputMode="numeric" placeholder="3:55" />
        </Field>
        <Field label="CSS natación (/100 m)" htmlFor="t-css" hint="mm:ss">
          <Input id="t-css" name="css" inputMode="numeric" placeholder="1:40" />
        </Field>
      </div>
      <p className="text-xs text-muted-foreground">Las sesiones anteriores conservan el TSS calculado con los umbrales de su fecha.</p>
      <Button type="submit" disabled={busy}>
        Guardar umbrales
      </Button>
    </form>
  );
}

export function NutritionGoalForm({ today, initial }: { today: string; initial: { kcal: number; proteinG: number; carbsG: number; fatG: number; trainingDayKcalFactor: number } | null }) {
  const { busy, save } = useSave();
  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        void save(
          "/api/nutrition/goals",
          {
            effectiveFrom: today,
            kcal: n(f, "kcal"),
            proteinG: n(f, "p"),
            carbsG: n(f, "c"),
            fatG: n(f, "g"),
            trainingDayKcalFactor: (n(f, "factor") ?? 0) / 100 + 1,
          },
          "POST",
          "Objetivo guardado",
        );
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Kcal/día" htmlFor="g-kcal">
          <Input id="g-kcal" name="kcal" inputMode="numeric" defaultValue={initial?.kcal ?? ""} required />
        </Field>
        <Field label="Proteína (g)" htmlFor="g-p">
          <Input id="g-p" name="p" inputMode="numeric" defaultValue={initial?.proteinG ?? ""} required />
        </Field>
        <Field label="Hidratos (g)" htmlFor="g-c">
          <Input id="g-c" name="c" inputMode="numeric" defaultValue={initial?.carbsG ?? ""} required />
        </Field>
        <Field label="Grasa (g)" htmlFor="g-g">
          <Input id="g-g" name="g" inputMode="numeric" defaultValue={initial?.fatG ?? ""} required />
        </Field>
      </div>
      <Field label="Extra en días de entreno (%)" htmlFor="g-factor" hint="Se suma en hidratos. 0 = sin ajuste.">
        <Input id="g-factor" name="factor" inputMode="numeric" defaultValue={initial ? Math.round((initial.trainingDayKcalFactor - 1) * 100) : 10} />
      </Field>
      <Button type="submit" disabled={busy}>
        Guardar objetivo
      </Button>
    </form>
  );
}

export function CustomExerciseForm() {
  const { busy, save } = useSave();
  return (
    <form
      className="grid gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const f = new FormData(form);
        const ok = await save(
          "/api/training/exercises",
          { name: s(f, "name"), loadType: s(f, "loadType"), bodyweightFactor: s(f, "loadType") === "BODYWEIGHT" ? 1 : 0 },
          "POST",
          "Ejercicio creado",
        );
        if (ok) form.reset();
      }}
    >
      <div className="grid grid-cols-[1fr_9rem] gap-2">
        <Input name="name" aria-label="Nombre del ejercicio" placeholder="p.ej. Lanzamiento de balón 3 kg" required />
        <Select name="loadType" aria-label="Tipo de carga" defaultValue="BARBELL">
          <option value="BARBELL">Barra</option>
          <option value="DUMBBELL">Mancuerna</option>
          <option value="KETTLEBELL">Kettlebell</option>
          <option value="MACHINE">Máquina</option>
          <option value="CABLE">Polea</option>
          <option value="BODYWEIGHT">Peso corporal</option>
          <option value="MEDBALL">Balón medicinal</option>
          <option value="BAND">Banda</option>
          <option value="OTHER">Otro</option>
        </Select>
      </div>
      <Button type="submit" variant="outline" disabled={busy}>
        Añadir ejercicio
      </Button>
    </form>
  );
}

export type CoachScopeName = "LOAD" | "SESSIONS" | "RECOVERY" | "PLANNING" | "REPORTS";

export interface LinkView {
  id: string;
  status: "PENDING" | "ACTIVE" | "REVOKED";
  canPlan: boolean;
  scopes: CoachScopeName[];
  other: { name: string | null; email: string };
}

const SCOPES: Array<{ value: CoachScopeName; label: string }> = [
  { value: "LOAD", label: "Carga y marcas" },
  { value: "SESSIONS", label: "Sesiones" },
  { value: "RECOVERY", label: "Recuperación y lesiones" },
  { value: "PLANNING", label: "Planificación" },
  { value: "REPORTS", label: "Informes IA" },
];

export function CoachLinks({ isCoach, asCoach, asAthlete }: { isCoach: boolean; asCoach: LinkView[]; asAthlete: LinkView[] }) {
  const { busy, save } = useSave();
  const STATUS = { PENDING: "Pendiente", ACTIVE: "Activo", REVOKED: "Revocado" } as const;
  return (
    <div className="grid gap-4">
      {isCoach ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void save("/api/coach/links", { athleteEmail: s(f, "email") }, "POST", "Invitación enviada");
          }}
        >
          <Input name="email" type="email" aria-label="Email del atleta" placeholder="email del atleta" required />
          <Button type="submit" disabled={busy}>
            Invitar
          </Button>
        </form>
      ) : null}

      {asAthlete.length ? (
        <div className="grid gap-2">
          <h4 className="text-sm font-medium">Mis entrenadores</h4>
          {asAthlete.map((l) => (
            <div key={l.id} className="grid gap-2 rounded-md border p-3 text-sm">
              <div className="flex justify-between gap-2">
                <span className="truncate">{l.other.name ?? l.other.email}</span>
                <span className="text-xs text-muted-foreground">{STATUS[l.status]}</span>
              </div>
              {l.status !== "REVOKED" ? (
                <div className="flex flex-wrap items-center gap-3">
                  {l.status === "PENDING" ? (
                    <Button size="sm" disabled={busy} onClick={() => save(`/api/coach/links/${l.id}`, { status: "ACTIVE" }, "PATCH", "Vínculo aceptado")}>
                      Aceptar
                    </Button>
                  ) : null}
                  <label className="flex items-center gap-2 text-xs">
                    <Switch checked={l.canPlan} onCheckedChange={(c) => save(`/api/coach/links/${l.id}`, { canPlan: c }, "PATCH", "Permiso actualizado")} />
                    Puede planificar mis sesiones
                  </label>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => save(`/api/coach/links/${l.id}`, { status: "REVOKED" }, "PATCH", "Vínculo revocado")}>
                    Revocar
                  </Button>
                </div>
              ) : null}
              {l.status !== "REVOKED" ? (
                <fieldset className="grid gap-1.5">
                  <legend className="mb-1 text-xs text-muted-foreground">Qué puede ver</legend>
                  <div className="flex flex-wrap gap-1.5">
                    {SCOPES.map((sc) => {
                      const on = l.scopes.includes(sc.value);
                      return (
                        <button
                          key={sc.value}
                          type="button"
                          role="switch"
                          aria-checked={on}
                          disabled={busy}
                          onClick={() =>
                            save(
                              `/api/coach/links/${l.id}`,
                              { scopes: on ? l.scopes.filter((x) => x !== sc.value) : [...l.scopes, sc.value] },
                              "PATCH",
                              "Permisos actualizados",
                            )
                          }
                          className={cn(
                            "rounded-full border px-3 py-1 text-xs transition-colors",
                            on ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground line-through",
                          )}
                        >
                          {sc.label}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {asCoach.length ? (
        <div className="grid gap-2">
          <h4 className="text-sm font-medium">Mis atletas</h4>
          {asCoach.map((l) => (
            <div key={l.id} className="flex items-center justify-between gap-2 rounded-md border p-3 text-sm">
              <span className="truncate">{l.other.name ?? l.other.email}</span>
              <span className="text-right text-xs text-muted-foreground">
                {STATUS[l.status]}
                {l.canPlan ? " · planifica" : ""}
                {l.status === "ACTIVE" && l.scopes.length < SCOPES.length
                  ? ` · ve: ${l.scopes.map((x) => SCOPES.find((sc) => sc.value === x)?.label.toLowerCase()).join(", ") || "nada"}`
                  : ""}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {!isCoach && !asAthlete.length ? <p className="text-sm text-muted-foreground">Cuando un entrenador te invite, aparecerá aquí para que lo aceptes.</p> : null}
    </div>
  );
}

export function RecomputeTssButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      className="mt-3 w-full"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const r = await api<{ sessions: number; changed: number }>("/api/training/recompute", { method: "POST", body: {} });
          toast.success(`TSS recalculado: ${r.changed} de ${r.sessions} sesiones cambiaron`);
          router.refresh();
        } catch (e) {
          toast.error((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? "Recalculando…" : "Recalcular TSS del historial con estos umbrales"}
    </Button>
  );
}
