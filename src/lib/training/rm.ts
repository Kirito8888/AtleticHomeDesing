/** Tabla de RM: nombres, %RM → kg, serie de test (Epley) y APRE. Funciones puras. */

/** Nombre normalizado para enlazar el plan con la tabla de RM y el catálogo. */
export function nameKey(name: string): string {
  return name
    .replace(/\s*·\s*SERIE DE TEST/gi, "") // antes de quitar diacríticos: «·» cuenta como uno
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9ñ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type RmEntry = { name: string; key: string; kg: number; perHand: boolean };

/**
 * Busca la RM de un ejercicio del plan: alias aprendido, nombre igual o uno
 * empieza por el otro («Peso muerto rumano» ↔ «Peso muerto rumano barra»).
 */
export function findRm(exercise: string, rms: RmEntry[], aliases: Map<string, string> = new Map()): RmEntry | null {
  const k = nameKey(exercise);
  if (!k) return null;
  const alias = aliases.get(k);
  if (alias) return rms.find((r) => r.key === alias) ?? null;
  return rms.find((r) => r.key === k) ?? rms.find((r) => r.key.startsWith(`${k} `) || k.startsWith(`${r.key} `)) ?? null;
}

/** Porcentajes de una celda de carga: «83 %» → [83]; «33 % y 66 %» → [33, 66]. */
export function parsePercents(load: string): number[] {
  return [...load.matchAll(/(\d{1,3}(?:[.,]\d+)?)\s*%/g)].map((m) => Number(m[1].replace(",", "."))).filter((n) => n > 0 && n <= 120);
}

/** ¿La carga es un %RM? «83 %» sí; «≥95 % de esfuerzo», «40 % de 88 %» no. */
export function isRmLoad(load: string): boolean {
  return parsePercents(load).length > 0 && !/esfuerzo|velocidad|≥|>=|%\s*de\s/i.test(load);
}

export function roundTo(kg: number, step: number): number {
  return Math.round(kg / step) * step;
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "").replace(".", ","));

/** «83 %» con RM 127,5 y escalón 2,5 → «105 kg»; varias cargas → «42,5 / 85 kg». */
export function loadToKg(load: string, rm: RmEntry | null, step: number): string | null {
  if (!rm) return null;
  if (!isRmLoad(load)) return null;
  const pcts = parsePercents(load);
  const kgs = pcts.map((p) => roundTo((rm.kg * p) / 100, step));
  return `${kgs.map(fmt).join(" / ")} kg${rm.perHand ? " por mano" : ""}`;
}

/** Fórmula de Epley: RM = carga × (1 + reps/30). */
export function epley(kg: number, reps: number): number {
  return Math.round(kg * (1 + reps / 30) * 10) / 10;
}

/** ¿Cambiar la RM de la tabla con una serie de test? Solo si difiere al menos `threshold` (5 % por defecto). */
export function testDecision(currentKg: number | null, kg: number, reps: number, threshold = 0.05) {
  const estimated = epley(kg, reps);
  const change = currentKg ? (estimated - currentKg) / currentKg : null;
  return { estimated, change, update: change == null || Math.abs(change) >= threshold };
}

/**
 * APRE (Mann et al. 2010): con las repeticiones de la serie 3 al máximo se
 * ajusta la carga de la serie 4 y la de la serie 3 de la próxima sesión.
 * Devuelve el cambio en kg (rango medio de la tabla original, en kg).
 */
export function apreAdjust(protocol: 3 | 6 | 10, reps: number): { kg: number; text: string } {
  const table: Record<3 | 6 | 10, Array<[number, number, number, string]>> = {
    3: [
      [0, 2, -3.75, "baja 2,5-5 kg"],
      [3, 4, 0, "mantén la carga"],
      [5, 6, 3.75, "sube 2,5-5 kg"],
      [7, 99, 6.25, "sube 5-7,5 kg"],
    ],
    6: [
      [0, 2, -3.75, "baja 2,5-5 kg"],
      [3, 4, -1.25, "baja 0-2,5 kg"],
      [5, 7, 0, "mantén la carga"],
      [8, 12, 3.75, "sube 2,5-5 kg"],
      [13, 99, 6.25, "sube 5-7,5 kg"],
    ],
    10: [
      [0, 6, -3.75, "baja 2,5-5 kg"],
      [7, 8, -1.25, "baja 0-2,5 kg"],
      [9, 11, 0, "mantén la carga"],
      [12, 16, 3.75, "sube 2,5-5 kg"],
      [17, 99, 6.25, "sube 5-7,5 kg"],
    ],
  };
  const row = table[protocol].find(([a, b]) => reps >= a && reps <= b)!;
  return { kg: row[2], text: row[3] };
}

/**
 * Lee la tabla de RM del anexo del plan («Sentadilla frontal 127,5 Sí …»).
 * Solo filas con un número y «Sí/No/Excluido» detrás; los valores estimados
 * («~50 …») o en repeticiones se ignoran. El usuario confirma antes de guardar.
 */
export function parseAnnexRms(text: string): Array<{ name: string; kg: number; perHand: boolean; used: boolean }> {
  const out = new Map<string, { name: string; kg: number; perHand: boolean; used: boolean }>();
  // `\b` no sirve con «Sí» (la í no es letra para \b): se mira el carácter siguiente.
  const re = /([A-ZÁÉÍÓÚÑ][^\d~·:¿?]*?)\s+(\d{1,3}(?:,\d{1,2})?)\s+(Sí|No|Excluido)(?=$|[\s,:.;])/gu;
  for (const m of text.matchAll(re)) {
    // Quita el «Sí, por RIR …» de la fila anterior que se cuela delante del nombre.
    const name = m[1]
      .replace(/^.*?(?:^|\s)(?:Sí|No|Excluido)(?=[\s,:.;])[^\p{Lu}]*(?:RIR\s+)?/u, "")
      .replace(/\s+/g, " ")
      .trim();
    if (name.length < 3 || /^(Ejercicio|RM)\b/.test(name)) continue;
    const kg = Number(m[2].replace(",", "."));
    if (!(kg > 0 && kg < 500)) continue;
    out.set(nameKey(name), { name, kg, perHand: /por mano/i.test(name), used: m[3] === "Sí" });
  }
  return [...out.values()];
}
