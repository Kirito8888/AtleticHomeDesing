// IA simulada del paquete (LIFEOS_FAKE_AI=1 y tests): JSON determinista construido con frases y comandos de los propios apuntes.
// Pasa por el mismo camino que una respuesta real (parseo, zod, validación contra las fuentes).
import { KIND_LABEL, KINDS, type Kind } from "./exam-format";

const sentences = (src: string) =>
  src
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20 && s.length < 180 && !s.startsWith("$") && !/^Diapositiva \d+$/.test(s));
const commands = (src: string) =>
  src
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("$ "))
    .map((l) => l.slice(2).trim());

/** El texto entre `<<<` y `>>>` del prompt: las fuentes. */
export const sourcesOf = (prompt: string) => /<<<\n([\s\S]*?)\n>>>/.exec(prompt)?.[1] ?? "";

/** Cantidades pedidas en un prompt de lote (`- N de <etiqueta> →`). */
export function countsOf(prompt: string): Partial<Record<Kind, number>> {
  const out: Partial<Record<Kind, number>> = {};
  for (const k of KINDS) {
    const m = new RegExp(`- (\\d+) de ${KIND_LABEL[k].replace(/[·]/g, "·")} →`).exec(prompt);
    if (m) out[k] = Number(m[1]);
  }
  return out;
}

export function fakeSummaryJson(prompt: string): string {
  const src = sourcesOf(prompt);
  const s = sentences(src);
  const cmds = commands(src);
  const pick = (i: number) => s[i % Math.max(1, s.length)] ?? "Apuntes del tema";
  const block = (i: number, title: string) => ({
    title,
    concepts: [pick(i), pick(i + 1)].slice(0, 4),
    commands: cmds[i % Math.max(1, cmds.length)] ? [{ syntax: cmds[i % cmds.length], options: [], typicalError: "Olvidar las opciones", paths: [] }] : [],
    tables: [],
    traps: [],
    mnemonics: [],
    errata: [],
    evidence: pick(i),
  });
  return JSON.stringify({
    topic: /Tema: (.*)/.exec(prompt)?.[1] ?? "Tema",
    levels: { safe: [block(0, "Lo esencial"), block(2, "Comandos clave")], probable: [block(4, "Detalles")], extra: [block(6, "Ampliación")] },
    tenMinutes: [0, 1, 2, 3, 4].map(pick),
    selfTest: { questions: Array.from({ length: 10 }, (_, i) => `(${i + 1}) ¿Qué dicen los apuntes sobre: ${pick(i).slice(0, 60)}?`), practicals: ["Practica 1: aplica el primer comando", "Practica 2: aplica el segundo comando"] },
    solutions: { questions: Array.from({ length: 10 }, (_, i) => pick(i)), practicals: [cmds[0] ?? "Ver apuntes", cmds[1] ?? cmds[0] ?? "Ver apuntes"] },
  });
}

export function fakeBatchJson(prompt: string): string {
  const src = sourcesOf(prompt);
  const s = sentences(src);
  const cmds = commands(src);
  const pick = (i: number) => s[i % Math.max(1, s.length)] ?? "Apuntes del tema";
  const c = countsOf(prompt);
  const mcq = (n: number, tag: string) =>
    Array.from({ length: n }, (_, i) => {
      const correct = i % 4;
      const wrong = [pick(i + 1), pick(i + 2), pick(i + 3)].map((x, j) => `Falso ${j + 1}: ${x}`);
      const options = [...wrong];
      options.splice(correct, 0, pick(i));
      return { question: `(${tag}${i + 1}) ¿Qué afirman los apuntes?`, options, correct, explanation: `Los apuntes dicen: ${pick(i)}`, evidence: pick(i) };
    });
  const essay = (n: number, tag: string) =>
    Array.from({ length: n }, (_, i) => ({ question: `(${tag}${i + 1}) Explica con tus palabras: ${pick(i).slice(0, 70)}`, modelAnswer: pick(i), keyPoints: [pick(i), pick(i + 1), pick(i + 2)], explanation: `Según los apuntes: ${pick(i)}`, evidence: pick(i) }));
  return JSON.stringify({
    theoryTest: mcq(c.theoryTest ?? 0, "T"),
    theoryEssay: essay(c.theoryEssay ?? 0, "D"),
    practiceCmd: cmds.length
      ? Array.from({ length: Math.min(c.practiceCmd ?? 0, cmds.length) }, (_, i) => ({ prompt: `(P${i + 1}) Escribe el comando de los apuntes nº ${i + 1}`, solution: cmds[i], validVariants: [], explanation: `Comando de los apuntes: ${cmds[i]}`, shell: "b", evidence: cmds[i].length >= 8 ? cmds[i] : `$ ${cmds[i]}` }))
      : [],
    practiceTest: mcq(c.practiceTest ?? 0, "PT"),
    practiceEssay: essay(c.practiceEssay ?? 0, "PD"),
  });
}
