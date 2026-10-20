import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RouteError } from "./route-error";

const html = (error: Error) => renderToStaticMarkup(createElement(RouteError, { where: "Esta página", error, reset: () => {} }));

describe("RouteError", () => {
  it("error genérico: en español, con código y «Reintentar»", () => {
    const h = html(Object.assign(new Error("boom"), { digest: "abc123" }));
    expect(h).toContain("Esta página no se ha podido mostrar.");
    expect(h).toContain("abc123");
    expect(h).toContain("Reintentar");
  });
  it("ChunkLoadError: pide recargar", () => {
    const h = html(Object.assign(new Error("Loading chunk 12 failed"), { name: "ChunkLoadError" }));
    expect(h).toContain("Recargar");
    expect(h).toContain("La app se ha actualizado");
  });
  it("fallo de red: «Sin conexión» con reintento", () => {
    const h = html(new TypeError("Failed to fetch"));
    expect(h).toContain("Sin conexión");
    expect(h).toContain("Reintentar");
    expect(h).not.toContain("no se ha podido mostrar");
  });
});
