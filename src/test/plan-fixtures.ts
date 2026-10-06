import { buildPdf, type FixtureText } from "./pdf-fixture";

// Plan ficticio que imita la maquetación de los PDF «día a día» reales:
// cabecera y pie repetidos, semanas, días en dos líneas, tablas con celdas en
// varias líneas, rampas, una fila partida por el salto de página y «Por qué».
const COLS = [66, 180, 245, 316, 341, 375];
const head = (meso: string, cont?: string): FixtureText[] => [
  { x: 57, y: 811, text: meso },
  ...(cont ? [{ x: 393, y: 811, text: `Continúa: ${cont}` }] : []),
];
const foot = (n: number): FixtureText[] => [
  { x: 57, y: 31, text: "Mi planificación 2026-27 · MX día a día · versión 7" },
  { x: 506, y: 31, text: `Página ${n}` },
];
const tableHeader = (y: number): FixtureText[] =>
  ["Ejercicio", "Series × reps", "%RM / carga", "RIR", "Desc.", "Cómo lo hago"].map((text, i) => ({ x: COLS[i], y, text }));
const cells = (y: number, values: Array<string | null>): FixtureText[] =>
  values.flatMap((text, i) => (text ? [{ x: COLS[i], y, text }] : []));

const MESO_HEADER = "M5 · Bloque de prueba · 26/10 – 22/11/2026";

export function mesoPdf(): Uint8Array {
  const p1: FixtureText[] = [
    ...head(MESO_HEADER),
    { x: 63, y: 773, size: 18, text: "M5 · Bloque de prueba (fuerza) · 26/10 –" },
    { x: 63, y: 751, size: 18, text: "22/11/2026" },
    { x: 63, y: 683, size: 13, text: "Qué busco en este mesociclo" },
    { x: 71, y: 661, size: 9, text: "Subir la fuerza máxima sin perder velocidad." },
    { x: 63, y: 462, size: 13, text: "SEMANA 1 · 26/10 – 01/11 · Entrada" },
    { x: 71, y: 440, size: 9, text: "Microciclo S1. Primera semana del bloque." },
    { x: 70, y: 400, size: 10, text: "M5 · S1 · LUNES 26/10 · Snatch ligero + JABALINA ·" },
    { x: 70, y: 388, size: 10, text: "~109 min (coche) / ~104 (bici)" },
    { x: 63, y: 370, text: "Calentamiento (8 min):" },
    { x: 170, y: 370, text: "5 min de trote suave y skipping" },
    { x: 63, y: 359, text: "bajo 2 × 15 m." },
    ...tableHeader(340),
    ...cells(326, ["Rampa (no cuenta)", "1 × 3 y 1 × 3", "30 % y 60 %", "-", "1 min", "Máxima intención"]),
    ...cells(312, ["Snatch colgante", "3 × 2", "70 %", "2", "3 min", "Rápido y preciso"]),
    ...cells(298, ["Lanzamientos con", "5", "Submáximo", "-", "A dem", "Foco: un solo"]),
    ...cells(288, ["jabalina 700 g", "lanzamientos", null, null, "anda", "punto técnico"]),
    ...cells(278, [null, null, null, null, null, "en cada intento"]),
    ...cells(264, ["Copenhagen", "2 × 20\"/lado", "Peso corporal", "2", "60 s", "Anoto cómo me"]),
    ...foot(1),
  ];
  const p2: FixtureText[] = [
    ...head(MESO_HEADER, "M5 · S1 · LUNES 26/10"),
    ...tableHeader(781),
    ...cells(767, [null, null, null, null, null, "encuentro (0-10)"]),
    ...cells(753, ["Ulnar sliders", "2 × 10", "Peso corporal", "-", "30 s", "Todos los días"]),
    { x: 70, y: 730, text: "Por qué:" },
    { x: 110, y: 730, text: "Texto de ejemplo para el" },
    { x: 70, y: 719, text: "apartado de explicación." },
    { x: 70, y: 690, size: 10, text: "M5 · S1 · MARTES 27/10 · Sentadilla frontal + tren superior · ~139 min (coche)" },
    ...tableHeader(670),
    ...cells(656, ["Sentadilla frontal", "4 × 4", "83 %", "2", "3-4", "Codos altos"]),
    ...cells(646, [null, null, null, null, "min", null]),
    { x: 70, y: 600, size: 10, text: "M5 · S1 · SÁBADO 31/10 (+ domingo) · Piscina (mañana) · ~28 min en el agua" },
    { x: 63, y: 580, text: "Nado suave 20 min." },
    { x: 63, y: 540, size: 13, text: "SEMANA 2 · 02/11 – 08/11 · Carga" },
    { x: 70, y: 500, size: 10, text: "M5 · S2 · LUNES 02/11 · Festivo: solo pista · ~60 min (coche)" },
    ...tableHeader(480),
    ...cells(466, ["Aceleraciones de 25 m", "4 × 25 m", "≥95 % de esfuerzo".replace("≥", ">="), "-", "2,5 min", "Salida en tres apoyos"]),
    // Los anexos del final no son parte del último día.
    { x: 63, y: 420, size: 13, text: "Anexo B · Mi tabla de RM (kg)" },
    { x: 63, y: 400, text: "Sentadilla frontal 100" },
    ...foot(2),
  ];
  return buildPdf([p1, p2]);
}

/** M9: versiones A (con subvariantes por día de competición) y B. */
export function versionsPdf(): Uint8Array {
  const H = "M9 · A: Realización · B: Transformación · 15/02 – 28/02/2027";
  const day = (y: number, code: string, when: string, title: string): FixtureText[] => [
    { x: 70, y, size: 10, text: `M9 · ${code} · ${when} · ${title} · ~90 min (coche)` },
    ...tableHeader(y - 20),
    ...cells(y - 34, ["Sentadilla", "3 × 3", "80 %", "2", "3 min", "Rápido"]),
  ];
  return buildPdf([
    [
      ...head(H),
      { x: 63, y: 760, size: 13, text: "VERSIÓN A · SEMANA 1 · 15/02 – 21/02 · Taper 1" },
      ...day(730, "A·S1", "LUNES 15/02", "Snatch ligero"),
      { x: 63, y: 660, size: 13, text: "VERSIÓN A · SEMANA 2 · 22/02 – 28/02 · Variante 1: mi jabalina es el VIERNES 26" },
      ...day(630, "A·S2-V", "VIERNES 26/02", "CAMPEONATO DE ESPAÑA DE INVIERNO · jabalina"),
      { x: 63, y: 560, size: 13, text: "VERSIÓN A · SEMANA 2 · 22/02 – 28/02 · Variante 2: mi jabalina es el SÁBADO 27" },
      ...day(530, "A·S2-S", "SÁBADO 27/02", "CAMPEONATO DE ESPAÑA DE INVIERNO · jabalina"),
      { x: 63, y: 460, size: 13, text: "VERSIÓN B · SEMANA 1 · 15/02 – 21/02 · Transformación: carga" },
      ...day(430, "B·S1", "LUNES 15/02", "Snatch + JABALINA"),
      { x: 63, y: 360, size: 13, text: "VERSIÓN B · SEMANA 2 · 22/02 – 28/02 · Transformación: carga" },
      ...day(330, "B·S2", "LUNES 22/02", "Snatch + JABALINA"),
      ...foot(1),
    ],
  ]);
}

