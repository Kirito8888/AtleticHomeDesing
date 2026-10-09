"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Chips, Field, MultiChips } from "@/components/form/chips";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client-api";
import { ACHILLES_ITEMS, QUICKDASH_ITEMS, SLEEP_HABITS, type SleepHabit } from "@/lib/recovery/wellbeing";

const FIVE = [1, 2, 3, 4, 5].map((v) => ({ value: v, label: String(v) }));
const ELEVEN = Array.from({ length: 11 }, (_, v) => ({ value: v, label: String(v) }));
const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));

function useSave() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function save(body: unknown, ok: string) {
    setBusy(true);
    try {
      await api("/api/recovery/wellbeing", { body });
      toast.success(ok);
      router.refresh();
      return true;
    } catch (e) {
      toast.error((e as Error).message, { duration: 10_000 });
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, save };
}

/** 9 · Diario de sueño: horas, latencia, despertares, calidad, cafeína y hábitos. */
export function SleepForm({ today }: { today: string }) {
  const { busy, save } = useSave();
  const [s, setS] = useState({ date: today, bedtime: "23:30", wakeTime: "07:30", latency: "", awakenings: "", quality: 3 as number | null, caffeine: "", lastCaffeine: "", habits: [] as SleepHabit[] });
  const set = <K extends keyof typeof s>(k: K, v: (typeof s)[K]) => setS((x) => ({ ...x, [k]: v }));
  return (
    <form
      className="grid gap-3 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        void save(
          { kind: "SLEEP", date: s.date, bedtime: s.bedtime, wakeTime: s.wakeTime, latencyMin: num(s.latency), awakenings: num(s.awakenings), quality: s.quality, caffeineMg: num(s.caffeine) ?? 0, lastCaffeine: s.lastCaffeine || null, habits: s.habits },
          "Noche guardada",
        );
      }}
    >
      <Field label="Noche del" htmlFor="sl-date">
        <Input id="sl-date" type="date" className="w-44" value={s.date} onChange={(e) => set("date", e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Me acosté" htmlFor="sl-bed">
          <Input id="sl-bed" type="time" className="w-full min-w-0" value={s.bedtime} onChange={(e) => set("bedtime", e.target.value)} />
        </Field>
        <Field label="Me levanté" htmlFor="sl-wake">
          <Input id="sl-wake" type="time" className="w-full min-w-0" value={s.wakeTime} onChange={(e) => set("wakeTime", e.target.value)} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Minutos hasta dormirme" htmlFor="sl-lat">
          <Input id="sl-lat" inputMode="numeric" className="w-full min-w-0" value={s.latency} onChange={(e) => set("latency", e.target.value)} />
        </Field>
        <Field label="Despertares" htmlFor="sl-awk">
          <Input id="sl-awk" inputMode="numeric" className="w-full min-w-0" value={s.awakenings} onChange={(e) => set("awakenings", e.target.value)} />
        </Field>
      </div>
      <Field label="Calidad del sueño (1-5)">
        <Chips label="Calidad del sueño" options={FIVE} value={s.quality} onChange={(v) => set("quality", v)} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Cafeína del día (mg)" htmlFor="sl-caf" hint="Café ≈ 80 mg; té ≈ 40; lata de cola ≈ 35">
          <Input id="sl-caf" inputMode="numeric" className="w-full min-w-0" value={s.caffeine} onChange={(e) => set("caffeine", e.target.value)} />
        </Field>
        <Field label="Última cafeína" htmlFor="sl-lastcaf">
          <Input id="sl-lastcaf" type="time" className="w-full min-w-0" value={s.lastCaffeine} onChange={(e) => set("lastCaffeine", e.target.value)} />
        </Field>
      </div>
      <Field label="Hábitos de la noche">
        <MultiChips label="Hábitos de la noche" options={(Object.keys(SLEEP_HABITS) as SleepHabit[]).map((k) => ({ value: k, label: SLEEP_HABITS[k] }))} value={s.habits} onChange={(v) => set("habits", v)} />
      </Field>
      <Button type="submit" disabled={busy || !s.quality}>
        Guardar noche
      </Button>
    </form>
  );
}

