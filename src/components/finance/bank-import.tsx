"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FileUp } from "lucide-react";
import { toast } from "sonner";

import { Field } from "@/components/form/chips";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { api } from "@/lib/client-api";
import { type BankMapping, detectDelimiter, looksLikeNorma43, parseCsv } from "@/lib/finance/bank-import";
import { formatDate, formatEur } from "@/lib/format";

export interface ImportProfile {
  id: string;
  name: string;
  accountId: string;
  mapping: BankMapping;
}

interface Preview {
  format: "CSV" | "N43";
  movements: Array<{ line: number; date: string; description: string; amountCents: number; duplicate: boolean }>;
  errors: Array<{ line: number; message: string }>;
  summary: { total: number; new: number; duplicates: number; inCents: number; outCents: number };
}

/** Columna cuyo título encaja con alguno de los patrones (para proponer el mapeo). */
const guess = (header: string[], re: RegExp) => {
  const i = header.findIndex((h) => re.test(h.toLowerCase()));
  return i >= 0 ? i : null;
};

/** Primera fila que parece una cabecera (≥ 3 columnas con alguna palabra clave). */
function findHeader(rows: string[][]): number {
  const i = rows.findIndex((r) => r.length >= 3 && r.some((c) => /fecha|date|concepto|importe|amount/i.test(c)));
  return Math.max(0, i);
}

