"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Chips, Field } from "@/components/form/chips";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/client-api";
import { formatDate, formatNum } from "@/lib/format";
import { apreAdjust } from "@/lib/training/rm";

type Rm = { id: string; name: string; key: string; kg: number; perHand: boolean; source: string; effectiveFrom: string };
type Option = { id: string; name: string };
type PlanRm = { name: string; kg: number; perHand: boolean; used: boolean; from: string; current: number | null };

const SOURCE: Record<string, string> = { MANUAL: "a mano", PLAN: "del plan", TEST: "serie de test", APRE: "APRE" };
const num = (s: string) => Number(s.replace(",", "."));

export function RmManager({ rms, exercises, unlinked }: { rms: Rm[]; exercises: Option[]; unlinked: { noRm: string[]; noCatalog: string[] } }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [kg, setKg] = useState("");
  const [perHand, setPerHand] = useState(false);
  const [preview, setPreview] = useState<PlanRm[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [testPick, setTestName] = useState("");
  // Si la tabla estaba vacía al cargar, al añadir la primera RM se usa esa.
  const testName = rms.some((r) => r.name === testPick) ? testPick : (rms[0]?.name ?? "");
  const [testKg, setTestKg] = useState("");
  const [testReps, setTestReps] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<{ estimated: number; change: number | null; update: boolean; current: number | null; threshold: number } | null>(null);
  const [apreProto, setApreProto] = useState<3 | 6 | 10 | null>(6);
  const [apreReps, setApreReps] = useState<number | null>(null);

  async function run<T>(fn: () => Promise<T>, ok?: string) {
    setBusy(true);
    try {
      const r = await fn();
      if (ok) toast.success(ok);
      return r;
    } catch (e) {
      toast.error((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="gap-3 py-4">
        <CardHeader className="px-4">
          <CardTitle className="text-sm">Mi tabla de RM</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 px-4 text-sm">
          {rms.length ? (
            <ul className="grid gap-1.5" aria-label="RM vigentes">
              {rms.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2">
                  <span className="min-w-0">
                    <span className="font-medium">{r.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {SOURCE[r.source] ?? r.source} · {formatDate(r.effectiveFrom)}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="font-semibold tabular-nums">
                      {formatNum(r.kg, 2)} kg{r.perHand ? " /mano" : ""}
                    </span>
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:underline"
                      onClick={() => void run(() => api(`/api/training/rm/${r.id}`, { method: "DELETE" }), "Borrado").then(() => router.refresh())}
                    >
                      Borrar
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">Sin RM todavía. Impórtalas del anexo de tu plan o añádelas.</p>
          )}
          <form
            className="grid gap-2 border-t pt-3"
            onSubmit={(e) => {
              e.preventDefault();
              void run(() => api("/api/training/rm", { body: { name, kg: num(kg), perHand } }), "RM guardada").then((r) => {
                if (r) {
                  setKg("");
                  router.refresh();
                }
              });
            }}
          >
            <Field label="Ejercicio" htmlFor="rm-name">
              <Input id="rm-name" list="rm-exercises" value={name} onChange={(e) => setName(e.target.value)} placeholder="Sentadilla frontal" required />
              <datalist id="rm-exercises">
                {exercises.map((x) => (
                  <option key={x.id} value={x.name} />
                ))}
              </datalist>
            </Field>
            <div className="flex items-end gap-2">
              <Field label="RM (kg)" htmlFor="rm-kg">
                <Input id="rm-kg" inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value)} required className="w-28" />
              </Field>
              <label className="mb-2 flex items-center gap-2">
                <input type="checkbox" className="size-4" checked={perHand} onChange={(e) => setPerHand(e.target.checked)} /> Por mano
              </label>
              <Button type="submit" size="sm" className="mb-0.5" disabled={busy || !name || !(num(kg) > 0)}>
                Añadir
              </Button>
            </div>
          </form>
          <div className="grid gap-2 border-t pt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit"
              disabled={busy}
              onClick={() =>
                void run(() => api<PlanRm[]>("/api/training/rm/import")).then((p) => {
                  if (!p) return;
                  if (!p.length) toast.info("Tu plan importado no trae tabla de RM");
                  setPreview(p);
                  setPicked(new Set(p.filter((x) => x.used && x.current !== x.kg).map((x) => x.name)));
                })
              }
            >
              Importar del plan (anexo «Mi tabla de RM»)
            </Button>
            {preview?.length ? (
              <div className="grid gap-1" aria-label="RM del plan">
                {preview.map((p) => (
                  <label key={p.name} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="size-4"
                      checked={picked.has(p.name)}
                      onChange={(e) => {
                        const n = new Set(picked);
                        if (e.target.checked) n.add(p.name);
                        else n.delete(p.name);
                        setPicked(n);
                      }}
                    />
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    <span className="tabular-nums">{formatNum(p.kg, 2)} kg</span>
                    <span className="w-20 text-right text-xs text-muted-foreground">{p.current != null ? (p.current === p.kg ? "ya está" : `ahora ${formatNum(p.current, 2)}`) : p.used ? "" : "no se usa"}</span>
                  </label>
                ))}
                <Button
                  type="button"
                  size="sm"
                  className="mt-1 w-fit"
                  disabled={busy || !picked.size}
                  onClick={() =>
                    void run(() => api("/api/training/rm/import", { body: { items: preview.filter((p) => picked.has(p.name)).map(({ name: n, kg: k, perHand: h }) => ({ name: n, kg: k, perHand: h })) } }), `${picked.size} RM importadas`).then(
                      (r) => {
                        if (r) {
                          setPreview(null);
                          router.refresh();
                        }
                      },
                    )
                  }
                >
                  Guardar {picked.size} RM
                </Button>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <div className="grid content-start gap-4">
        <Card className="gap-3 py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-sm">Serie de test → nueva RM</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 px-4 text-sm">
            <p className="text-xs text-muted-foreground">RM = carga × (1 + reps/30) (Epley). Solo se actualiza si cambia lo que marques en tus reglas (5 % por defecto).</p>
            <Field label="Ejercicio" htmlFor="t-name">
              <Select id="t-name" value={testName} onChange={(e) => setTestName(e.target.value)}>
                {rms.map((r) => (
                  <option key={r.id} value={r.name}>
                    {r.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Carga de la serie (kg)" htmlFor="t-kg">
              <Input id="t-kg" inputMode="decimal" value={testKg} onChange={(e) => setTestKg(e.target.value)} className="w-28" />
            </Field>
            <Field label="Repeticiones con técnica limpia">
              <Chips label="Repeticiones de la serie de test" options={Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: String(i + 1) }))} value={testReps} onChange={setTestReps} />
            </Field>
            <Button
              type="button"
              size="sm"
              className="w-fit"
              disabled={busy || !testName || !(num(testKg) > 0) || !testReps}
              onClick={() => void run(() => api<typeof testResult>("/api/training/rm/test", { body: { name: testName, kg: num(testKg), reps: testReps } })).then((r) => setTestResult(r))}
            >
              Calcular
            </Button>
            {testResult ? (
              <div role="status" className="rounded-md bg-muted/60 p-2">
                RM estimada: <strong>{formatNum(testResult.estimated, 1)} kg</strong>
                {testResult.change != null ? ` (${testResult.change > 0 ? "+" : ""}${formatNum(testResult.change * 100, 1)} % frente a ${formatNum(testResult.current ?? 0, 2)})` : ""}.{" "}
                {testResult.update ? "Cambia lo suficiente: conviene actualizarla." : "Diferencia pequeña: puede ser el día, no el bloque. Mantén la de tu tabla."}
                {testResult.update ? (
                  <Button
                    type="button"
                    size="sm"
                    className="mt-2"
                    disabled={busy}
                    onClick={() =>
                      void run(() => api("/api/training/rm/test", { body: { name: testName, kg: num(testKg), reps: testReps, apply: true } }), "RM actualizada").then(() => {
                        setTestResult(null);
                        router.refresh();
                      })
                    }
                  >
                    Guardar nueva RM
                  </Button>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="gap-3 py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-sm">APRE: ajustar la carga</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 px-4 text-sm">
            <Field label="Protocolo">
              <Chips
                label="Protocolo APRE"
                options={[
                  { value: 3, label: "APRE 3" },
                  { value: 6, label: "APRE 6" },
                  { value: 10, label: "APRE 10" },
                ]}
                value={apreProto}
                onChange={setApreProto}
              />
            </Field>
            <Field label="Repeticiones en la serie 3 (al máximo)">
              <Chips label="Repeticiones serie 3" options={Array.from({ length: 16 }, (_, i) => ({ value: i, label: String(i) }))} value={apreReps} onChange={setApreReps} />
            </Field>
            {apreProto && apreReps != null ? (
              <p role="status" className="rounded-md bg-muted/60 p-2">
                Serie 4 y próxima sesión: <strong>{apreAdjust(apreProto, apreReps).text}</strong>.
              </p>
            ) : null}
          </CardContent>
        </Card>

        {unlinked.noRm.length || unlinked.noCatalog.length ? (
          <Card className="gap-3 py-4">
            <CardHeader className="px-4">
              <CardTitle className="text-sm">Enlazar ejercicios del plan</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 px-4 text-sm">
              <p className="text-xs text-muted-foreground">Elige una vez a qué corresponde cada nombre del plan; se recuerda para los kg y para registrar las series.</p>
              {unlinked.noRm.map((n) => (
                <label key={`rm-${n}`} className="grid gap-1">
                  <span className="text-xs">{n} → RM de…</span>
                  <Select
                    aria-label={`RM para ${n}`}
                    value=""
                    disabled={busy}
                    onChange={(e) => e.target.value && void run(() => api("/api/training/aliases", { body: { planName: n, rmKey: e.target.value } }), "Enlazado").then(() => router.refresh())}
                  >
                    <option value="">Elegir…</option>
                    {rms.map((r) => (
                      <option key={r.id} value={r.key}>
                        {r.name}
                      </option>
                    ))}
                  </Select>
                </label>
              ))}
              {unlinked.noCatalog.map((n) => (
                <label key={`ex-${n}`} className="grid gap-1">
                  <span className="text-xs">{n} → ejercicio del catálogo</span>
                  <Select
                    aria-label={`Ejercicio para ${n}`}
                    value=""
                    disabled={busy}
                    onChange={(e) => e.target.value && void run(() => api("/api/training/aliases", { body: { planName: n, exerciseId: e.target.value } }), "Enlazado").then(() => router.refresh())}
                  >
                    <option value="">Elegir…</option>
                    {exercises.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </Select>
                </label>
              ))}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
