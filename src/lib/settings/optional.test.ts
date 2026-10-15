import { afterEach, describe, expect, it, vi } from "vitest";

import { optional } from "./optional";

afterEach(() => vi.restoreAllMocks());

describe("optional", () => {
  it("devuelve el valor cargado", async () => {
    expect(await optional("x", async () => 5, 0)).toBe(5);
  });
  it("devuelve la reserva si la carga falla y no registra el mensaje", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await optional("ia", async () => { throw new Error("token=SECRETO"); }, "reserva")).toBe("reserva");
    expect(spy).toHaveBeenCalledOnce();
    expect(String(spy.mock.calls[0][0])).not.toContain("SECRETO");
  });
});
