import { z } from "zod";

import { detectDelimiter, parseCsv } from "@/lib/finance/bank-import";

/**
 * Cineantropometría ISAK: somatotipo de Heath-Carter (Carter y Heath, 1990) y fraccionamiento en
 * 4 masas de De Rose y Guimarães (grasa de Faulkner, ósea de von Döbeln modificada por Rocha,
 * residual de Würch). Puro: sin Prisma ni servidor. Unidades: pliegues mm, perímetros y diámetros cm,
 * peso kg, talla cm. Es salud cifrada: nunca va a la IA, a la entrenadora ni al informe semanal.
 */

const num = (min: number, max: number) => z.number().finite().min(min).max(max);
const fold = num(2, 80);
const girth = num(15, 150);
const breadth = num(2, 20);

export const isakInputSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha AAAA-MM-DD"),
  sex: z.enum(["M", "F"]),
  weightKg: num(25, 250),
  heightCm: num(120, 230),
  // 8 pliegues ISAK
  triceps: fold,
  subscapular: fold,
  biceps: fold,
  iliacCrest: fold,
  supraspinale: fold,
  abdominal: fold,
  frontThigh: fold,
  medialCalf: fold,
  // perímetros
  armFlexedGirth: girth,
  calfGirth: girth,
  armRelaxedGirth: girth.optional(),
  waistGirth: girth.optional(),
  hipGirth: girth.optional(),
  midThighGirth: girth.optional(),
  // diámetros óseos
  humerusBreadth: breadth,
  femurBreadth: breadth,
  wristBreadth: breadth,
  biacromialBreadth: num(20, 60).optional(),
  biiliocristalBreadth: num(15, 50).optional(),
});
export type IsakInput = z.infer<typeof isakInputSchema>;

export const FOLD_KEYS = ["triceps", "subscapular", "biceps", "iliacCrest", "supraspinale", "abdominal", "frontThigh", "medialCalf"] as const;

export type Somatotype = { endo: number; meso: number; ecto: number; x: number; y: number; hwr: number; label: string };
export type Mass = { kg: number; pct: number };
export type IsakResult = {
  method: "heath-carter-1990+de-rose";
  bmi: number;
  sum6: number;
  sum8: number;
  somatotype: Somatotype;
  masses: { fat: Mass; muscle: Mass; bone: Mass; residual: Mass };
  warnings: string[];
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const floor01 = (n: number) => (n <= 0 ? 0.1 : n);

export function somatotypeLabel(endo: number, meso: number, ecto: number): string {
  const comps: Array<[string, number]> = [["endomorfo", endo], ["mesomorfo", meso], ["ectomorfo", ecto]];
  const max = Math.max(endo, meso, ecto);
  if (max - Math.min(endo, meso, ecto) < 1.5) return "central";
  const top = comps.filter(([, v]) => max - v <= 0.5).map(([n]) => n);
  if (top.length === 2) return `${top[0].replace("morfo", "")}-${top[1]}`;
  return top[0];
}

export function heathCarter(i: IsakInput): Somatotype {
  const x3 = ((i.triceps + i.subscapular + i.supraspinale) * 170.18) / i.heightCm;
  const endo = floor01(-0.7182 + 0.1451 * x3 - 0.00068 * x3 ** 2 + 0.0000014 * x3 ** 3);
  const meso = floor01(
    0.858 * i.humerusBreadth + 0.601 * i.femurBreadth + 0.188 * (i.armFlexedGirth - i.triceps / 10) + 0.161 * (i.calfGirth - i.medialCalf / 10) - 0.131 * i.heightCm + 4.5,
  );
  const hwr = i.heightCm / Math.cbrt(i.weightKg);
  const ecto = hwr >= 40.75 ? 0.732 * hwr - 28.58 : hwr > 38.25 ? 0.463 * hwr - 17.63 : 0.1;
  const e = floor01(ecto);
  return {
    endo: r2(endo),
    meso: r2(meso),
    ecto: r2(e),
    x: r2(e - endo),
    y: r2(2 * meso - (endo + e)),
    hwr: r2(hwr),
    label: somatotypeLabel(endo, meso, e),
  };
}

export function fourMasses(i: IsakInput): { masses: IsakResult["masses"]; warnings: string[] } {
  const w = i.weightKg;
  const warnings: string[] = [];
  const sum4 = i.triceps + i.subscapular + i.supraspinale + i.abdominal;
  const fatKg = (w * (0.153 * sum4 + 5.783)) / 100;
  const boneKg = 3.02 * ((i.heightCm / 100) ** 2 * (i.wristBreadth / 100) * (i.femurBreadth / 100) * 400) ** 0.712;
  const residualKg = w * (i.sex === "M" ? 0.241 : 0.209);
  const muscleKg = w - fatKg - boneKg - residualKg;
  if (muscleKg <= 0) warnings.push("La masa muscular sale ≤ 0: revisa las medidas (pliegues o diámetros fuera de lo habitual).");
  const mass = (kg: number): Mass => ({ kg: r2(kg), pct: r2((kg / w) * 100) });
  return { masses: { fat: mass(fatKg), muscle: mass(muscleKg), bone: mass(boneKg), residual: mass(residualKg) }, warnings };
}

export function computeIsak(input: IsakInput): IsakResult {
  const i = isakInputSchema.parse(input);
  const { masses, warnings } = fourMasses(i);
  const sum8 = FOLD_KEYS.reduce((a, k) => a + i[k], 0);
  const sum6 = i.triceps + i.subscapular + i.supraspinale + i.abdominal + i.frontThigh + i.medialCalf;
  return {
    method: "heath-carter-1990+de-rose",
    bmi: r2(i.weightKg / (i.heightCm / 100) ** 2),
    sum6: r2(sum6),
    sum8: r2(sum8),
    somatotype: heathCarter(i),
    masses,
    warnings,
  };
}

/* ───────── Importación CSV/JSON ───────── */

const ALIASES: Record<string, keyof IsakInput> = {
  fecha: "date", date: "date",
  sexo: "sex", sex: "sex",
  peso: "weightKg", weight: "weightKg", weightkg: "weightKg",
  talla: "heightCm", altura: "heightCm", height: "heightCm", heightcm: "heightCm",
  triceps: "triceps", tricipital: "triceps",
  subescapular: "subscapular", subscapular: "subscapular",
  biceps: "biceps", bicipital: "biceps",
  crestailiaca: "iliacCrest", iliacCrest: "iliacCrest", iliaccrest: "iliacCrest",
  supraespinal: "supraspinale", supraspinale: "supraspinale",
  abdominal: "abdominal",
  musloanterior: "frontThigh", muslo: "frontThigh", frontthigh: "frontThigh",
  piernamedial: "medialCalf", pierna: "medialCalf", medialcalf: "medialCalf",
  brazoflexionado: "armFlexedGirth", perimetrobrazoflexionado: "armFlexedGirth", armflexedgirth: "armFlexedGirth",
  perimetropierna: "calfGirth", piernamaxima: "calfGirth", calfgirth: "calfGirth",
  brazorelajado: "armRelaxedGirth", armrelaxedgirth: "armRelaxedGirth",
  cintura: "waistGirth", waistgirth: "waistGirth",
  cadera: "hipGirth", hipgirth: "hipGirth",
  musloemedio: "midThighGirth", musclomedio: "midThighGirth", midthighgirth: "midThighGirth",
  humero: "humerusBreadth", biepicondileo: "humerusBreadth", humerusbreadth: "humerusBreadth",
  femur: "femurBreadth", bicondileo: "femurBreadth", femurbreadth: "femurBreadth",
  muneca: "wristBreadth", biestiloideo: "wristBreadth", wristbreadth: "wristBreadth",
  biacromial: "biacromialBreadth", biacromialbreadth: "biacromialBreadth",
  biiliocrestal: "biiliocristalBreadth", biiliocristalbreadth: "biiliocristalBreadth",
};
const norm = (h: string) => h.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z]/g, "").toLowerCase();
const ALIAS_NORM = new Map(Object.entries(ALIASES).map(([k, v]) => [norm(k), v]));

