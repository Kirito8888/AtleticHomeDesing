import { beforeEach, describe, expect, it } from "vitest";

import { anonPath, errorRoutes, localSummary, recordRequest, resetMetrics, routeKey } from "./metrics";

describe("métricas internas de la API", () => {
  beforeEach(() => resetMetrics());

  it("agrupa por ruta sin identificadores ni tokens", () => {
    expect(routeKey("get", "/api/training/sessions/cm1abcdefghijklmnopqrstu?x=1")).toBe("GET /api/training/sessions/[id]");
    expect(routeKey("POST", "/api/share/AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcdefg")).toBe("POST /api/share/[id]");
  });

  it("cuenta peticiones, errores 5xx y percentiles de la última hora", () => {
    const now = Date.UTC(2026, 9, 10, 12, 0);
    for (let i = 1; i <= 100; i++) recordRequest("GET", "/api/a", i === 100 ? 500 : 200, i, now);
    recordRequest("POST", "/api/b", 503, 5, now);
    const m = localSummary(now);
    expect(m.count).toBe(101);
    expect(m.errors).toBe(2);
    expect(m.routes[0]).toMatchObject({ route: "GET /api/a", count: 100, errors: 1, p50: 51, p95: 96 });
    // Lo de hace más de una hora ya no cuenta
    expect(localSummary(now + 61 * 60_000).count).toBe(0);
  });

  it("anonPath y errorRoutes: solo rutas sin ids y las que fallan, las peores primero", () => {
    expect(anonPath("/api/x/123/clx9a8b7c6d5e4f3g2h1i0j9k?email=a@b.es")).toBe("/api/x/[id]/[id]");
    const now = Date.UTC(2026, 9, 10, 12, 0);
    recordRequest("GET", "/api/ok", 200, 5, now);
    recordRequest("GET", "/api/a/1", 500, 5, now);
    recordRequest("POST", "/api/b", 503, 5, now);
    recordRequest("POST", "/api/b", 500, 5, now);
    expect(errorRoutes(localSummary(now))).toEqual([
      { route: "POST /api/b", errors: 2, count: 2 },
      { route: "GET /api/a/[id]", errors: 1, count: 1 },
    ]);
  });
});
