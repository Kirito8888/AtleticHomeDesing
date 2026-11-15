// v3.0 F · V3-A10: contraste WCAG de los tokens de color de globals.css (claro, oscuro y .hc).
// Lógica pura: parseo de bloques CSS, OKLCH/hex → sRGB, composición de alfa y razón de contraste.

export type RGBA = { r: number; g: number; b: number; a: number };

/** Variables `--x: valor;` de cada bloque `selector { … }` de primer nivel con ese selector exacto. */
export function cssVars(css: string, selector: string): Record<string, string> {
  const out: Record<string, string> = {};
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const re = new RegExp(`(^|[}\\s])${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`, "g");
  for (const m of clean.matchAll(re)) for (const d of m[2].matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) out[d[1]] = d[2].trim();
  return out;
}

const clamp = (x: number) => Math.min(1, Math.max(0, x));
const toSrgb = (l: number) => (l <= 0.0031308 ? 12.92 * l : 1.055 * Math.pow(l, 1 / 2.4) - 0.055);

function alpha(s: string | undefined): number {
  if (!s) return 1;
  return s.trim().endsWith("%") ? parseFloat(s) / 100 : parseFloat(s);
}

/** Color CSS (`oklch(L C H [/ a])`, `#rgb`, `#rrggbb`, `white`, `black`) → sRGB 0–1 con alfa. */
export function parseColor(v: string): RGBA {
  const s = v.trim().toLowerCase();
  if (s === "white") return { r: 1, g: 1, b: 1, a: 1 };
  if (s === "black") return { r: 0, g: 0, b: 0, a: 1 };
  const hex = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join("") : hex[1];
    return { r: parseInt(h.slice(0, 2), 16) / 255, g: parseInt(h.slice(2, 4), 16) / 255, b: parseInt(h.slice(4, 6), 16) / 255, a: 1 };
  }
  const ok = s.match(/^oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+%?))?\s*\)$/);
  if (!ok) throw new Error(`color no admitido: ${v}`);
  const L = ok[1].endsWith("%") ? parseFloat(ok[1]) / 100 : parseFloat(ok[1]);
  const C = parseFloat(ok[2]);
  const H = (parseFloat(ok[3]) * Math.PI) / 180;
  const a = C * Math.cos(H);
  const b = C * Math.sin(H);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const [l3, m3, s3] = [l_ ** 3, m_ ** 3, s_ ** 3];
  const r = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  const g = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  const bl = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3;
  // Fuera de gama: recorte simple por canal (lo que hace el navegador en sRGB a efectos prácticos)
  return { r: clamp(toSrgb(r)), g: clamp(toSrgb(g)), b: clamp(toSrgb(bl)), a: alpha(ok[4]) };
}

/** Compone `top` (con su alfa) sobre `bottom` opaco. */
export function over(top: RGBA, bottom: RGBA, extraAlpha = 1): RGBA {
  const a = top.a * extraAlpha;
  return { r: top.r * a + bottom.r * (1 - a), g: top.g * a + bottom.g * (1 - a), b: top.b * a + bottom.b * (1 - a), a: 1 };
}

const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
export const luminance = (c: RGBA) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);

export function ratio(fg: RGBA, bg: RGBA): number {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Par a comprobar: fg sobre bg (nombres de token sin `--`, o `white`). `bgAlpha` = p. ej. `bg-destructive/60`. */
export type Pair = { fg: string; bg: string; min: 4.5 | 3; bgAlpha?: number; only?: "light" | "dark"; warn?: boolean; note?: string;
  /** Excepción documentada (docs/auditoria-v3-0.md § Excepciones de F): se informa, no falla. Bloque destino. */
  defer?: "G" | "T" };

export const THEMES = [
  { name: "claro", base: [":root"], dark: false },
  { name: "oscuro", base: [":root", ".dark"], dark: true },
  { name: "hc claro", base: [":root", "html.hc"], dark: false },
  { name: "hc oscuro", base: [":root", ".dark", "html.hc", "html.hc.dark"], dark: true },
] as const;

export type Result = { theme: string; fg: string; bg: string; ratio: number; min: number; ok: boolean; warn: boolean; defer?: "G" | "T"; note?: string };

export function checkTheme(vars: Record<string, string>, theme: string, dark: boolean, pairs: Pair[]): Result[] {
  const color = (k: string) => parseColor(k === "white" || k === "black" ? k : (vars[k] ?? (() => { throw new Error(`token --${k} no existe`); })()));
  const page = color("background");
  return pairs
    .filter((p) => !p.only || (p.only === "dark") === dark)
    .map((p) => {
      const bgBase = p.bg === "background" ? page : over(color(p.bg), page);
      const bg = p.bgAlpha != null ? over(color(p.bg), page, p.bgAlpha) : bgBase;
      const fg = over(color(p.fg), bg);
      const r = ratio(fg, bg);
      return { theme, fg: p.fg, bg: p.bgAlpha != null ? `${p.bg}/${Math.round(p.bgAlpha * 100)}` : p.bg, ratio: r, min: p.min, ok: r >= p.min, warn: !!p.warn, defer: p.defer, note: p.note };
    });
}

/** Pares de la app: texto ≥ 4,5:1; componentes de interfaz y gráficos ≥ 3:1 (1.4.11). */
export const PAIRS: Pair[] = [
  ...(["background", "card", "popover"] as const).map((b) => ({ fg: b === "background" ? "foreground" : `${b}-foreground`, bg: b, min: 4.5 as const })),
  ...(["primary", "secondary", "accent", "muted"] as const).map((b) => ({ fg: `${b}-foreground`, bg: b, min: 4.5 as const })),
  { fg: "muted-foreground", bg: "muted", min: 4.5 },
  { fg: "muted-foreground", bg: "background", min: 4.5 },
  { fg: "muted-foreground", bg: "card", min: 4.5 },
  { fg: "muted-foreground", bg: "secondary", min: 4.5 },
  { fg: "destructive", bg: "background", min: 4.5, note: "text-destructive" },
  { fg: "destructive", bg: "card", min: 4.5, note: "text-destructive" },
  { fg: "white", bg: "destructive", min: 4.5, only: "light", note: "botón/insignia destructive" },
  { fg: "white", bg: "destructive", min: 4.5, bgAlpha: 0.6, only: "dark", note: "dark:bg-destructive/60" },
  { fg: "ring", bg: "background", min: 3, note: "anillo de foco" },
  // Borde de campo: 1,3–1,6:1 en claro/oscuro (los campos tienen etiqueta visible); .hc ya cumple. Rediseño de tokens → G.
  { fg: "input", bg: "background", min: 3, note: "borde de control", defer: "G" },
  { fg: "input", bg: "card", min: 3, note: "borde de control", defer: "G" },
  { fg: "border", bg: "background", min: 3, warn: true, note: "separador decorativo (aviso)" },
  ...(["series-1", "series-2", "series-3", "status-good", "status-critical"] as const).flatMap((t) =>
    (["background", "card"] as const).map((bg) => ({ fg: t, bg, min: 3 as const, note: "gráfico/estado" })),
  ),
  // Ámbar/naranja de estado y colores 4–5 de presupuestos: siempre con icono + texto o leyenda con cifra (no son el
  // único medio); subirlos a 3:1 cambia la paleta validada para daltonismo → revisión en G.
  ...(["status-warning", "status-serious", "chart-4", "chart-5"] as const).flatMap((t) =>
    (["background", "card"] as const).map((bg) => ({ fg: t, bg, min: 3 as const, note: t.startsWith("chart") ? "presupuesto con leyenda y cifra" : "estado con icono + texto", defer: "G" as const })),
  ),
];
