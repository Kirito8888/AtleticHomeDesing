import { describe, expect, it } from "vitest";

import { batchToItems, gameBatchSchema, mcqToTheory, sanitizeBatch, sanitizeSummary, summarySchema } from "./pack-schema";

const SRC = `El comando useradd crea usuarios. Con useradd -m -s /bin/bash ana se crea el home.
El fichero /etc/passwd guarda las cuentas. Para ver permisos se usa ls -l.`;

const block = (ev = "El comando useradd crea usuarios") => ({ title: "Usuarios", concepts: ["a", "b", "c", "d"], commands: [], tables: [], traps: [], mnemonics: [], errata: [], evidence: ev });
const summary = () => ({
  topic: "Usuarios",
  levels: { safe: [block()], probable: [], extra: [] },
  tenMinutes: ["1", "2", "3", "4", "5"],
  selfTest: { questions: Array.from({ length: 10 }, (_, i) => `q${i}`), practicals: ["p1", "p2"] },
  solutions: { questions: Array.from({ length: 10 }, (_, i) => `s${i}`), practicals: ["s1", "s2"] },
});
const mcq = (q = "¿Qué hace useradd?", ev = "El comando useradd crea usuarios") => ({ question: q, options: ["Crea usuarios", "Borra usuarios", "Lista permisos", "Cambia la clave"], correct: 0, explanation: "Crea cuentas.", evidence: ev });
const cmd = (solution = "useradd -m -s /bin/bash ana", extra: Partial<{ validVariants: string[]; evidence: string }> = {}) => ({
  prompt: "Crea el usuario ana con home y bash",
  solution,
  validVariants: extra.validVariants ?? ["useradd -s /bin/bash -m ana"],
  explanation: "-m crea el home.",
  shell: "b" as const,
  evidence: extra.evidence ?? "Con useradd -m -s /bin/bash ana se crea el home",
});

describe("summarySchema", () => {
  it("acepta un resumen completo", () => {
    expect(summarySchema.safeParse(summary()).success).toBe(true);
  });
  it("rechaza más de 4 viñetas por bloque", () => {
    const s = summary();
    s.levels.safe[0].concepts.push("e");
    expect(summarySchema.safeParse(s).success).toBe(false);
  });
  it("«10 minutos» son exactamente 5 puntos y la autoevaluación 10 + 2", () => {
    const a = summary();
    a.tenMinutes.pop();
    expect(summarySchema.safeParse(a).success).toBe(false);
    const b = summary();
    b.selfTest.questions.pop();
    expect(summarySchema.safeParse(b).success).toBe(false);
    const c = summary();
    c.solutions.practicals.push("x");
    expect(summarySchema.safeParse(c).success).toBe(false);
  });
});

describe("gameBatchSchema", () => {
  it("rechaza 5 opciones o `correct` fuera de rango", () => {
    expect(gameBatchSchema.safeParse({ theoryTest: [{ ...mcq(), options: ["a", "b", "c", "d", "e"] }] }).success).toBe(false);
    expect(gameBatchSchema.safeParse({ theoryTest: [{ ...mcq(), correct: 4 }] }).success).toBe(false);
  });
  it("un lote vacío es válido (todos los tipos por defecto)", () => {
    expect(gameBatchSchema.parse({}).practiceCmd).toEqual([]);
  });
  it("el desarrollo exige 3–6 puntos clave", () => {
    const e = { question: "Explica useradd", modelAnswer: "Crea usuarios", keyPoints: ["a", "b"], explanation: "x", evidence: "El comando useradd crea usuarios" };
    expect(gameBatchSchema.safeParse({ theoryEssay: [e] }).success).toBe(false);
    expect(gameBatchSchema.safeParse({ theoryEssay: [{ ...e, keyPoints: ["a", "b", "c"] }] }).success).toBe(true);
  });
});

describe("sanitizeBatch", () => {
  const batch = (over: object) => gameBatchSchema.parse(over);
  it("conserva lo respaldado por las fuentes", () => {
    const r = sanitizeBatch(batch({ theoryTest: [mcq()], practiceCmd: [cmd()] }), SRC);
    expect(r.dropped).toBe(0);
    expect(r.batch.practiceCmd).toHaveLength(1);
  });
  it("descarta citas inventadas", () => {
    expect(sanitizeBatch(batch({ theoryTest: [mcq("¿x?", "esto no sale en los apuntes para nada")] }), SRC).dropped).toBe(1);
  });
  it("descarta comandos u opciones que no están en los apuntes (incluidas las variantes)", () => {
    expect(sanitizeBatch(batch({ practiceCmd: [cmd("useradd -Z ana")] }), SRC).dropped).toBe(1);
    expect(sanitizeBatch(batch({ practiceCmd: [cmd("useradd -m ana", { validVariants: ["adduser ana"] })] }), SRC).dropped).toBe(1);
  });
  it("descarta repetidas y con opciones duplicadas", () => {
    const dup = { ...mcq(), options: ["Crea usuarios", "Crea usuarios", "x", "y"] };
    expect(sanitizeBatch(batch({ theoryTest: [mcq(), mcq(), dup] }), SRC).dropped).toBe(2);
  });
  it("comandos en varias líneas se rechazan", () => {
    expect(sanitizeBatch(batch({ practiceCmd: [cmd("useradd -m ana\nls -l")] }), SRC).dropped).toBe(1);
  });
});

describe("sanitizeSummary", () => {
  it("quita los bloques sin cita en las fuentes", () => {
    const s = summarySchema.parse(summary());
    s.levels.probable.push(block("frase que no aparece en ninguna parte"));
    const r = sanitizeSummary(s, SRC);
    expect(r.dropped).toBe(1);
    expect(r.summary.levels.probable).toHaveLength(0);
    expect(r.summary.levels.safe).toHaveLength(1);
  });
});

describe("adaptadores", () => {
  it("la correcta pasa a primera posición", () => {
    const t = mcqToTheory({ ...mcq(), correct: 2 });
    expect(t[1][0]).toBe("Lista permisos");
    expect(t[1]).toHaveLength(4);
    expect(new Set(t[1]).size).toBe(4);
  });
  it("batchToItems genera ids estables con tipo t/p/e y conserva las variantes", () => {
    const b = gameBatchSchema.parse({ theoryTest: [mcq()], practiceCmd: [cmd()], theoryEssay: [{ question: "Explica useradd", modelAnswer: "Crea", keyPoints: ["a", "b", "c"], explanation: "x", evidence: "El comando useradd crea usuarios" }] });
    const items = batchToItems(b, "T1");
    expect(items.map((i) => i.type)).toEqual(["t", "p", "e"]);
    expect(items[1].p?.ok).toEqual(["useradd -s /bin/bash -m ana"]);
    expect(batchToItems(b, "T1").map((i) => i.id)).toEqual(items.map((i) => i.id));
    expect(batchToItems(b, "T2")[0].id).not.toBe(items[0].id);
  });
});