export function BankImport({ accounts, profiles }: { accounts: Array<{ id: string; name: string }>; profiles: ImportProfile[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [rows, setRows] = useState<string[][]>([]);
  const [isN43, setIsN43] = useState(false);
  const [mapping, setMapping] = useState<BankMapping | null>(null);
  const [split, setSplit] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [profileName, setProfileName] = useState("");
  const [busy, setBusy] = useState(false);

  async function onFile(f: File | undefined, profile?: ImportProfile) {
    setPreview(null);
    if (!f) return;
    setFile(f);
    const text = await f.slice(0, 64 * 1024).text();
    if (looksLikeNorma43(text)) {
      setIsN43(true);
      setMapping(null);
      return;
    }
    setIsN43(false);
    if (profile) {
      setMapping(profile.mapping);
      setSplit(profile.mapping.amountCol == null);
      setRows(parseCsv(text, profile.mapping.delimiter).slice(0, 12));
      return;
    }
    const delimiter = detectDelimiter(text);
    const all = parseCsv(text, delimiter).slice(0, 12);
    const skipRows = findHeader(all);
    const header = all[skipRows] ?? [];
    const amountCol = guess(header, /importe|amount|cantidad|valor/);
    const debitCol = guess(header, /cargo|debe|debit|gasto/);
    const creditCol = guess(header, /abono|haber|credit|ingreso/);
    const useSplit = amountCol == null && debitCol != null && creditCol != null;
    setSplit(useSplit);
    setRows(all);
    const sample = all[skipRows + 1]?.[guess(header, /fecha|date/) ?? 0] ?? "";
    setMapping({
      delimiter,
      hasHeader: true,
      skipRows,
      dateCol: guess(header, /fecha op|fecha|date/) ?? 0,
      dateFormat: /^\d{4}-/.test(sample) ? "YYYY-MM-DD" : "DD/MM/YYYY",
      descCol: guess(header, /concepto|descrip|detalle|movimiento|description/) ?? 1,
      payeeCol: null,
      amountCol: useSplit ? null : (amountCol ?? 2),
      debitCol: useSplit ? debitCol : null,
      creditCol: useSplit ? creditCol : null,
      decimal: /\d\.\d{2}$/.test(all[skipRows + 1]?.join(" ") ?? "") ? "." : ",",
      invertSign: false,
    });
  }

  async function send(commit: boolean) {
    if (!file || !accountId) return toast.error("Elige la cuenta y el fichero");
    const form = new FormData();
    form.set("file", file);
    form.set("accountId", accountId);
    if (mapping && !isN43) form.set("mapping", JSON.stringify(mapping));
    setBusy(true);
    try {
      if (!commit) {
        setPreview(await api<Preview>("/api/finance/import", { form }));
      } else {
        const r = await api<{ created: number; skipped: number }>("/api/finance/import?commit=1", { form });
        toast.success(`${r.created} movimientos importados${r.skipped ? ` · ${r.skipped} ya existían` : ""}`);
        if (profileName.trim() && mapping && !isN43) {
          await api("/api/finance/import/profiles", { body: { name: profileName.trim(), accountId, mapping } });
        }
        setOpen(false);
        setPreview(null);
        setFile(null);
        router.refresh();
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const set = (patch: Partial<BankMapping>) => {
    setPreview(null);
    setMapping((m) => (m ? { ...m, ...patch } : m));
  };
  const cols = Math.max(0, ...rows.map((r) => r.length));
  const colSelect = (id: string, label: string, value: number | null | undefined, onChange: (v: number) => void) => (
    <Field label={label} htmlFor={id}>
      <Select id={id} value={value ?? ""} onChange={(e) => onChange(Number(e.target.value))}>
        {Array.from({ length: cols }, (_, i) => (
          <option key={i} value={i}>
            {i + 1}. {rows[mapping?.skipRows ?? 0]?.[i]?.slice(0, 24) || `Columna ${i + 1}`}
          </option>
        ))}
      </Select>
    </Field>
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <FileUp /> Importar
        </Button>
      </SheetTrigger>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Importar extracto</SheetTitle>
          <SheetDescription>CSV de tu banco o Norma 43. Los movimientos que ya existan no se duplican.</SheetDescription>
        </SheetHeader>
        <div className="grid gap-4 p-4 text-sm">
          {profiles.length ? (
            <Field label="Formato guardado" htmlFor="imp-profile">
              <Select
                id="imp-profile"
                defaultValue=""
                onChange={(e) => {
                  const p = profiles.find((x) => x.id === e.target.value);
                  if (p) {
                    setAccountId(p.accountId);
                    if (file) void onFile(file, p);
                    else setMapping(p.mapping);
                  }
                }}
              >
                <option value="">—</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <Field label="Cuenta" htmlFor="imp-account">
            <Select id="imp-account" value={accountId} onChange={(e) => (setAccountId(e.target.value), setPreview(null))}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Extracto (.csv, .txt, Norma 43)" htmlFor="imp-file">
            <Input id="imp-file" type="file" accept=".csv,.txt,.n43,.aeb,text/csv,text/plain" onChange={(e) => void onFile(e.target.files?.[0])} />
          </Field>

          {isN43 ? <Badge variant="secondary">Norma 43 detectado: no hace falta indicar columnas</Badge> : null}

          {mapping && !isN43 && rows.length ? (
            <div className="grid gap-3 rounded-md border p-3">
              <div className="overflow-x-auto">
                <table className="w-full text-xs" aria-label="Primeras líneas del extracto">
                  <tbody>
                    {rows.slice(mapping.skipRows, mapping.skipRows + 4).map((r, i) => (
                      <tr key={i} className={i === 0 && mapping.hasHeader ? "font-medium" : "text-muted-foreground"}>
                        {r.map((c, j) => (
                          <td key={j} className="max-w-28 truncate border-b px-1 py-0.5">
                            {c}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {colSelect("imp-date", "Fecha", mapping.dateCol, (v) => set({ dateCol: v }))}
                <Field label="Formato de fecha" htmlFor="imp-datefmt">
                  <Select id="imp-datefmt" value={mapping.dateFormat} onChange={(e) => set({ dateFormat: e.target.value as BankMapping["dateFormat"] })}>
                    <option value="DD/MM/YYYY">DD/MM/AAAA</option>
                    <option value="DD-MM-YYYY">DD-MM-AAAA</option>
                    <option value="YYYY-MM-DD">AAAA-MM-DD</option>
                    <option value="MM/DD/YYYY">MM/DD/AAAA</option>
                  </Select>
                </Field>
                {colSelect("imp-desc", "Concepto", mapping.descCol, (v) => set({ descCol: v }))}
                <Field label="Decimales" htmlFor="imp-dec">
                  <Select id="imp-dec" value={mapping.decimal} onChange={(e) => set({ decimal: e.target.value as "," | "." })}>
                    <option value=",">1.234,56</option>
                    <option value=".">1,234.56</option>
                  </Select>
                </Field>
                {split ? (
                  <>
                    {colSelect("imp-debit", "Cargo", mapping.debitCol, (v) => set({ debitCol: v }))}
                    {colSelect("imp-credit", "Abono", mapping.creditCol, (v) => set({ creditCol: v }))}
                  </>
                ) : (
                  colSelect("imp-amount", "Importe", mapping.amountCol, (v) => set({ amountCol: v }))
                )}
                <Field label="Líneas a saltar" htmlFor="imp-skip">
                  <Input id="imp-skip" type="number" min={0} max={50} value={mapping.skipRows} onChange={(e) => set({ skipRows: Number(e.target.value) || 0 })} />
                </Field>
              </div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={split}
                  onChange={(e) => {
                    setSplit(e.target.checked);
                    set(e.target.checked ? { amountCol: null, debitCol: 2, creditCol: 3 } : { amountCol: 2, debitCol: null, creditCol: null });
                  }}
                />
                Cargos y abonos en columnas separadas
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" className="size-4" checked={mapping.invertSign} onChange={(e) => set({ invertSign: e.target.checked })} />
                Mi banco pone los gastos en positivo
              </label>
            </div>
          ) : null}

          {file ? (
            <Button type="button" variant="outline" disabled={busy} onClick={() => void send(false)}>
              Vista previa
            </Button>
          ) : null}

          {preview ? (
            <div className="grid gap-2" aria-label="Vista previa del extracto">
              <p>
                <strong>{preview.summary.new}</strong> nuevos · {preview.summary.duplicates} ya importados · entradas {formatEur(preview.summary.inCents)} · salidas{" "}
                {formatEur(preview.summary.outCents)}
              </p>
              {preview.errors.length ? (
                <ul className="grid gap-0.5 text-xs text-destructive">
                  {preview.errors.slice(0, 5).map((e, i) => (
                    <li key={i}>{e.line ? `Línea ${e.line}: ` : ""}{e.message}</li>
                  ))}
                </ul>
              ) : null}
              <ul className="grid max-h-64 gap-1 overflow-y-auto text-xs">
                {preview.movements.slice(0, 30).map((m) => (
                  <li key={m.line} className={m.duplicate ? "flex justify-between gap-2 text-muted-foreground line-through" : "flex justify-between gap-2"}>
                    <span className="truncate">
                      {formatDate(m.date)} · {m.description}
                    </span>
                    <span className="shrink-0 tabular-nums">{formatEur(m.amountCents)}</span>
                  </li>
                ))}
              </ul>
              {!isN43 ? (
                <Field label="Guardar este formato como (opcional)" htmlFor="imp-pname">
                  <Input id="imp-pname" value={profileName} onChange={(e) => setProfileName(e.target.value)} placeholder="p. ej. Mi banco" maxLength={60} />
                </Field>
              ) : null}
              <Button type="button" disabled={busy || !preview.summary.new} onClick={() => void send(true)}>
                Importar {preview.summary.new} movimientos
              </Button>
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