/** 14 · Ánimo, estrés y energía (1-5). */
export function MoodForm({ today }: { today: string }) {
  const { busy, save } = useSave();
  const [mood, setMood] = useState<number | null>(null);
  const [stress, setStress] = useState<number | null>(null);
  const [energy, setEnergy] = useState<number | null>(null);
  return (
    <form
      className="grid gap-3 text-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await save({ kind: "MOOD", date: today, mood, stress, energy }, "Ánimo guardado")) {
          setMood(null);
          setStress(null);
          setEnergy(null);
        }
      }}
    >
      <Field label="Ánimo (1 muy bajo · 5 muy bueno)">
        <Chips label="Ánimo" options={FIVE} value={mood} onChange={setMood} />
      </Field>
      <Field label="Estrés (1 nada · 5 muchísimo)">
        <Chips label="Estrés" options={FIVE} value={stress} onChange={setStress} />
      </Field>
      <Field label="Energía (opcional)">
        <Chips label="Energía" options={FIVE} value={energy} onChange={setEnergy} />
      </Field>
      <Button type="submit" disabled={busy || !mood || !stress}>
        Guardar ánimo de hoy
      </Button>
    </form>
  );
}

type ScaleKind = "EVA" | "QUICKDASH" | "ACHILLES";
/** 10 · Escalas: dolor (EVA 0-10), QuickDASH y Aquiles (adaptación VISA-A). */
export function ScaleForm({ today }: { today: string }) {
  const { busy, save } = useSave();
  const [scale, setScale] = useState<ScaleKind | null>("EVA");
  const [area, setArea] = useState("");
  const [eva, setEva] = useState<number | null>(null);
  const [dash, setDash] = useState<Array<number | null>>(QUICKDASH_ITEMS.map(() => null));
  const [ach, setAch] = useState<Array<number | null>>(ACHILLES_ITEMS.map(() => null));
  const body =
    scale === "EVA" ? { kind: "SCALE", scale, date: today, area: area.trim() || "general", score: eva } : scale === "QUICKDASH" ? { kind: "SCALE", scale, date: today, answers: dash } : { kind: "SCALE", scale, date: today, answers: ach };
  const ready = scale === "EVA" ? eva != null : scale === "QUICKDASH" ? dash.filter((v) => v != null).length >= 10 : ach.every((v) => v != null);
  return (
    <form
      className="grid gap-3 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        void save(body, "Escala guardada");
      }}
    >
      <Chips
        label="Escala"
        options={[
          { value: "EVA" as const, label: "Dolor (EVA)" },
          { value: "QUICKDASH" as const, label: "Brazo y hombro (QuickDASH)" },
          { value: "ACHILLES" as const, label: "Aquiles" },
        ]}
        value={scale}
        onChange={setScale}
      />
      {scale === "EVA" ? (
        <>
          <Field label="Zona" htmlFor="sc-area">
            <Input id="sc-area" maxLength={40} placeholder="p. ej. codo derecho" value={area} onChange={(e) => setArea(e.target.value)} />
          </Field>
          <Field label="Dolor ahora (0 nada · 10 el peor)">
            <Chips label="Dolor ahora" options={ELEVEN} value={eva} onChange={setEva} />
          </Field>
        </>
      ) : null}
      {scale === "QUICKDASH" ? (
        <ol className="grid gap-2" aria-label="Preguntas QuickDASH">
          <li className="text-xs text-muted-foreground">Última semana · 1 sin dificultad … 5 incapaz</li>
          {QUICKDASH_ITEMS.map((q, i) => (
            <li key={q} className="grid gap-1">
              <span>{q}</span>
              <Chips label={q} options={FIVE} value={dash[i]} onChange={(v) => setDash(dash.map((x, j) => (j === i ? v : x)))} />
            </li>
          ))}
        </ol>
      ) : null}
      {scale === "ACHILLES" ? (
        <ol className="grid gap-2" aria-label="Preguntas Aquiles">
          {ACHILLES_ITEMS.map((q, i) => (
            <li key={q} className="grid gap-1">
              <span>{q}</span>
              <Chips label={q} options={ELEVEN} value={ach[i]} onChange={(v) => setAch(ach.map((x, j) => (j === i ? v : x)))} />
            </li>
          ))}
        </ol>
      ) : null}
      <Button type="submit" disabled={busy || !ready}>
        Guardar escala
      </Button>
    </form>
  );
}

export function DeleteWellbeing({ id }: { id: string }) {
  const router = useRouter();
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      aria-label="Borrar registro"
      onClick={async () => {
        try {
          await api(`/api/recovery/wellbeing/${id}`, { method: "DELETE" });
          router.refresh();
        } catch (e) {
          toast.error((e as Error).message);
        }
      }}
    >
      Borrar
    </Button>
  );
}
