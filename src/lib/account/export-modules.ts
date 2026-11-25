/**
 * v3.2 · Bloque N (V3-N06) · Exportación guiada de mis datos (RGPD art. 20).
 * Lógica pura (sin BD, sin `server-only`): la usa la ruta, `exportAccount` y la pantalla de Privacidad.
 *
 * - Cada módulo es un grupo de secciones del JSON `lifeos-export/2`; la cuenta (`user`, `security`,
 *   `privacy`, `app`) va siempre.
 * - Lo cifrado en reposo (ciclo, salud de la mujer, ISAK, bienestar y los detalles de «entreno sola»)
 *   NO sale salvo que la propia usuaria lo marque (`sensitive`): el fichero lo lleva descifrado.
 * - Nada de datos de otras personas: ver `exportAccount` (comentarios, vínculos y contactos).
 */
import { AUTHORSHIP_NOTICE } from "@/lib/legal/notice";

export const EXPORT_MODULE_KEYS = ["training", "recovery", "nutrition", "planning", "finance", "study", "coach", "clubs"] as const;
export type ExportModuleKey = (typeof EXPORT_MODULE_KEYS)[number];

export type ExportModule = {
  key: ExportModuleKey;
  label: string;
  /** Qué lleva, en lenguaje llano (se muestra en «Qué incluye»). */
  includes: string[];
  /** Secciones de primer nivel del JSON que aporta este módulo. */
  sections: string[];
};

export const EXPORT_MODULES: readonly ExportModule[] = [
  {
    key: "training",
    label: "Entreno",
    includes: ["Sesiones, series, intervalos y marcas", "Umbrales, cargas diarias, ejercicios propios y plantillas", "Tests físicos, 1RM y material", "Entrenos del reloj (bandeja de Apple) y tu token de envío (sin su clave)", "Curvas y protocolos propios de fisioterapia"],
    sections: ["training", "training21", "appleFitness"],
  },
  {
    key: "recovery",
    label: "Recuperación",
    includes: ["Sueño, VFC, FC en reposo y readiness", "Lesiones, fotos (solo datos, no la imagen) y vuelta por fases", "Medidas corporales, suplementos y citas", "Informes de salud y «entreno sola» (sin la nota ni la ubicación)", "Lo que llegó de Apple Salud y sus conflictos"],
    sections: ["recovery", "appleHealth"],
  },
  {
    key: "nutrition",
    label: "Nutrición",
    includes: ["Comidas registradas y objetivos de macros", "Alimentos propios, favoritos y recetas", "Plan de comidas, lista de la compra e hidratación", "Pruebas de sudoración"],
    sections: ["nutrition"],
  },
  {
    key: "planning",
    label: "Plan y calendario",
    includes: ["Eventos, tareas y plan importado", "Enlaces de calendario (sin su clave)", "Objetivos y revisiones semanales"],
    sections: ["planning", "calendarFeeds", "goals"],
  },
  {
    key: "finance",
    label: "Finanzas",
    includes: ["Cuentas, categorías y movimientos", "Presupuestos, suscripciones y viajes", "Plazos, presupuesto de temporada y reglas de categoría", "Justificantes (solo datos, no el fichero)"],
    sections: ["finance"],
  },
  {
    key: "study",
    label: "Estudio",
    includes: ["Asignaturas y apuntes (sin el fichero original)", "Chats, flashcards y tu progreso de repaso", "Horario, sesiones, hábitos y notas", "Trabajos y bloques del plan de estudio"],
    sections: ["study"],
  },
  {
    key: "coach",
    label: "Entrenadora y comentarios",
    includes: ["Informes semanales de coach de tus datos", "Los comentarios que has escrito tú", "De cada vínculo: tu papel, estado, permisos y fechas", "Enlaces de informe que compartiste (sin su clave)"],
    sections: ["coach"],
  },
  {
    key: "clubs",
    label: "Clubes",
    includes: ["Tus membresías (club, rol y permisos)", "Tus propias cuotas"],
    sections: ["clubs"],
  },
];

/** Qué es «lo cifrado», para el aviso de la pantalla. */
export const SENSITIVE_INCLUDES = [
  "Ciclo menstrual",
  "Salud de la mujer",
  "Composición corporal (ISAK)",
  "Bienestar y estado de ánimo",
  "Nota y ubicación de «entreno sola»",
] as const;

/** Secciones que la cuenta lleva siempre. */
const ALWAYS = ["exportedAt", "format", "user", "security", "privacy", "app"] as const;

export type ExportSelection = { modules: ExportModuleKey[]; sensitive: boolean };

export class ExportQueryError extends Error {}

/** `modules=a,b` y `sensitive=1`. Sin `modules` → todos; claves desconocidas o lista vacía → error (400). */
export function parseExportQuery(params: URLSearchParams): ExportSelection {
  const raw = params.get("modules");
  let modules: ExportModuleKey[] = [...EXPORT_MODULE_KEYS];
  if (raw !== null) {
    const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
    if (!parts.length) throw new ExportQueryError("Elige al menos un módulo para exportar");
    const unknown = parts.filter((p) => !(EXPORT_MODULE_KEYS as readonly string[]).includes(p));
    if (unknown.length) throw new ExportQueryError(`Módulo desconocido: ${unknown.join(", ")}`);
    modules = EXPORT_MODULE_KEYS.filter((k) => parts.includes(k));
  }
  return { modules, sensitive: params.get("sensitive") === "1" };
}

/** Consulta equivalente a una selección (la usa la pantalla para el enlace de descarga). */
export function exportQuery(sel: ExportSelection): string {
  const q = new URLSearchParams({ modules: sel.modules.join(",") });
  if (sel.sensitive) q.set("sensitive", "1");
  return q.toString();
}

type Json = Record<string, unknown>;

/** Claves de `recovery` que son salud cifrada. */
export const SENSITIVE_RECOVERY_KEYS = ["menstrualCycle", "womenHealth", "wellbeing", "bodyComposition"] as const;

/**
 * Recorta la exportación completa a lo elegido y le pone el pie de autoría. Lo cifrado solo se conserva
 * con `sensitive`; sin él ni siquiera aparece la clave (no hay `null` que insinúe que existe).
 * `full` es la exportación con todas las secciones; esta función no toca la BD.
 */
export function shapeExport<T extends Json>(full: T, sel: ExportSelection): T & { notice: string; selection: ExportSelection } {
  const out: Json = { notice: AUTHORSHIP_NOTICE };
  for (const k of ALWAYS) if (k in full) out[k] = full[k];
  out.selection = { modules: sel.modules, sensitive: sel.sensitive };
  const wanted = new Set(EXPORT_MODULES.filter((m) => sel.modules.includes(m.key)).flatMap((m) => m.sections));
  for (const k of wanted) if (k in full) out[k] = full[k];

  const recovery = (full.recovery ?? {}) as Json;
  const hasRecovery = sel.modules.includes("recovery");
  if (hasRecovery || sel.sensitive) {
    const r: Json = {};
    for (const [k, v] of Object.entries(recovery)) {
      const isSensitive = (SENSITIVE_RECOVERY_KEYS as readonly string[]).includes(k);
      if (isSensitive ? sel.sensitive : hasRecovery) r[k] = v;
    }
    out.recovery = r;
  }
  // El tipo es el de la exportación completa (cómodo para quien la lee); en ejecución solo hay lo elegido
  return out as T & { notice: string; selection: ExportSelection };
}
