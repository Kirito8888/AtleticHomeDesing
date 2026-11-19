"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Download, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { api } from "@/lib/client-api";
import { formatDate, formatDuration, formatNum } from "@/lib/format";
import {
  colLetter,
  contributesLoad,
  detectHeaderRow,
  guessMapping,
  guessUnits,
  HistoryImportError,
  parseRows,
  readSpreadsheet,
  type Field,
  attachSets,
  findSeriesHeader,
  parseSeriesSheet,
  type HistoryRow,
  type Mapping,
  type ParseResult,
  type Spreadsheet,
} from "@/lib/training/history-import";

type Status = "new" | "duplicate" | "duplicate_in_file";
type Counts = { new: number; duplicate: number; duplicateInFile: number; sets?: number; noLoad: number; from: string | null; to: string | null };
type Preview = { items: Array<{ line: number; status: Status }>; counts: Counts };

const FIELD_LABEL: Record<Field, string> = {
  date: "Fecha (obligatoria)",
  title: "Título",
  type: "Deporte / tipo",
  duration: "Duración",
  distance: "Distancia",
  rpe: "RPE (0–10)",
  load: "Carga (TSS)",
};
const FIELD_ORDER: Field[] = ["date", "title", "type", "duration", "distance", "rpe", "load"];
const STATUS_LABEL: Record<Status, string> = { new: "Nueva", duplicate: "Ya existe", duplicate_in_file: "Repetida en el fichero" };

