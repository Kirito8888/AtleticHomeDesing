"use client";

import { BODY_AREA_LABEL, type BodyAreaName } from "@/lib/recovery/injury-rules";
import { cn } from "@/lib/utils";

// ── Geometría ────────────────────────────────────────────────────────────────
// Cada figura se dibuja en un lienzo de 100 de ancho centrado en x = 50; la vista de espaldas se desplaza BACK_DX.
const BACK_DX = 70;

const f = (n: number) => Math.round(n * 100) / 100;

/** Trapecio con esquinas redondeadas (segmento de miembro o tronco): centro y ancho arriba y abajo. */
function taper(cx1: number, y1: number, w1: number, cx2: number, y2: number, w2: number, r: number): string {
  const l1 = cx1 - w1 / 2, r1 = cx1 + w1 / 2, l2 = cx2 - w2 / 2, r2 = cx2 + w2 / 2;
  return (
    `M${f(l1)} ${f(y1 + r)}Q${f(l1)} ${f(y1)} ${f(l1 + r)} ${f(y1)}L${f(r1 - r)} ${f(y1)}Q${f(r1)} ${f(y1)} ${f(r1)} ${f(y1 + r)}` +
    `L${f(r2)} ${f(y2 - r)}Q${f(r2)} ${f(y2)} ${f(r2 - r)} ${f(y2)}L${f(l2 + r)} ${f(y2)}Q${f(l2)} ${f(y2)} ${f(l2)} ${f(y2 - r)}Z`
  );
}

/** Elipse como path. */
function ell(cx: number, cy: number, rx: number, ry: number): string {
  return `M${f(cx - rx)} ${f(cy)}a${rx} ${ry} 0 1 0 ${f(2 * rx)} 0a${rx} ${ry} 0 1 0 ${f(-2 * rx)} 0Z`;
}

/** La misma forma en ambos lados: `make(x)` recibe el centro del lado izquierdo y se refleja respecto a x = 50. */
const pair = (x: number, make: (cx: number) => string) => make(x) + make(100 - x);

/** Desplaza todas las coordenadas x absolutas de un path generado por estas funciones (las relativas `a` no cambian). */
function shift(d: string, dx: number): string {
  if (!dx) return d;
  // Sólo M, L y Q usan coordenadas absolutas: x en las posiciones pares de cada grupo.
  return d.replace(/([MLQ])([^MLQaZ]+)/g, (_, cmd: string, args: string) => {
    const n = args.trim().split(/\s+/).map(Number);
    return cmd + n.map((v, i) => (i % 2 === 0 ? f(v + dx) : v)).join(" ");
  });
}

/** Silueta base (zonas no tocables incluidas), la misma delante y detrás. */
const SILHOUETTE = [
  ell(50, 13, 8.5, 10), // cabeza
  taper(50, 21, 9, 50, 32, 12, 2), // cuello
  taper(50, 30, 40, 50, 80, 26, 8), // tronco
  taper(50, 77, 28, 50, 97, 27, 6), // pelvis
  pair(29, (x) => taper(x, 33, 10, x - 2, 71, 8, 4)), // brazo
  pair(26.5, (x) => taper(x, 69, 8, x - 3, 103, 6, 3)), // antebrazo
  pair(23, (x) => ell(x, 110, 4.5, 8)), // mano
  pair(43.5, (x) => taper(x, 90, 14, x + 0.5, 142, 10, 5)), // muslo
  pair(44, (x) => taper(x, 140, 10, x + 1, 199, 6, 3)), // pierna
  pair(45, (x) => taper(x, 198, 7, x - 1, 214, 10, 3)), // pie
].join("");

/** Zonas tocables. `back` = vista de espaldas. */
const ZONES: Array<{ area: BodyAreaName; d: string; back?: boolean }> = [
  // Delante
  { area: "HEAD_NECK", d: ell(50, 13, 8.5, 10) + taper(50, 23, 8, 50, 30, 10, 2) },
  { area: "SHOULDER", d: pair(31, (x) => ell(x, 37, 6.5, 5.5)) },
  { area: "CHEST", d: pair(43.5, (x) => taper(x, 34, 12, x, 52, 12, 5)) },
  { area: "ABDOMEN", d: taper(50, 53.5, 21, 50, 78, 19, 5) },
  { area: "HIP_GROIN", d: taper(50, 79.5, 26, 50, 94, 13, 5) },
  { area: "ELBOW", d: pair(26.5, (x) => ell(x, 71, 4.8, 4.8)) },
  { area: "WRIST_HAND", d: pair(23, (x) => ell(x, 110, 5, 9)) },
  { area: "QUADRICEPS", d: pair(43.5, (x) => taper(x, 96, 13, x + 0.5, 137, 9.5, 4)) },
  { area: "KNEE", d: pair(44, (x) => ell(x, 144.5, 5.2, 5.5)) },
  { area: "ANKLE", d: pair(45, (x) => ell(x, 196, 4.5, 3.8)) },
  { area: "FOOT", d: pair(45, (x) => taper(x, 201, 7.5, x - 1, 214, 10, 3)) },
  // Detrás
  { area: "UPPER_BACK", d: taper(50, 33, 36, 50, 57, 27, 7), back: true },
  { area: "LOWER_BACK", d: taper(50, 58.5, 26, 50, 78, 24, 5), back: true },
  { area: "GLUTE", d: pair(43.5, (x) => ell(x, 88, 7, 8.5)), back: true },
  { area: "HAMSTRING", d: pair(43.5, (x) => taper(x, 98.5, 12, x + 0.5, 138, 9, 4)), back: true },
  { area: "CALF", d: pair(44.5, (x) => ell(x, 163, 5.2, 14)), back: true },
  { area: "ACHILLES", d: pair(44.8, (x) => taper(x, 180, 4.5, x, 196, 4, 2)), back: true },
];

