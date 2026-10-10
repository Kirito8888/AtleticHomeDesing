"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Chips, Field, MultiChips } from "@/components/form/chips";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { AVOID, BODY_AREAS, EQUIPMENT, LOCATIONS, MINUTES, WEEKDAY_LABEL } from "@/lib/ai-plan/options";
import { api } from "@/lib/client-api";
import { ACTIVITY, EXPERIENCE, GOALS_LONG, GOALS_SHORT, HORIZONS, PARQ, SEXES, SHORT_WEEKS, TESTS, type TestKey } from "@/lib/routine/questionnaire";

const opts = <T extends string>(o: Record<T, string>) => (Object.entries(o) as Array<[T, string]>).map(([value, label]) => ({ value, label }));
const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));
const STEPS = ["Tú", "Salud", "Tests", "Objetivos", "Horario"] as const;

type State = {
  sex: keyof typeof SEXES | null;
  age: string;
  weightKg: string;
  heightCm: string;
  experience: keyof typeof EXPERIENCE | null;
  activity: keyof typeof ACTIVITY | null;
  sleepHours: string;
  parq: Array<keyof typeof PARQ>;
  parqNone: boolean;
  tests: Record<TestKey, string>;
  shortGoal: keyof typeof GOALS_SHORT | null;
  shortWeeks: number | null;
  longGoal: keyof typeof GOALS_LONG | null;
  horizonMonths: number | null;
  weekdays: number[];
  minutes: number | null;
  location: keyof typeof LOCATIONS | null;
  equipment: Array<keyof typeof EQUIPMENT>;
  areas: Array<keyof typeof BODY_AREAS>;
  avoid: Array<keyof typeof AVOID>;
  startDate: string;
};

/**
 * v1.7 · Cuestionario para crear una rutina: quién eres, salud (estilo PAR-Q), tests sencillos,
 * objetivos a corto y largo plazo y horario. Todo con toques; los números, opcionales salvo la edad.
 */
