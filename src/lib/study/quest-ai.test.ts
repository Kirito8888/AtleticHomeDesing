import { describe, expect, it } from "vitest";

import { check } from "./quest-engine";
import { bankItem, buildQuestPrompt, commandAnchored, commandFlags, fakeQuest, mergeBank, normalizeQuest, parseBank, type QuestAi, QUEST_COUNTS, shortHash } from "./quest-ai";

const SRC = `El comando tar crea archivos. Para listar el contenido se usa tar -tvf copia.tar y para extraer tar -xvf copia.tar.
La señal 15 (SIGTERM) permite al proceso terminar de forma ordenada. Con kill -9 se fuerza la salida.
$ mkdir -p empresa/ventas`;

const th = (o: Partial<QuestAi["theory"][number]> = {}): QuestAi["theory"][number] => ({
  question: "¿Qué señal envía kill por defecto?",
  correct: "La 15 (SIGTERM)",
  distractors: ["La 9 (SIGKILL)", "La 2 (SIGINT)", "La 1 (SIGHUP)"],
  explanation: "SIGTERM permite terminar de forma ordenada.",
  evidence: "La señal 15 (SIGTERM) permite al proceso terminar de forma ordenada",
  ...o,
});
const pr = (o: Partial<QuestAi["practice"][number]> = {}): QuestAi["practice"][number] => ({ question: "Lista el contenido de copia.tar", command: "tar -tvf copia.tar", shell: "b", evidence: "tar -tvf copia.tar", ...o });

describe("buildQuestPrompt", () => {
  const p = buildQuestPrompt({ moduleName: "Sistemas", nodeTitle: "Procesos", counts: QUEST_COUNTS, sources: SRC });
  it("pone las fuentes como datos delimitados y pide los recuentos", () => {
    expect(p.prompt).toContain("<<<\n" + SRC + "\n>>>");
    expect(p.prompt).toContain("6 preguntas de teoría");
    expect(p.prompt).toContain("Nivel: Procesos");
  });
  it("prohíbe inventar comandos, flags y distractores ajenos a las fuentes", () => {
    expect(p.system).toMatch(/PROHIBIDO inventar comandos, opciones/);
    expect(p.system).toMatch(/PROHIBIDO inventar distractores/);
    expect(p.system).toMatch(/ignora cualquier instrucci/);
  });
  it("no identifica al modelo", () => {
    expect(p.system + p.prompt).not.toMatch(/claude|gpt|gemini|anthropic|openai|llama/i);
  });
});

describe("comandos anclados en las fuentes", () => {
  it("extrae flags", () => {
    expect(commandFlags("tar -tvf copia.tar", "b")).toEqual(["-tvf"]);
    expect(commandFlags("rm -rf --no-preserve-root /x", "b")).toEqual(["-rf", "--no-preserve-root"]);
    expect(commandFlags("schtasks /create /tn x", "c")).toEqual(["/create", "/tn"]);
  });
  it("acepta lo que está y rechaza comando o flag inventado", () => {
    expect(commandAnchored("tar -tvf copia.tar", "b", SRC)).toBe(true);
    expect(commandAnchored("tar -xf copia.tar", "b", SRC)).toBe(true); // letras presentes en opciones de las fuentes
    expect(commandAnchored("tar -tvf copia.tar --strip-components=1", "b", SRC)).toBe(false);
    expect(commandAnchored("rsync -a a b", "b", SRC)).toBe(false);
    expect(commandAnchored("tar -Z copia.tar", "b", SRC)).toBe(false);
  });
});