/** Importar historial desde Excel/CSV: leer en el navegador, mapear columnas, revisar y guardar (borrador → aceptar). */
export function HistoryImport() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [book, setBook] = useState<Spreadsheet | null>(null);
  const [fileName, setFileName] = useState("");
  const [sheetIdx, setSheetIdx] = useState(0);
  const [headerIdx, setHeaderIdx] = useState(0);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [durationDefault, setDurationDefault] = useState("");
  const [rpeDefault, setRpeDefault] = useState("");
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [done, setDone] = useState<{ created: number; duplicates: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const sheet = book?.sheets[sheetIdx] ?? null;
  const header = sheet?.rows[headerIdx] ?? [];
  const columns = Array.from({ length: Math.max(header.length, ...(sheet?.rows.slice(headerIdx, headerIdx + 20).map((r) => r.length) ?? [0])) }, (_, i) => i);
  const colName = (i: number) => `${colLetter(i)} · ${(header[i] ?? "").trim().slice(0, 28) || "(sin título)"}`;

  const reset = () => {
    setBook(null);
    setMapping(null);
    setParsed(null);
    setPreview(null);
    setDone(null);
    setFileName("");
  };

  const pick = (b: Spreadsheet, si: number) => {
    const rows = b.sheets[si].rows;
    const h = detectHeaderRow(rows);
    setSheetIdx(si);
    setHeaderIdx(h);
    setMapping(guessMapping(rows[h] ?? []));
    setParsed(null);
    setPreview(null);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    reset();
    try {
      const b = readSpreadsheet(new Uint8Array(await file.arrayBuffer()), file.name);
      // La hoja con más columnas reconocidas (el registro suele ser la primera).
      const best = b.sheets.map((s, i) => [i, guessMapping(s.rows[detectHeaderRow(s.rows)] ?? []).date != null ? 1 : 0] as const).sort((x, y) => y[1] - x[1] || x[0] - y[0])[0][0];
      setBook(b);
      setFileName(file.name);
      pick(b, best);
    } catch (e) {
      toast.error(e instanceof HistoryImportError ? e.message : "No se pudo leer el fichero");
    }
  };

  const review = async () => {
    if (!sheet || !mapping) return;
    if (mapping.date == null) return void toast.error("Elige la columna de la fecha");
    const dMin = Number(durationDefault.replace(",", "."));
    const rpe = Number(rpeDefault.replace(",", "."));
    if (rpeDefault && !(rpe > 0 && rpe <= 10)) return void toast.error("El RPE por defecto va de 1 a 10");
    if (durationDefault && !(dMin > 0 && dMin <= 1440)) return void toast.error("La duración por defecto va de 1 a 1440 minutos");
    const result = parseRows(sheet, headerIdx, mapping, {
      date1904: book?.date1904,
      units: guessUnits(header, mapping),
      defaults: { durationMin: durationDefault ? dMin : null, rpe: rpeDefault ? rpe : null },
    });
    // Hoja «Series» (si el libro la trae): las series se añaden a la sesión de su fecha
    const seriesSheet = book?.sheets.find((s) => s !== sheet && findSeriesHeader(s));
    if (seriesSheet) {
      const ser = parseSeriesSheet(seriesSheet, book?.date1904);
      const att = attachSets(result.rows, ser.byDate);
      result.rows = att.rows;
      result.issues.push(...ser.issues);
      for (const d of att.unmatched) result.issues.push({ line: 0, message: `Hoja Series: el ${d} no tiene sesión en la hoja principal; sus series no se importan` });
    }
    setParsed(result);
    setPreview(null);
    if (!result.rows.length) return void toast.error("No hay ninguna fila con fecha válida: revisa la columna de la fecha y la fila de cabecera");
    if (result.rows.length > 1000) return void toast.error("Máximo 1000 sesiones por importación: divide el fichero");
    setBusy(true);
    try {
      setPreview(await api<Preview>("/api/training/history-import", { body: { rows: result.rows } }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!parsed) return;
    setBusy(true);
    try {
      const r = await api<{ created: number; duplicates: number }>("/api/training/history-import?save=1", { body: { rows: parsed.rows } });
      setDone(r);
      setPreview(null);
      setParsed(null);
      toast.success(`${r.created} sesiones importadas`);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const setField = (f: Field, v: string) => setMapping((m) => (m ? { ...m, [f]: v === "" ? null : Number(v) } : m));
  const toggleNote = (i: number) => setMapping((m) => (m ? { ...m, notes: m.notes.includes(i) ? m.notes.filter((x) => x !== i) : [...m.notes, i].sort((a, b) => a - b) } : m));
  const statusOf = new Map(preview?.items.map((i) => [i.line, i.status]));
  const rowsShown: HistoryRow[] = parsed?.rows.slice(0, 40) ?? [];

  return (
    <Sheet open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="min-h-11" data-testid="hist-open">
          <FileSpreadsheet /> Importar historial
        </Button>
      </SheetTrigger>
      <SheetContent className="sm:w-[34rem]" data-testid="hist-sheet">
        <SheetHeader>
          <SheetTitle>Importar historial</SheetTitle>
          <SheetDescription>Excel (.xlsx) o CSV. Se lee en tu navegador; no se guarda nada hasta que lo aceptes.</SheetDescription>
        </SheetHeader>

        {done ? (
          <div className="grid gap-3 text-sm" data-testid="hist-done">
            <p className="font-medium" data-testid="hist-done-text">
              {done.created} sesiones importadas · {done.duplicates} ya existían.
            </p>
            <p className="text-muted-foreground">La carga (CTL/ATL/TSB) se ha recalculado una sola vez.</p>
            <Button asChild className="min-h-11">
              <Link href="/training/performance" onClick={() => setOpen(false)}>Ver carga</Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 text-sm">
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm" className="min-h-11">
                <a href="/api/training/history-import/template?format=xlsx" data-testid="hist-tpl-xlsx"><Download /> Plantilla Excel</a>
              </Button>
              <Button asChild variant="outline" size="sm" className="min-h-11">
                <a href="/api/training/history-import/template?format=csv" data-testid="hist-tpl-csv"><Download /> Plantilla CSV</a>
              </Button>
            </div>
            <input
              type="file"
              accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              aria-label="Fichero de historial"
              data-testid="hist-file"
              className="text-sm file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5"
              onChange={(e) => void onFile(e.target.files?.[0])}
            />

            {book && mapping && sheet ? (
              <div className="grid gap-3" data-testid="hist-mapping">
                <p className="text-muted-foreground">{fileName} · {sheet.rows.length} filas</p>
                {book.sheets.length > 1 ? (
                  <label className="grid gap-1">
                    <span className="font-medium">Hoja</span>
                    <Select value={sheetIdx} aria-label="Hoja" onChange={(e) => pick(book, Number(e.target.value))}>
                      {book.sheets.map((s, i) => <option key={s.name} value={i}>{s.name}</option>)}
                    </Select>
                  </label>
                ) : null}
                <label className="grid gap-1">
                  <span className="font-medium">Fila de cabecera</span>
                  <Select
                    value={headerIdx}
                    aria-label="Fila de cabecera"
                    onChange={(e) => {
                      const h = Number(e.target.value);
                      setHeaderIdx(h);
                      setMapping(guessMapping(sheet.rows[h] ?? []));
                      setParsed(null);
                      setPreview(null);
                    }}
                  >
                    {sheet.rows.slice(0, 15).map((r, i) => <option key={i} value={i}>Fila {i + 1}: {r.filter(Boolean).join(" | ").slice(0, 40) || "(vacía)"}</option>)}
                  </Select>
                </label>
                {FIELD_ORDER.map((f) => (
                  <label key={f} className="grid gap-1">
                    <span className="font-medium">{FIELD_LABEL[f]}</span>
                    <Select value={mapping[f] ?? ""} aria-label={FIELD_LABEL[f]} data-testid={`hist-map-${f}`} onChange={(e) => setField(f, e.target.value)}>
                      <option value="">— ninguna —</option>
                      {columns.map((i) => <option key={i} value={i}>{colName(i)}</option>)}
                    </Select>
                  </label>
                ))}
                <fieldset className="grid gap-1">
                  <legend className="font-medium">Notas (puedes marcar varias)</legend>
                  <div className="flex flex-wrap gap-2">
                    {columns.map((i) => (
                      <label key={i} className="inline-flex min-h-11 items-center gap-2 rounded-md border px-3">
                        <input type="checkbox" checked={mapping.notes.includes(i)} onChange={() => toggleNote(i)} />
                        <span className="max-w-[12rem] truncate">{colName(i)}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className="grid grid-cols-2 gap-3">
                  <label className="grid min-w-0 gap-1">
                    <span className="font-medium">Duración por defecto (min)</span>
                    <input inputMode="decimal" value={durationDefault} onChange={(e) => setDurationDefault(e.target.value)} placeholder="vacío" data-testid="hist-def-dur" className="h-11 w-full min-w-0 rounded-md border bg-transparent px-3 text-base" />
                  </label>
                  <label className="grid min-w-0 gap-1">
                    <span className="font-medium">RPE por defecto (1–10)</span>
                    <input inputMode="decimal" value={rpeDefault} onChange={(e) => setRpeDefault(e.target.value)} placeholder="vacío" data-testid="hist-def-rpe" className="h-11 w-full min-w-0 rounded-md border bg-transparent px-3 text-base" />
                  </label>
                </div>
                <p className="text-xs text-muted-foreground">Solo se aplican a filas sin duración o sin RPE, y quedan anotadas como estimadas. Sin duración y RPE (o carga) la sesión se guarda, pero no suma a la carga.</p>
                <Button onClick={() => void review()} disabled={busy} className="min-h-11" data-testid="hist-review">Revisar</Button>
              </div>
            ) : null}

            {parsed && preview ? (
              <div className="grid gap-3" data-testid="hist-preview">
                <p className="font-medium" data-testid="hist-counts">
                  {preview.counts.new} nuevas · {preview.counts.duplicate + preview.counts.duplicateInFile} duplicadas · {parsed.skipped.length} omitidas
                </p>
                {preview.counts.sets ? (
                  <p className="rounded-md bg-muted/60 p-2" data-testid="hist-sets">
                    Se guardarán {preview.counts.sets} series de fuerza (hoja «Series»): saldrán en el progreso de cada ejercicio y en tus marcas.
                  </p>
                ) : null}
                {preview.counts.noLoad > 0 ? (
                  <p className="rounded-md bg-muted/60 p-2" data-testid="hist-noload">
                    {preview.counts.noLoad} de las nuevas no suman carga (sin duración y RPE ni carga). Puedes poner valores por defecto arriba y volver a revisar.
                  </p>
                ) : null}
                {parsed.issues.length ? (
                  <details className="rounded-md border p-2">
                    <summary className="min-h-11 cursor-pointer py-2">{parsed.issues.length} avisos de valores</summary>
                    <ul className="grid gap-1 text-xs">{parsed.issues.slice(0, 30).map((i, k) => <li key={k}>Fila {i.line}: {i.message}</li>)}</ul>
                  </details>
                ) : null}
                {parsed.skipped.length ? (
                  <details className="rounded-md border p-2">
                    <summary className="min-h-11 cursor-pointer py-2">{parsed.skipped.length} filas omitidas</summary>
                    <ul className="grid gap-1 text-xs">{parsed.skipped.slice(0, 40).map((s) => <li key={s.line}>Fila {s.line}: {s.reason}</li>)}</ul>
                  </details>
                ) : null}
                <ul className="grid gap-2">
                  {rowsShown.map((r) => {
                    const st = statusOf.get(r.line) ?? "new";
                    return (
                      <li key={r.line} className="grid gap-1 rounded-lg border p-3" data-testid="hist-row">
                        <div className="flex items-start justify-between gap-2">
                          <span className="min-w-0 break-words font-medium">{r.title}</span>
                          <Badge variant={st === "new" ? "default" : "secondary"}>{STATUS_LABEL[st]}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(r.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                          {r.durationSec ? ` · ${formatDuration(r.durationSec)}` : ""}
                          {r.distanceM ? ` · ${formatNum(r.distanceM / 1000, 1)} km` : ""}
                          {r.rpe ? ` · RPE ${r.rpe}` : ""}
                          {!contributesLoad(r) ? " · sin carga" : ""}
                        </p>
                      </li>
                    );
                  })}
                </ul>
                {parsed.rows.length > rowsShown.length ? <p className="text-xs text-muted-foreground">… y {parsed.rows.length - rowsShown.length} filas más.</p> : null}
                <Button onClick={() => void save()} disabled={busy || preview.counts.new === 0} className="min-h-11" data-testid="hist-save">
                  {busy ? "Importando…" : `Importar ${preview.counts.new} sesiones`}
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
