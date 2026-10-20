import { describe, expect, it } from "vitest";

import { readXlsxRows, XlsxError } from "./calendar-import";

describe("readXlsxRows: errores", () => {
  it("un zip corrupto lanza un error interno (no XlsxError), para que la ruta no lo enseñe", () => {
    const bad = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
    let err: unknown;
    try {
      readXlsxRows(bad);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(XlsxError);
  });
});