// ── Escala de intensidad ─────────────────────────────────────────────────────

/** Nivel de la escala (0 = sin marcar) para un dolor 1–10. */
export function painLevel(pain: number | null | undefined): 0 | 1 | 2 | 3 | 4 {
  if (pain == null || !Number.isFinite(pain) || pain <= 0) return 0;
  if (pain <= 3) return 1;
  if (pain <= 6) return 2;
  if (pain <= 8) return 3;
  return 4;
}

const LEVEL_FILL = ["fill-foreground/12 hover:fill-foreground/25", "fill-load-1", "fill-load-2", "fill-load-3", "fill-load-4"] as const;
const LEGEND = [
  { level: 1, label: "Leve", range: "1–3", swatch: "bg-load-1" },
  { level: 2, label: "Moderado", range: "4–6", swatch: "bg-load-2" },
  { level: 3, label: "Alto", range: "7–8", swatch: "bg-load-3" },
  { level: 4, label: "Muy alto", range: "9–10", swatch: "bg-load-4" },
] as const;

/**
 * Silueta táctil (delante y detrás): toca una zona para marcarla. Con `intensity` (dolor 1–10 por zona) el color
 * sigue una escala progresiva leve → muy alto, con leyenda; sin ella, las zonas marcadas usan el nivel moderado.
 */
export function BodyMap({
  marked,
  onPick,
  label = "Mapa del cuerpo",
  intensity,
}: {
  marked: BodyAreaName[];
  onPick: (a: BodyAreaName) => void;
  label?: string;
  intensity?: Partial<Record<BodyAreaName, number>>;
}) {
  const set = new Set(marked);
  const levelOf = (a: BodyAreaName) => (!set.has(a) ? 0 : intensity ? painLevel(intensity[a]) || 2 : 2);
  const nameOf = (a: BodyAreaName) => {
    if (!set.has(a)) return BODY_AREA_LABEL[a];
    const p = intensity?.[a];
    return `${BODY_AREA_LABEL[a]} (${p != null ? `dolor ${p}/10` : "marcada"})`;
  };
  return (
    <figure className="grid gap-2">
      <svg viewBox="14 0 142 226" role="group" aria-label={label} className="mx-auto h-auto max-h-[26rem] w-full max-w-sm touch-manipulation">
        <path d={SILHOUETTE} className="fill-muted stroke-border" strokeWidth={0.6} />
        <path d={shift(SILHOUETTE, BACK_DX)} className="fill-muted stroke-border" strokeWidth={0.6} />
        {/* Columna vertebral en la vista de espaldas: sólo referencia visual */}
        <path d={`M${50 + BACK_DX} 34V78`} className="stroke-border" strokeWidth={0.8} strokeLinecap="round" />
        {ZONES.map((z) => {
          const d = shift(z.d, z.back ? BACK_DX : 0);
          const lv = levelOf(z.area);
          return (
            <g
              key={z.area}
              role="button"
              tabIndex={0}
              aria-label={nameOf(z.area)}
              aria-pressed={set.has(z.area)}
              data-level={lv}
              onClick={() => onPick(z.area)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onPick(z.area))}
              className="group cursor-pointer outline-none"
            >
              <title>{nameOf(z.area)}</title>
              {/* Área de toque algo mayor que la zona visible (móvil) */}
              <path d={d} fill="transparent" stroke="transparent" strokeWidth={4} pointerEvents="all" />
              <path
                d={d}
                strokeWidth={1.2}
                strokeLinejoin="round"
                className={cn("stroke-background transition-colors group-focus-visible:stroke-ring group-focus-visible:[stroke-width:2]", LEVEL_FILL[lv])}
              />
            </g>
          );
        })}
        <text x="50" y="224" textAnchor="middle" className="fill-muted-foreground text-[7px]">
          delante
        </text>
        <text x={50 + BACK_DX} y="224" textAnchor="middle" className="fill-muted-foreground text-[7px]">
          detrás
        </text>
      </svg>
      {intensity ? (
        <figcaption>
          <ul aria-label="Escala de dolor" className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {LEGEND.map((l) => (
              <li key={l.level} className="flex items-center gap-1.5">
                <span aria-hidden className={cn("size-3 rounded-full ring-1 ring-border", l.swatch)} />
                {l.label} <span className="tabular-nums">({l.range})</span>
              </li>
            ))}
          </ul>
        </figcaption>
      ) : null}
    </figure>
  );
}