export type ImportRow = { line: number; input?: IsakInput; errors: string[] };

function coerce(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    const key = ALIAS_NORM.get(norm(k));
    if (!key || v === "" || v == null) continue;
    if (key === "date") out.date = String(v).trim();
    else if (key === "sex") {
      const s = String(v).trim().toUpperCase();
      out.sex = ["M", "H", "MALE", "HOMBRE"].includes(s) ? "M" : ["F", "MUJER", "FEMALE"].includes(s) ? "F" : s;
    } else out[key] = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  }
  return out;
}

function validate(raw: Record<string, unknown>, line: number): ImportRow {
  const p = isakInputSchema.safeParse(coerce(raw));
  return p.success
    ? { line, input: p.data, errors: [] }
    : { line, errors: p.error.issues.map((e) => `${e.path.join(".") || "fila"}: ${e.message}`) };
}

export function parseIsakFile(text: string, kind: "csv" | "json"): ImportRow[] {
  if (kind === "json") {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return [{ line: 1, errors: ["JSON no válido"] }];
    }
    const list = Array.isArray(data) ? data : [data];
    return list.map((r, n) => (r && typeof r === "object" ? validate(r as Record<string, unknown>, n + 1) : { line: n + 1, errors: ["Fila no válida"] }));
  }
  const rows = parseCsv(text, detectDelimiter(text));
  if (rows.length < 2) return [{ line: 1, errors: ["El CSV necesita cabecera y al menos una fila"] }];
  const [head, ...body] = rows;
  return body
    .map((cells, n) => ({ cells, n }))
    .filter(({ cells }) => cells.some((c) => c.trim() !== ""))
    .map(({ cells, n }) => validate(Object.fromEntries(head.map((h, c) => [h, cells[c] ?? ""])), n + 2));
}

export const CSV_TEMPLATE_HEADER = ["fecha", "sexo", "peso", "talla", "triceps", "subescapular", "biceps", "cresta_iliaca", "supraespinal", "abdominal", "muslo_anterior", "pierna_medial", "brazo_flexionado", "perimetro_pierna", "humero", "femur", "muneca"];
