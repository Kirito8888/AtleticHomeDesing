import { describe, expect, it } from "vitest";

import { healthStatus } from "./health";

describe("healthStatus (Bloque 8)", () => {
  it("BD caída → caído", () => expect(healthStatus(false, null).status).toBe("caído"));
  it("cola vacía o sin crear → ok", () => expect(healthStatus(true, { stuck: 0, failed24h: 0 })).toEqual({ status: "ok", db: true, queue: "ok" }));
  it("trabajos atascados → degradado", () => expect(healthStatus(true, { stuck: 2, failed24h: 0 })).toMatchObject({ status: "degradado", queue: "atascada" }));
  it("fallidos en 24 h → degradado", () => expect(healthStatus(true, { stuck: 0, failed24h: 1 })).toMatchObject({ status: "degradado", queue: "fallos" }));
  it("cola ilegible → degradado", () => expect(healthStatus(true, null)).toMatchObject({ status: "degradado", queue: "ilegible" }));
});
