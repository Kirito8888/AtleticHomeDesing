"use client";

import { BODY_AREA_LABEL, type BodyAreaName } from "@/lib/recovery/injury-rules";
import { cn } from "@/lib/utils";

/** Zonas tocables: delante (izquierda) y detrás (derecha). Coordenadas en un lienzo 200 × 220. */
const SHAPES: Array<{ area: BodyAreaName; d: string }> = [
  // Delante
  { area: "HEAD_NECK", d: "M40 8a12 12 0 1 1 0.1 0zM35 32h10v8H35z" },
  { area: "SHOULDER", d: "M20 40h12v10H20zM48 40h12v10H48z" },
  { area: "CHEST", d: "M32 40h16v18H32z" },
  { area: "ABDOMEN", d: "M32 58h16v18H32z" },
  { area: "ELBOW", d: "M14 62h9v10h-9zM57 62h9v10h-9z" },
  { area: "WRIST_HAND", d: "M10 86h10v14H10zM60 86h10v14H60z" },
  { area: "HIP_GROIN", d: "M30 76h20v10H30z" },
  { area: "QUADRICEPS", d: "M29 86h10v32H29zM41 86h10v32H41z" },
  { area: "KNEE", d: "M29 118h10v10H29zM41 118h10v10H41z" },
  { area: "ANKLE", d: "M30 160h8v8h-8zM42 160h8v8h-8z" },
  { area: "FOOT", d: "M27 168h12v8H27zM41 168h12v8H41z" },
  // Detrás (desplazado 110)
  { area: "UPPER_BACK", d: "M142 40h16v18h-16z" },
  { area: "LOWER_BACK", d: "M142 58h16v16h-16z" },
  { area: "GLUTE", d: "M140 74h20v14h-20z" },
  { area: "HAMSTRING", d: "M139 88h10v30h-10zM151 88h10v30h-10z" },
  { area: "CALF", d: "M140 128h8v24h-8zM152 128h8v24h-8z" },
  { area: "ACHILLES", d: "M141 152h6v8h-6zM153 152h6v8h-6z" },
];

const OUTLINE = "M40 4a14 14 0 1 0 0.1 0M18 40h44l6 50h-8l-4-30v58l-3 50h-9l-2-50h-4l-2 50h-9l-3-50V60l-4 30h-8z";

/** Silueta táctil: toca una zona para añadir la molestia. Las zonas ya marcadas se ven en color. */
export function BodyMap({ marked, onPick, label = "Mapa del cuerpo" }: { marked: BodyAreaName[]; onPick: (a: BodyAreaName) => void; label?: string }) {
  const set = new Set(marked);
  return (
    <figure className="grid gap-1">
      <svg viewBox="0 0 200 182" role="group" aria-label={label} className="mx-auto h-56 w-full max-w-72">
        <path d={OUTLINE} className="fill-muted stroke-border" />
        <path d={OUTLINE} transform="translate(110 0)" className="fill-muted stroke-border" />
        {SHAPES.map((s) => (
          <path
            key={s.area}
            d={s.d}
            role="button"
            tabIndex={0}
            aria-label={`${BODY_AREA_LABEL[s.area]}${set.has(s.area) ? " (marcada)" : ""}`}
            aria-pressed={set.has(s.area)}
            onClick={() => onPick(s.area)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onPick(s.area))}
            className={cn("cursor-pointer stroke-background outline-none focus-visible:stroke-primary", set.has(s.area) ? "fill-destructive/70" : "fill-foreground/15 hover:fill-primary/40")}
          />
        ))}
        <text x="40" y="181" textAnchor="middle" className="fill-muted-foreground text-[8px]">
          delante
        </text>
        <text x="150" y="181" textAnchor="middle" className="fill-muted-foreground text-[8px]">
          detrás
        </text>
      </svg>
    </figure>
  );
}
