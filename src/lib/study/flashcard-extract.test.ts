import { describe, expect, it } from "vitest";

import type { AdaptDoc } from "./adhd-format";
import { cardsFromAdapt, cardsFromPack, dedupeCards, frontKey } from "./flashcard-extract";
import type { QuestItem } from "./quest-mock";

describe("frontKey / dedupeCards", () => {
  it("ignora mayúsculas, negritas, espacios y signos de cierre", () => {
    expect(frontKey("  ¿Qué es **RAID**?  ")).toBe(frontKey("qué es raid"));
  });
  it("descarta las existentes y las repetidas del lote", () => {
    const r = dedupeCards(
      [{ front: "RAID 1", back: "espejo" }, { front: "raid 1:", back: "otra" }, { front: "RAID 5", back: "paridad" }, { front: "LVM", back: "volúmenes" }],
      ["¿LVM?"],
    );
    expect(r.fresh.map((c) => c.front)).toEqual(["RAID 1", "RAID 5"]);
    expect(r.duplicates).toBe(2);
  });
});

describe("cardsFromAdapt", () => {
  const summary: AdaptDoc = {
    mode: "summary",
    doc: {
      title: "Discos",
      oneLiner: "x",
      sections: [{ heading: "RAID", blocks: ["**RAID 1**: copia espejo de dos discos.", "El **striping** reparte los datos entre discos. Mejora la velocidad.", "Sin negritas aquí."] }],
      remember: ["**LVM** — gestiona volúmenes lógicos"],
    },
  };
  it("término: definición y negrita + frase, sin inventar", () => {
    expect(cardsFromAdapt(summary)).toEqual([
      { front: "RAID 1", back: "copia espejo de dos discos." },
      { front: "striping", back: "El striping reparte los datos entre discos." },
      { front: "LVM", back: "gestiona volúmenes lógicos" },
    ]);
  });
  it("sin negritas ni definiciones → 0 tarjetas", () => {
    expect(cardsFromAdapt({ mode: "summary", doc: { title: "t", oneLiner: "x", sections: [{ heading: "h", blocks: ["Todo plano."] }], remember: [] } })).toEqual([]);
  });
  it("esquema: detail y nodos con hijos", () => {
    const c = cardsFromAdapt({ mode: "outline", doc: { title: "t", root: { label: "Raíz", children: [{ label: "Niveles", children: [{ label: "RAID 0" }, { label: "RAID 1" }] }, { label: "LVM", detail: "volúmenes" }] } } });
    expect(c).toEqual([{ front: "Niveles", back: "• RAID 0\n• RAID 1" }, { front: "LVM", back: "volúmenes" }]);
  });
  it("informe: conceptos, chuleta y autoevaluación emparejada", () => {
    const c = cardsFromAdapt({
      mode: "report",
      doc: {
        title: "t",
        map: [{ topic: "a", tag: "red", minutes: 5 }],
        topics: [{ name: "a", tag: "red", inThirty: [], concepts: ["**inodo**: metadatos de un fichero"], commands: [], tables: [], traps: [] }],
        cheatSheet: [{ group: "g", terms: ["**ls** = lista ficheros"] }],
        selfTest: [{ topic: "a", recall: ["¿Qué es un inodo?", "¿Y ls?"], exercise: "", solutions: ["Metadatos", "Lista"] }],
        lastTen: [],
      },
    } as AdaptDoc);
    expect(c.map((x) => x.front)).toEqual(["inodo", "ls", "¿Qué es un inodo?", "¿Y ls?"]);
  });
  it("recorta a 500/1000 y máx. 200", () => {
    const blocks = Array.from({ length: 250 }, (_, i) => `**T${i}**: ${"d".repeat(2000)}`);
    const c = cardsFromAdapt({ mode: "summary", doc: { title: "t", oneLiner: "x", sections: [{ heading: "h", blocks: blocks.slice(0, 20) }, ...Array.from({ length: 11 }, () => ({ heading: "h", blocks: blocks.slice(0, 20) }))], remember: [] } });
    expect(c.length).toBeLessThanOrEqual(200);
    expect(c[0].back.length).toBe(1000);
  });
});

describe("cardsFromPack", () => {
  const it_ = (id: string, t: QuestItem["t"]): QuestItem => ({ id, lid: "n", type: "t", t });
  it("solo test teórico: pregunta → correcta + explicación", () => {
    const c = cardsFromPack([
      it_("pk:n:tt:a1", ["¿Qué hace chmod?", ["Cambia permisos", "Borra", "Copia", "Lista"], "Modifica el modo."]),
      it_("pk:n:pt:b1", ["Práctico", ["x", "y", "z", "w"]]),
      it_("pk:n:tt:a2", ["¿Y chown?", ["Cambia el dueño", "a", "b", "c"]]),
    ]);
    expect(c).toEqual([
      { front: "¿Qué hace chmod?", back: "Cambia permisos\n\nModifica el modo." },
      { front: "¿Y chown?", back: "Cambia el dueño" },
    ]);
  });
});
