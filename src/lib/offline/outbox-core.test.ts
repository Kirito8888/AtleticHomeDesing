import { describe, expect, it } from "vitest";

import { DRAFT_TTL_MS, outboxId, outcome, partitionByOwner, usableDraft, type OutboxItem } from "./outbox-core";

const item = (id: string, createdAt: number, owner?: string): OutboxItem => ({ id, url: "/api/training/sessions", body: {}, label: id, createdAt, owner });

describe("partitionByOwner", () => {
  it("envía lo de la cuenta actual en orden de anotación", () => {
    const r = partitionByOwner([item("b", 2, "u1"), item("a", 1, "u1")], "u1");
    expect(r.send.map((x) => x.id)).toEqual(["a", "b"]);
    expect(r.drop).toEqual([]);
  });

  it("nunca envía lo de otra cuenta del mismo dispositivo: lo descarta", () => {
    const r = partitionByOwner([item("a", 1, "u1"), item("b", 2, "u2")], "u2");
    expect(r.send.map((x) => x.id)).toEqual(["b"]);
    expect(r.drop.map((x) => x.id)).toEqual(["a"]);
  });

  it("lo anterior a v3.2 (sin dueña) se sigue enviando", () => {
    expect(partitionByOwner([item("viejo", 1)], "u1").send).toHaveLength(1);
  });

  it("sin saber la cuenta, nada con dueña se envía", () => {
    expect(partitionByOwner([item("a", 1, "u1")], null).send).toEqual([]);
  });
});

describe("outcome", () => {
  it("sin red, sesión caducada, límite o servidor caído: reintentar luego", () => {
    for (const s of [null, 401, 408, 429, 500, 503]) expect(outcome(s)).toBe("retry");
  });
  it("2xx enviado; el resto de 4xx, rechazado", () => {
    expect(outcome(200)).toBe("done");
    expect(outcome(201)).toBe("done");
    for (const s of [400, 403, 404, 422]) expect(outcome(s)).toBe("reject");
  });
});

describe("outboxId", () => {
  it("una sesión nueva por su clientId; los cambios, uno por sesión (gana el último)", () => {
    expect(outboxId("POST", "abc")).toBe("abc");
    expect(outboxId("PATCH", "s1")).toBe("patch:s1");
  });
});

describe("usableDraft", () => {
  const now = 1_000_000_000_000;
  const d = { key: "new", owner: "u1", savedAt: now - 1000, data: {} };
  it("solo la misma cuenta y con menos de 24 h", () => {
    expect(usableDraft(d, "u1", now)).toBe(true);
    expect(usableDraft(d, "u2", now)).toBe(false);
    expect(usableDraft(d, null, now)).toBe(false);
    expect(usableDraft({ ...d, savedAt: now - DRAFT_TTL_MS }, "u1", now)).toBe(false);
    expect(usableDraft(null, "u1", now)).toBe(false);
  });
});