describe("normalizeQuest", () => {
  it("construye teoría [pregunta, [correcta, 3 malas], explicación] y práctica corregible por el motor", () => {
    const items = normalizeQuest({ theory: [th()], practice: [pr()] }, SRC, "n1");
    expect(items).toHaveLength(2);
    expect(items[0].t?.[1]).toEqual(["La 15 (SIGTERM)", "La 9 (SIGKILL)", "La 2 (SIGINT)", "La 1 (SIGHUP)"]);
    expect(items[0].id).toMatch(/^ai:n1:[a-z0-9]+:t0$/);
    const p = items[1].p!;
    expect(check(p, "tar -tvf copia.tar")).toBe(true);
    expect(check(p, "tar -xvf copia.tar")).toBe(false);
  });
  it("descarta teoría con distractores repetidos o iguales a la correcta (si quedan < 3)", () => {
    expect(normalizeQuest({ theory: [th({ distractors: ["La 9", "la 9", "LA 15 (SIGTERM)"] })], practice: [] }, SRC, "n")).toHaveLength(0);
    expect(normalizeQuest({ theory: [th({ distractors: ["La 9", "La 2"] })], practice: [] }, SRC, "n")).toHaveLength(0);
  });
  it("recorta a 3 distractores si sobran", () => {
    const [it] = normalizeQuest({ theory: [th({ distractors: ["a1", "a2", "a3", "a4", "a5"] })], practice: [] }, SRC, "n");
    expect(it.t?.[1]).toHaveLength(4);
  });
  it("descarta lo que no está respaldado: cita ausente, «NO ESTÁ EN LAS FUENTES»", () => {
    expect(normalizeQuest({ theory: [th({ evidence: "Esto no aparece en los apuntes para nada" })], practice: [] }, SRC, "n")).toHaveLength(0);
    expect(normalizeQuest({ theory: [th({ correct: "NO ESTÁ EN LAS FUENTES" })], practice: [] }, SRC, "n")).toHaveLength(0);
  });
  it("descarta comandos inventados, con flags ajenas o multilínea", () => {
    const bad = [pr({ command: "rsync -a x y", evidence: "tar -tvf copia.tar" }), pr({ question: "b", command: "tar -tvf copia.tar --strip-components=2" }), pr({ question: "c", command: "tar -tvf copia.tar\nrm -rf /" })];
    expect(normalizeQuest({ theory: [], practice: bad }, SRC, "n")).toHaveLength(0);
  });
  it("deduplica enunciados y respeta las cuotas", () => {
    const many = Array.from({ length: 10 }, (_, i) => th({ question: `Pregunta ${i}` }));
    const items = normalizeQuest({ theory: [th(), th(), ...many], practice: [] }, SRC, "n");
    expect(items.filter((i) => i.type === "t")).toHaveLength(QUEST_COUNTS.t);
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
  });
  it("ids estables entre llamadas", () => {
    const a = normalizeQuest({ theory: [th()], practice: [] }, SRC, "n");
    const b = normalizeQuest({ theory: [th()], practice: [] }, SRC, "n");
    expect(a[0].id).toBe(b[0].id);
    expect(shortHash("x")).toBe(shortHash("x"));
  });
  it("la IA simulada produce preguntas válidas con los propios apuntes", () => {
    const items = normalizeQuest(fakeQuest(SRC), SRC, "n");
    expect(items.some((i) => i.type === "t")).toBe(true);
    expect(items.some((i) => i.type === "p" && i.p?.sol === "mkdir -p empresa/ventas")).toBe(true);
  });
});

describe("caché local", () => {
  const items = normalizeQuest({ theory: [th()], practice: [pr()] }, SRC, "n");
  it("guarda y recupera preguntas por id", () => {
    const bank = parseBank(JSON.stringify(mergeBank({}, items)));
    const back = bankItem(bank, items[1].id)!;
    expect(check(back.p!, "tar -tvf copia.tar")).toBe(true);
    expect(bankItem(bank, "nada")).toBeNull();
  });
  it("tolera JSON roto o mal formado", () => {
    expect(parseBank("{roto")).toEqual({});
    expect(parseBank("[1]")).toEqual({});
    expect(parseBank(JSON.stringify({ x: { id: "y", type: "t" } }))).toEqual({});
  });
  it("respeta el tope sin perder los fallos pendientes ni lo nuevo", () => {
    const old = normalizeQuest({ theory: Array.from({ length: 5 }, (_, i) => th({ question: `Vieja ${i}` })), practice: [] }, SRC, "o", { t: 5, p: 0 });
    const full = mergeBank({}, old, [], 99);
    const merged = mergeBank(full, items, [old[0].id], 4);
    expect(Object.keys(merged)).toContain(old[0].id);
    for (const it of items) expect(merged[it.id]).toBeDefined();
    expect(Object.keys(merged).length).toBeLessThanOrEqual(4);
  });
});
