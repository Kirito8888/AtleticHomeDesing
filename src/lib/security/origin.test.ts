import { describe, expect, it } from "vitest";

import { expectedOrigin, originAllowed } from "./origin";

const h = (o: Record<string, string>) => new Headers(o);

describe("originAllowed", () => {
  it("acepta el origen propio y la ausencia de cabeceras (no es un navegador)", () => {
    expect(originAllowed(h({ origin: "https://app.test" }), "https://app.test")).toBe(true);
    expect(originAllowed(h({}), "https://app.test")).toBe(true);
    expect(originAllowed(h({ "sec-fetch-site": "same-origin" }), "https://app.test")).toBe(true);
  });
  it("rechaza otro origen, un esquema distinto y cross-site sin Origin", () => {
    expect(originAllowed(h({ origin: "https://otro.test" }), "https://app.test")).toBe(false);
    expect(originAllowed(h({ origin: "http://app.test" }), "https://app.test")).toBe(false);
    expect(originAllowed(h({ "sec-fetch-site": "cross-site" }), "https://app.test")).toBe(false);
  });
  it("el esperado sale de AUTH_URL (sin barra final) o, si falta, de la petición", () => {
    expect(expectedOrigin("https://app.test/", "http://interno:3000/api/x")).toBe("https://app.test");
    expect(expectedOrigin(undefined, "http://localhost:3000/api/x")).toBe("http://localhost:3000");
  });
});
