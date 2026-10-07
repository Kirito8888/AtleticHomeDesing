import { addDays, dateOnly, startOfIsoWeek, toIsoDay } from "@/lib/dates";
import type { PlanBlock, PlanRow, SessionKind } from "@/lib/planning/plan-import/types";

import { AGE_BANDS, AVOID, BODY_AREAS, DISCIPLINES, EQUIPMENT, GOALS, LEVELS, LOCATIONS, locationOf, type PlanRequest, WEEKDAY_LABEL } from "./options";
import type { AiDay, AiExercise, AiPlan } from "./schema";

export type ExpandedDay = {
  key: string;
  date: string;
  week: number;
  weekday: number;
  code: string;
  title: string;
  type: SessionKind;
  durationMin: number;
  weekTitle: string;
  location: string | null;
  blocks: PlanBlock[];
  light: { durationMin: number; blocks: PlanBlock[] };
};

export type ExpandedPlan = {
  code: string;
  name: string;
  start: string;
  end: string;
  intro: Array<{ title: string | null; text: string }>;
  weeks: Array<{ variant: null; number: number; title: string; start: string; end: string; text: string }>;
  days: ExpandedDay[];
};

/**
 * Convierte el plan de la IA (semanas tipo por fase) en días con fecha.
 * La progresión de volumen la controla la app, no la IA: con progression=+1
 * se añaden ≈10 % de series por semana (redondeando hacia abajo, en reparto
 * rotatorio y con un máximo de 6 series por ejercicio); con −1 se quitan.
 */
export function expandAiPlan(plan: AiPlan, r: PlanRequest, code: string): ExpandedPlan {
  const start = dateOnly(r.startDate);
  const firstMonday = startOfIsoWeek(start);
  const days: ExpandedDay[] = [];
  const weeks: ExpandedPlan["weeks"] = [];
  let week = 0;
  for (const phase of plan.phases) {
    for (let i = 0; i < phase.weeks; i++) {
      week++;
      const monday = addDays(firstMonday, (week - 1) * 7);
      weeks.push({ variant: null, number: week, title: phase.name, start: toIsoDay(monday), end: toIsoDay(addDays(monday, 6)), text: phase.focus });
      for (const d of [...phase.days].sort((a, b) => a.weekday - b.weekday)) {
        const date = addDays(monday, d.weekday - 1);
        if (date < start) continue; // primera semana incompleta: el plan empieza el día elegido
        const iso = toIsoDay(date);
        const exercises = progress(d.exercises, phase.progression, i);
        const location = locationOf(r, d.weekday);
        days.push({
          key: `${code}|-|${iso}|1`,
          date: iso,
          week,
          weekday: d.weekday,
          code: `S${week}`,
          title: d.title,
          type: d.type,
          durationMin: d.durationMin,
          weekTitle: phase.name,
          location,
          blocks: dayBlocks(d, exercises, location, phase.focus),
          light: {
            durationMin: d.light.durationMin,
            blocks: [
              { kind: "text", title: "Versión suave", text: d.light.note || "Menos volumen e intensidad, sin impactos." },
              { kind: "text", title: "Calentamiento", text: d.warmup },
              { kind: "table", rows: d.light.exercises.map(toRow) },
            ],
          },
        });
      }
    }
  }
  const first = days[0]?.date ?? r.startDate;
  const last = days.at(-1)?.date ?? r.startDate;
  return {
    code,
    name: plan.title,
    start: first,
    end: last,
    intro: [
      { title: "Resumen", text: plan.summary },
      { title: "Por qué este plan", text: plan.why },
      { title: "Lo que pediste", text: describeRequest(r) },
      { title: "Fases", text: plan.phases.map((p) => `${p.name} (${p.weeks} sem.${p.deload ? ", descarga" : ""}): ${p.focus}`).join(" · ") },
    ],
    weeks,
    days,
  };
}

function dayBlocks(d: AiDay, exercises: AiExercise[], location: string | null, focus: string): PlanBlock[] {
  const blocks: PlanBlock[] = [];
  if (location) blocks.push({ kind: "text", title: "Dónde", text: LOCATIONS[location as keyof typeof LOCATIONS] ?? location });
  blocks.push({ kind: "text", title: "Calentamiento", text: d.warmup });
  blocks.push({ kind: "table", rows: exercises.map(toRow) });
  if (d.cooldown) blocks.push({ kind: "text", title: "Vuelta a la calma", text: d.cooldown });
  if (focus) blocks.push({ kind: "why", text: focus });
  return blocks;
}

export function toRow(e: AiExercise): PlanRow {
  return {
    exercise: e.name,
    sets: `${e.sets} × ${e.reps}`,
    load: e.intensity,
    rir: "",
    rest: e.rest,
    how: e.how,
    ramp: false,
    equipment: e.equipment,
    alternatives: e.alternatives,
  };
}

/** Series de la semana `i` (0 = primera) de una fase. */
export function progress(exercises: AiExercise[], direction: number, i: number): AiExercise[] {
  if (!direction || i === 0) return exercises;
  const base = exercises.reduce((a, e) => a + e.sets, 0);
  let delta = Math.floor(base * 0.1 * i) * Math.sign(direction);
  const out = exercises.map((e) => ({ ...e }));
  for (let guard = 0; delta !== 0 && guard < 200; guard++) {
    const idx = guard % out.length;
    const e = out[idx];
    if (delta > 0 && e.sets < 6) {
      e.sets++;
      delta--;
    } else if (delta < 0 && e.sets > 1) {
      e.sets--;
      delta++;
    }
  }
  return out;
}

export function describeRequest(r: PlanRequest): string {
  const days = r.weekdays.map((wd) => `${WEEKDAY_LABEL[wd - 1].toLowerCase()} (${LOCATIONS[locationOf(r, wd)!]})`).join(", ");
  return [
    `${GOALS[r.goal]} · ${DISCIPLINES[r.discipline]} · ${LEVELS[r.level]} · edad ${AGE_BANDS[r.ageBand]}.`,
    `${r.weeks} semanas desde el ${r.startDate.split("-").reverse().join("/")}, ${r.minutes} min: ${days}.`,
    r.equipment.length ? `Material: ${r.equipment.map((e) => EQUIPMENT[e]).join(", ")}.` : "Sin material propio.",
    r.areas.length ? `Molestias: ${r.areas.map((a) => BODY_AREAS[a]).join(", ")}.` : "",
    r.avoid.length ? `Evitar: ${r.avoid.map((a) => AVOID[a]).join(", ")}.` : "",
    r.competitionWeek ? `Competición al final de la semana ${r.competitionWeek}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}
