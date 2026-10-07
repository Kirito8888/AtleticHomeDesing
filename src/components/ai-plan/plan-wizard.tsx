"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Chips, Field, MultiChips } from "@/components/form/chips";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select } from "@/components/ui/select";
import {
  AGE_BANDS,
  AVOID,
  BODY_AREAS,
  DISCIPLINES,
  EQUIPMENT,
  GOALS,
  INTENSITIES,
  LEVELS,
  LOCATIONS,
  MINUTES,
  SAFETY,
  STYLES,
  WEEKDAY_LABEL,
  WEEKS,
} from "@/lib/ai-plan/options";
import { api } from "@/lib/client-api";
import { CYCLE_PARTS, SYMPTOMS } from "@/lib/health/cycle";

type Opt<T extends string> = Array<{ value: T; label: string }>;
const opts = <T extends string>(o: Record<T, string>): Opt<T> => (Object.entries(o) as Array<[T, string]>).map(([value, label]) => ({ value, label }));

type Competition = { id: string; title: string; date: string };

const DAY_MS = 864e5;
function nextMonday(): string {
  const d = new Date();
  const day = (d.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + (7 - day))).toISOString().slice(0, 10);
}

/**
 * Cuestionario «Crear mi planificación»: todo con chips, desplegables y
 * selector de fecha. Los datos del ciclo se guardan aparte (cifrados) y no
 * se envían a la IA.
 */
