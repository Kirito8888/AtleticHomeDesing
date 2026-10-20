import { describe, expect, it } from "vitest";

import { DOC_ERROR, publicDocError } from "./doc-error";

describe("publicDocError", () => {
  it("devuelve el texto fijo aunque la fila antigua guardara un mensaje interno", () => {
    expect(publicDocError("ECONNREFUSED 10.0.0.1:5432 at /srv/app/x.js")).toBe(DOC_ERROR);
    expect(publicDocError(null)).toBeNull();
  });
});
