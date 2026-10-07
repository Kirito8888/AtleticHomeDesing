"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Chips, Field } from "@/components/form/chips";
import { IMPLEMENTS, technicalPayload } from "@/components/training/technical-logger";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/client-api";
import { formatNum, TECHNICAL_EVENT_LABEL } from "@/lib/format";
import { sheetBest, type SheetAttempt } from "@/lib/planning/competition";

const parseNum = (s: string) => {
  const n = Number(s.replace(",", "."));
  return s.trim() === "" || Number.isNaN(n) ? null : n;
};
const EMPTY: SheetAttempt = { markM: null, isFoul: false, windMs: null };

/** Hoja de intentos 1–6: se guarda como sesión técnica de competición. */
export function AttemptSheet({ date, title }: { date: string; title: string }) {
  const router = useRouter();
  const [event, setEvent] = useState("JAVELIN");
  const [implementWeightG, setImplement] = useState<number | null>(800);
  const [rows, setRows] = useState<Array<SheetAttempt & { raw: string; rawWind: string }>>(Array.from({ length: 6 }, () => ({ ...EMPTY, raw: "", rawWind: "" })));
  const [saving, setSaving] = useState(false);
  const setRow = (i: number, patch: Partial<(typeof rows)[number]>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const used = rows.filter((r) => r.isFoul || r.markM != null);
  const best = sheetBest(rows);
  const imps = IMPLEMENTS[event];

  async function save() {
    if (!used.length) return toast.error("Apunta al menos un intento");
    setSaving(true);
    try {
      const technical = technicalPayload({
        event,
        implementWeightG,
        approachType: "FULL",
        approachSteps: null,
        isCompetition: true,
        focus: "",
        attempts: used.map((r, i) => ({ id: i + 1, markM: r.markM, isFoul: r.isFoul, rating: null, windMs: r.windMs, runUpNotes: "", blockNotes: "", releaseNotes: "" })),
      });
      const s = await api<{ id: string; newPersonalRecords: unknown[] }>("/api/training/sessions", {
        body: { date, title, status: "COMPLETED", type: "TECHNICAL", discipline: event.includes("JUMP") || event === "POLE_VAULT" ? "JUMPS" : "THROWS", technical },
      });
      toast.success(`Competición guardada${best != null ? ` · mejor ${formatNum(best, 2)} m` : ""}${s.newPersonalRecords.length ? " · ¡marca personal! 🎉" : ""}`);
      router.push(`/training/${s.id}`);
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Prueba" htmlFor="c-event">
          <Select
            id="c-event"
            value={event}
            onChange={(e) => {
              setEvent(e.target.value);
              const list = IMPLEMENTS[e.target.value];
              setImplement(list ? list[list.length - 1] : null);
            }}
          >
            {Object.entries(TECHNICAL_EVENT_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        {imps ? (
          <Field label="Implemento">
            <Chips label="Implemento" value={implementWeightG} onChange={setImplement} options={imps.map((g) => ({ value: g, label: g >= 1000 ? `${formatNum(g / 1000, 2)} kg` : `${g} g` }))} />
          </Field>
        ) : null}
      </div>
      <table className="w-full text-sm">
        <caption className="sr-only">Intentos</caption>
        <thead className="text-xs text-muted-foreground">
          <tr>
            <th className="w-8 text-left font-normal">#</th>
            <th className="text-left font-normal">Marca (m)</th>
            <th className="w-16 text-center font-normal">Nulo</th>
            <th className="w-20 text-left font-normal">Viento</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="py-1 font-medium tabular-nums">{i + 1}</td>
              <td className="py-1 pr-2">
                <Input
                  aria-label={`Marca intento ${i + 1}`}
                  inputMode="decimal"
                  disabled={r.isFoul}
                  value={r.raw}
                  onChange={(e) => setRow(i, { raw: e.target.value, markM: parseNum(e.target.value) })}
                />
              </td>
              <td className="py-1 text-center">
                <input type="checkbox" className="size-5" aria-label={`Nulo intento ${i + 1}`} checked={r.isFoul} onChange={(e) => setRow(i, { isFoul: e.target.checked, ...(e.target.checked ? { markM: null, raw: "" } : {}) })} />
              </td>
              <td className="py-1">
                <Input aria-label={`Viento intento ${i + 1}`} inputMode="decimal" value={r.rawWind} onChange={(e) => setRow(i, { rawWind: e.target.value, windMs: parseNum(e.target.value) })} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-sm">
        Mejor: <span className="font-semibold tabular-nums">{best != null ? `${formatNum(best, 2)} m` : "—"}</span>
        <span className="text-muted-foreground"> · {used.length} intentos</span>
      </p>
      <Button type="button" size="lg" onClick={save} disabled={saving}>
        {saving ? "Guardando…" : "Guardar la competición"}
      </Button>
    </div>
  );
}