export function PlanWizard({
  isFemale,
  hasCycle,
  presetAreas,
  competitions,
  defaultAgeBand,
}: {
  isFemale: boolean;
  hasCycle: boolean;
  presetAreas: string[];
  competitions: Competition[];
  defaultAgeBand: keyof typeof AGE_BANDS | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState<string | null>(null);

  const [goal, setGoal] = useState<keyof typeof GOALS | null>(null);
  const [discipline, setDiscipline] = useState<keyof typeof DISCIPLINES | null>("general");
  const [level, setLevel] = useState<keyof typeof LEVELS | null>(null);
  const [ageBand, setAgeBand] = useState<keyof typeof AGE_BANDS | null>(defaultAgeBand);
  const [weekdays, setWeekdays] = useState<number[]>([1, 3, 5]);
  const [locations, setLocations] = useState<Record<number, keyof typeof LOCATIONS>>({});
  const [minutes, setMinutes] = useState<number | null>(60);
  const [weeks, setWeeks] = useState<number | null>(8);
  const [startDate, setStartDate] = useState(nextMonday());
  const [equipment, setEquipment] = useState<Array<keyof typeof EQUIPMENT>>([]);
  const [areas, setAreas] = useState<Array<keyof typeof BODY_AREAS>>(presetAreas.filter((a): a is keyof typeof BODY_AREAS => a in BODY_AREAS));
  const [avoid, setAvoid] = useState<Array<keyof typeof AVOID>>([]);
  const [intensity, setIntensity] = useState<keyof typeof INTENSITIES | null>("media");
  const [style, setStyle] = useState<keyof typeof STYLES | null>("series");
  const [safety, setSafety] = useState<Array<keyof typeof SAFETY>>([]);
  const [safetyNone, setSafetyNone] = useState(false);
  const [competitionId, setCompetitionId] = useState("");

  const [cycleOn, setCycleOn] = useState<"si" | "no" | null>(hasCycle ? "si" : null);
  const [avgLength, setAvgLength] = useState(28);
  const [periodDays, setPeriodDays] = useState(5);
  const [lastStart, setLastStart] = useState("");
  const [hormonal, setHormonal] = useState<"si" | "no" | "nd" | null>(null);
  const [symptoms, setSymptoms] = useState<Array<keyof typeof SYMPTOMS>>([]);
  const [symptomParts, setSymptomParts] = useState<Array<keyof typeof CYCLE_PARTS>>([]);

  const sortedDays = useMemo(() => [...weekdays].sort((a, b) => a - b), [weekdays]);
  const competitionWeek = useMemo(() => {
    const c = competitions.find((x) => x.id === competitionId);
    if (!c) return null;
    const w = Math.floor((Date.parse(c.date) - Date.parse(startDate)) / (7 * DAY_MS)) + 1;
    return w >= 1 && w <= (weeks ?? 0) ? w : null;
  }, [competitionId, competitions, startDate, weeks]);

  const steps: Array<{ title: string; ok: boolean; body: React.ReactNode }> = [
    {
      title: "¿Qué quieres conseguir?",
      ok: Boolean(goal && discipline),
      body: (
        <>
          <Field label="Objetivo">
            <Chips label="Objetivo" options={opts(GOALS)} value={goal} onChange={setGoal} />
          </Field>
          <Field label="Disciplina">
            <Chips label="Disciplina" options={opts(DISCIPLINES)} value={discipline} onChange={setDiscipline} />
          </Field>
          {goal === "competicion" && competitions.length ? (
            <Field label="Competición objetivo" htmlFor="w-comp" hint="De tu calendario. A la IA solo le llega en qué semana cae.">
              <Select id="w-comp" value={competitionId} onChange={(e) => setCompetitionId(e.target.value)}>
                <option value="">Ninguna en concreto</option>
                {competitions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.date.split("-").reverse().join("/")} · {c.title}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
        </>
      ),
    },
    {
      title: "Tu nivel",
      ok: Boolean(level && ageBand),
      body: (
        <>
          <Field label="Experiencia entrenando">
            <Chips label="Nivel" options={opts(LEVELS)} value={level} onChange={setLevel} />
          </Field>
          <Field label="Edad">
            <Chips label="Edad" options={opts(AGE_BANDS)} value={ageBand} onChange={setAgeBand} />
          </Field>
        </>
      ),
    },
    {
      title: "¿Cuándo entrenas?",
      ok: weekdays.length > 0 && Boolean(minutes && weeks && startDate),
      body: (
        <>
          <Field label={`Días (${weekdays.length} por semana)`}>
            <MultiChips label="Días de entrenamiento" options={WEEKDAY_LABEL.map((l, i) => ({ value: i + 1, label: l.slice(0, 3) }))} value={weekdays} onChange={setWeekdays} />
          </Field>
          <Field label="Minutos por sesión">
            <Chips label="Minutos por sesión" options={MINUTES.map((m) => ({ value: m, label: `${m}` }))} value={minutes} onChange={setMinutes} />
          </Field>
          <Field label="Duración del plan (semanas)">
            <Chips label="Semanas" options={WEEKS.map((w) => ({ value: w, label: `${w}` }))} value={weeks} onChange={setWeeks} />
          </Field>
          <Field label="Empiezo el" htmlFor="w-start">
            <Input id="w-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
        </>
      ),
    },
    {
      title: "¿Dónde entrenas cada día?",
      ok: sortedDays.every((d) => locations[d]),
      body: (
        <div className="grid gap-3">
          {sortedDays.map((d) => (
            <Field key={d} label={WEEKDAY_LABEL[d - 1]}>
              <Chips label={`Sitio del ${WEEKDAY_LABEL[d - 1]}`} options={opts(LOCATIONS)} value={locations[d] ?? null} onChange={(v) => setLocations((l) => ({ ...l, [d]: v! }))} />
            </Field>
          ))}
        </div>
      ),
    },
    {
      title: "¿Qué material tienes?",
      ok: true,
      body: (
        <Field label="Marca lo que tienes a mano" hint="En el gimnasio, la pista o la piscina ya se cuenta su material. El peso corporal siempre vale.">
          <MultiChips label="Material" options={opts(EQUIPMENT).filter((o) => !["peso_corporal", "maquinas", "pista", "piscina"].includes(o.value))} value={equipment} onChange={setEquipment} />
        </Field>
      ),
    },
    {
      title: "Molestias y cosas a evitar",
      ok: true,
      body: (
        <>
          <Field label="Zonas con molestias" hint={presetAreas.length ? "Hemos marcado las de tus lesiones activas." : undefined}>
            <MultiChips label="Zonas con molestias" options={opts(BODY_AREAS)} value={areas} onChange={setAreas} />
          </Field>
          <Field label="Prefiero evitar">
            <MultiChips label="Evitar" options={opts(AVOID)} value={avoid} onChange={setAvoid} />
          </Field>
        </>
      ),
    },
    {
      title: "Cómo te gusta entrenar",
      ok: Boolean(intensity && style),
      body: (
        <>
          <Field label="Intensidad">
            <Chips label="Intensidad" options={opts(INTENSITIES)} value={intensity} onChange={setIntensity} />
          </Field>
          <Field label="Estilo">
            <Chips label="Estilo" options={opts(STYLES)} value={style} onChange={setStyle} />
          </Field>
        </>
      ),
    },
    ...(isFemale
      ? [
          {
            title: "Tu ciclo (opcional)",
            ok: cycleOn === "no" || (cycleOn === "si" && Boolean(hormonal)),
            body: (
              <>
                <p className="text-sm text-muted-foreground">
                  Si quieres, el plan te propone una versión más suave los días que sueles encontrarte peor. Estos datos se guardan cifrados, no se envían a la IA y tu entrenador
                  no los ve. Puedes borrarlos cuando quieras en Recuperación.
                </p>
                <Field label="¿Adaptar el plan a tu ciclo?">
                  <Chips
                    label="Adaptar al ciclo"
                    options={[
                      { value: "si", label: "Sí" },
                      { value: "no", label: "No, gracias" },
                    ]}
                    value={cycleOn}
                    onChange={setCycleOn}
                  />
                </Field>
                {cycleOn === "si" ? (
                  <div className="grid gap-3">
                    <Field label="¿Usas anticonceptivo hormonal?" hint="Con anticonceptivo hormonal no hay fases que estimar: se adapta solo por síntomas.">
                      <Chips
                        label="Anticonceptivo hormonal"
                        options={[
                          { value: "no", label: "No" },
                          { value: "si", label: "Sí" },
                          { value: "nd", label: "Prefiero no decirlo" },
                        ]}
                        value={hormonal}
                        onChange={setHormonal}
                      />
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Duración media del ciclo" htmlFor="w-cl">
                        <Select id="w-cl" value={avgLength} onChange={(e) => setAvgLength(Number(e.target.value))}>
                          {Array.from({ length: 25 }, (_, i) => 21 + i).map((n) => (
                            <option key={n} value={n}>
                              {n} días
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Días de regla" htmlFor="w-pd">
                        <Select id="w-pd" value={periodDays} onChange={(e) => setPeriodDays(Number(e.target.value))}>
                          {Array.from({ length: 7 }, (_, i) => 2 + i).map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    </div>
                    <Field label="Inicio de tu última regla" htmlFor="w-ls" hint="Opcional. Con ella se estima la fase de cada día.">
                      <Input id="w-ls" type="date" value={lastStart} onChange={(e) => setLastStart(e.target.value)} />
                    </Field>
                    <Field label="Síntomas que sueles tener">
                      <MultiChips label="Síntomas habituales" options={opts(SYMPTOMS)} value={symptoms} onChange={setSymptoms} />
                    </Field>
                    <Field label="¿Cuándo te cuesta más entrenar?">
                      <MultiChips label="Cuándo te cuesta más" options={opts(CYCLE_PARTS)} value={symptomParts} onChange={setSymptomParts} />
                    </Field>
                  </div>
                ) : null}
              </>
            ),
          },
        ]
      : []),
    {
      title: "Antes de empezar",
      ok: safetyNone || safety.length > 0,
      body: (
        <>
          <p className="text-sm text-muted-foreground">Por tu seguridad: ¿te pasa alguna de estas cosas?</p>
          <MultiChips
            label="Preguntas de seguridad"
            options={opts(SAFETY)}
            value={safety}
            onChange={(v) => {
              setSafety(v);
              if (v.length) setSafetyNone(false);
            }}
          />
          <Chips
            label="Ninguna"
            options={[{ value: "none", label: "No, ninguna" }]}
            value={safetyNone ? "none" : null}
            allowDeselect
            onChange={(v) => {
              setSafetyNone(v === "none");
              if (v === "none") setSafety([]);
            }}
          />
          {blocked ? (
            <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
              {blocked}
            </p>
          ) : null}
        </>
      ),
    },
  ];

  const current = steps[step];
  const last = step === steps.length - 1;

  async function generate() {
    setBusy(true);
    setBlocked(null);
    try {
      if (isFemale && cycleOn === "si" && hormonal) {
        await api("/api/health/cycle", { method: "PUT", body: { avgLength, periodDays, lastStart: lastStart || null, hormonal, symptoms, symptomParts } });
      }
      const r = await api<{ code: string; warnings: string[]; overlapDays: number }>("/api/ai-plan", {
        body: {
          goal,
          discipline,
          level,
          ageBand,
          weekdays: sortedDays,
          dayLocations: sortedDays.map((d) => locations[d]),
          minutes,
          weeks,
          startDate,
          equipment,
          areas,
          avoid,
          intensity,
          style,
          safety,
          competitionWeek,
        },
      });
      toast.success(r.warnings.length ? "Plan generado con avisos: revísalos antes de activarlo" : "Plan generado: revísalo y actívalo");
      router.push(`/planning/meso/${r.code}`);
    } catch (e) {
      const msg = (e as Error).message;
      if (/profesional sanitario/.test(msg)) setBlocked(msg);
      else toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>
            Paso {step + 1} de {steps.length}
          </span>
          <span>{current.title}</span>
        </div>
        <Progress value={((step + 1) / steps.length) * 100} aria-label="Progreso del cuestionario" />
      </div>
      <section aria-label={current.title} className="grid gap-4">
        <h2 className="text-lg font-semibold">{current.title}</h2>
        {current.body}
      </section>
      <div className="sticky bottom-20 z-10 flex gap-2 md:bottom-4">
        <Button type="button" variant="outline" className="h-11 flex-1" disabled={step === 0 || busy} onClick={() => setStep((s) => s - 1)}>
          Atrás
        </Button>
        {last ? (
          <Button type="button" className="h-11 flex-[2]" disabled={!current.ok || busy || safety.length > 0} onClick={() => void generate()}>
            <Sparkles /> {busy ? "Generando… (hasta 1 min)" : "Generar mi plan"}
          </Button>
        ) : (
          <Button type="button" className="h-11 flex-[2]" disabled={!current.ok} onClick={() => setStep((s) => s + 1)}>
            Siguiente
          </Button>
        )}
      </div>
      {last && safety.length ? (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
          Con lo que has marcado, no vamos a generar un plan: consulta antes con un profesional sanitario que te valore. Cuando te dé el visto bueno, vuelve aquí.
        </p>
      ) : null}
    </div>
  );
}
