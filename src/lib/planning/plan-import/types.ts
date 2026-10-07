/** Tipos del importador de planificación (PDF «día a día» → días estructurados). */

export type SessionKind = "TRACK" | "TECHNICAL" | "STRENGTH" | "MIXED";

/** Un trozo de texto del PDF con su posición (puntos PDF, origen abajo-izquierda). */
export type PdfItem = { x: number; y: number; str: string; size: number };

/** Una línea visual: los trozos que comparten altura, ordenados de izquierda a derecha. */
export type PdfLine = {
  page: number;
  y: number;
  size: number;
  items: PdfItem[];
  /** Cabecera o pie de página (se repite en cada página y no es contenido). */
  role: "header" | "footer" | "body";
};

export type PlanRow = {
  exercise: string;
  sets: string;
  load: string;
  rir: string;
  rest: string;
  how: string;
  /** Fila «↳ Rampa (no cuenta)»: series de aproximación. */
  ramp: boolean;
  /** Planes con IA: material que usa, alternativas y ejercicio original si se cambió. */
  equipment?: string[];
  alternatives?: Array<{ name: string; equipment: string[] }>;
  original?: string;
  /** Calculado al mostrar (no se guarda): kg desde %RM con la tabla de RM. */
  kg?: string;
};

export type PlanBlock =
  | { kind: "text"; title: string | null; text: string }
  | { kind: "table"; rows: PlanRow[] }
  | { kind: "why"; text: string };

export type ParsedDay = {
  /** Clave estable para reimportar sin duplicar: meso|variante|fecha o D-n|orden. */
  key: string;
  meso: string;
  /** null = día común; "A", "B", "A-V" (subvariante), "C" (rama), "N" (rama por defecto). */
  variant: string | null;
  week: number | null;
  /** Código tal cual aparece en la cabecera («S1», «A·S2-V», «C·D−5»). */
  code: string;
  /** Fecha ISO (YYYY-MM-DD) o null en los días relativos a una competición (D−5…D). */
  date: string | null;
  relDay: number | null;
  weekday: string | null;
  title: string;
  durationMin: number | null;
  competition: boolean;
  type: SessionKind;
  /** Título de la semana a la que pertenece (contexto en el detalle). */
  weekTitle: string | null;
  blocks: PlanBlock[];
};

export type ParsedWeek = {
  variant: string | null;
  number: number | null;
  title: string;
  start: string | null;
  end: string | null;
  text: string;
};

export type VariantOption = { code: string; label: string };

export type ParsedMeso = {
  code: string;
  name: string;
  start: string;
  end: string;
  version: string | null;
  /** Introducción del bloque: objetivos, estructura y reglas. */
  intro: Array<{ title: string | null; text: string }>;
  /** Anexos del final (cálculos, tabla de RM, referencias, vídeos…). */
  annexes: Array<{ title: string | null; text: string }>;
  weeks: ParsedWeek[];
  days: ParsedDay[];
  /** Opciones elegibles (hojas): vacío si el bloque no tiene versiones. */
  variants: VariantOption[];
  defaultVariant: string | null;
  warnings: string[];
};