export function RoutineWizard({ today }: { today: string }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [s, setS] = useState<State>({
    sex: null,
    age: "",
    weightKg: "",
    heightCm: "",
    experience: null,
    activity: null,
    sleepHours: "",
    parq: [],
    parqNone: false,
    tests: Object.fromEntries(Object.keys(TESTS).map((k) => [k, ""])) as Record<TestKey, string>,
    shortGoal: null,
    shortWeeks: 8,
    longGoal: null,
    horizonMonths: 6,
    weekdays: [],
    minutes: 45,
    location: null,
    equipment: [],
    areas: [],
    avoid: [],
    startDate: today,
  });
  const set = <K extends keyof State>(k: K, v: State[K]) => setS((x) => ({ ...x, [k]: v }));

  const ok = [
    Boolean(s.sex && Number(s.age) >= 14 && s.experience && s.activity),
    s.parq.length > 0 || s.parqNone,
    true,
    Boolean(s.shortGoal && s.shortWeeks && s.longGoal && s.horizonMonths),
    Boolean(s.weekdays.length && s.minutes && s.location && s.startDate),
  ][step];

  async function submit() {
    setBusy(true);
    try {
      const body = {
        sex: s.sex,
        age: Number(s.age),
        weightKg: num(s.weightKg),
        heightCm: num(s.heightCm),
        experience: s.experience,
        activity: s.activity,
        sleepHours: num(s.sleepHours),
        parq: s.parq,
        tests: Object.fromEntries((Object.keys(TESTS) as TestKey[]).map((k) => [k, num(s.tests[k])])),
        shortGoal: s.shortGoal,
        shortWeeks: s.shortWeeks,
        longGoal: s.longGoal,
        horizonMonths: s.horizonMonths,
        weekdays: s.weekdays,
        minutes: s.minutes,
        location: s.location,
        equipment: s.equipment,
        areas: s.areas,
        avoid: s.avoid,
        startDate: s.startDate,
      };
      const r = await api<{ id: string }>("/api/routine", { body });
      toast.success("Rutina creada (borrador)");
      router.push(`/training/routine/${r.id}`);
    } catch (e) {
      toast.error((e as Error).message, { duration: 10_000 });
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 text-sm">
      <div className="grid gap-1">
        <p className="text-xs text-muted-foreground">
          Paso {step + 1} de {STEPS.length} · {STEPS[step]}
        </p>
        <Progress value={((step + 1) / STEPS.length) * 100} aria-label="Progreso del cuestionario" />
      </div>

      {step === 0 ? (
        <>
          <Field label="Soy">
            <Chips label="Soy" options={opts(SEXES)} value={s.sex} onChange={(v) => set("sex", v)} />
          </Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Edad" htmlFor="rt-age">
              <Input id="rt-age" inputMode="numeric" className="w-full min-w-0" value={s.age} onChange={(e) => set("age", e.target.value)} />
            </Field>
            <Field label="Peso (kg)" htmlFor="rt-w">
              <Input id="rt-w" inputMode="decimal" className="w-full min-w-0" value={s.weightKg} onChange={(e) => set("weightKg", e.target.value)} />
            </Field>
            <Field label="Altura (cm)" htmlFor="rt-h">
              <Input id="rt-h" inputMode="numeric" className="w-full min-w-0" value={s.heightCm} onChange={(e) => set("heightCm", e.target.value)} />
            </Field>
          </div>
          <Field label="Experiencia entrenando">
            <Chips label="Experiencia entrenando" options={opts(EXPERIENCE)} value={s.experience} onChange={(v) => set("experience", v)} />
          </Field>
          <Field label="Actividad diaria">
            <Chips label="Actividad diaria" options={opts(ACTIVITY)} value={s.activity} onChange={(v) => set("activity", v)} />
          </Field>
          <Field label="Horas de sueño (aprox.)" htmlFor="rt-sleep">
            <Input id="rt-sleep" inputMode="decimal" className="w-24" value={s.sleepHours} onChange={(e) => set("sleepHours", e.target.value)} />
          </Field>
        </>
      ) : null}

      {step === 1 ? (
        <>
          <p className="text-muted-foreground">Marca lo que te pase. Si marcas algo, antes de empezar te pediremos que lo consultes con un profesional sanitario. Estas respuestas no se guardan.</p>
          <MultiChips
            label="Preguntas de salud"
            options={opts(PARQ)}
            value={s.parq}
            onChange={(v) => setS((x) => ({ ...x, parq: v, parqNone: v.length ? false : x.parqNone }))}
            className="grid"
          />
          <Button type="button" variant={s.parqNone ? "default" : "outline"} onClick={() => setS((x) => ({ ...x, parq: [], parqNone: !x.parqNone }))} aria-pressed={s.parqNone}>
            No me pasa nada de esto
          </Button>
        </>
      ) : null}

      {step === 2 ? (
        <>
          <p className="text-muted-foreground">Hazlos con calma y bien calentado/a; deja en blanco los que no quieras o no puedas hacer. Sirven para ajustar la rutina y dibujar tu progreso.</p>
          <div className="grid gap-2">
            {(Object.keys(TESTS) as TestKey[]).map((k) => (
              <div key={k} className="grid grid-cols-[1fr_6rem] items-center gap-2">
                <label htmlFor={`rt-${k}`}>
                  {TESTS[k].label} <span className="text-xs text-muted-foreground">({TESTS[k].unit === "s" ? "segundos" : TESTS[k].unit === "m" ? "metros" : "repeticiones"})</span>
                </label>
                <Input id={`rt-${k}`} inputMode="numeric" className="w-full min-w-0" value={s.tests[k]} onChange={(e) => set("tests", { ...s.tests, [k]: e.target.value })} />
              </div>
            ))}
          </div>
        </>
      ) : null}

      {step === 3 ? (
        <>
          <Field label="Objetivo a corto plazo">
            <Chips label="Objetivo a corto plazo" options={opts(GOALS_SHORT)} value={s.shortGoal} onChange={(v) => set("shortGoal", v)} />
          </Field>
          <Field label="En cuántas semanas">
            <Chips label="En cuántas semanas" options={SHORT_WEEKS.map((w) => ({ value: w, label: `${w} sem` }))} value={s.shortWeeks} onChange={(v) => set("shortWeeks", v)} />
          </Field>
          <Field label="Objetivo a largo plazo">
            <Chips label="Objetivo a largo plazo" options={opts(GOALS_LONG)} value={s.longGoal} onChange={(v) => set("longGoal", v)} />
          </Field>
          <Field label="Horizonte">
            <Chips label="Horizonte" options={HORIZONS.map((m) => ({ value: m, label: `${m} meses` }))} value={s.horizonMonths} onChange={(v) => set("horizonMonths", v)} />
          </Field>
        </>
      ) : null}

      {step === 4 ? (
        <>
          <Field label="Días por semana">
            <MultiChips label="Días por semana" options={WEEKDAY_LABEL.slice(0, 7).map((l, i) => ({ value: i + 1, label: l.slice(0, 3) }))} value={s.weekdays} onChange={(v) => set("weekdays", v.slice(0, 6))} />
          </Field>
          <Field label="Minutos por sesión">
            <Chips label="Minutos por sesión" options={MINUTES.map((m) => ({ value: m, label: `${m}` }))} value={s.minutes} onChange={(v) => set("minutes", v)} />
          </Field>
          <Field label="Dónde entrenas">
            <Chips label="Dónde entrenas" options={opts(LOCATIONS)} value={s.location} onChange={(v) => set("location", v)} />
          </Field>
          <Field label="Material que tienes">
            <MultiChips label="Material que tienes" options={opts(EQUIPMENT)} value={s.equipment} onChange={(v) => set("equipment", v)} />
          </Field>
          <Field label="Zonas con molestias (se evitan)">
            <MultiChips label="Zonas con molestias" options={opts(BODY_AREAS)} value={s.areas} onChange={(v) => set("areas", v)} />
          </Field>
          <Field label="Prefiero evitar">
            <MultiChips label="Prefiero evitar" options={opts(AVOID)} value={s.avoid} onChange={(v) => set("avoid", v)} />
          </Field>
          <Field label="Empiezo el" htmlFor="rt-start">
            <Input id="rt-start" type="date" className="w-44" value={s.startDate} onChange={(e) => set("startDate", e.target.value)} />
          </Field>
        </>
      ) : null}

      <div className="flex justify-between gap-2">
        <Button type="button" variant="ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>
          Atrás
        </Button>
        {step < STEPS.length - 1 ? (
          <Button type="button" disabled={!ok} onClick={() => setStep(step + 1)}>
            Siguiente
          </Button>
        ) : (
          <Button type="button" disabled={!ok || busy} onClick={submit}>
            {busy ? "Creando…" : "Crear mi rutina"}
          </Button>
        )}
      </div>
    </div>
  );
}
