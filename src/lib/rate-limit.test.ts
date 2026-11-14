import { describe, expect, it } from "vitest";

import { clientIp, rateLimit } from "./rate-limit";

describe("rateLimit", () => {
  it("permite hasta el límite y luego bloquea con retryAfter", () => {
    const s = new Map<string, number[]>();
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) expect(rateLimit("k", 3, 60_000, t0 + i, s).ok).toBe(true);
    const blocked = rateLimit("k", 3, 60_000, t0 + 10, s);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBe(60);
  });

  it("la ventana es deslizante", () => {
    const s = new Map<string, number[]>();
    rateLimit("k", 1, 1000, 0, s);
    expect(rateLimit("k", 1, 1000, 500, s).ok).toBe(false);
    expect(rateLimit("k", 1, 1000, 1001, s).ok).toBe(true);
  });

  it("las claves son independientes", () => {
    const s = new Map<string, number[]>();
    rateLimit("a", 1, 1000, 0, s);
    expect(rateLimit("b", 1, 1000, 0, s).ok).toBe(true);
  });
});

describe("clientIp", () => {
  it("toma la IP que añade el proxy (última de X-Forwarded-For), luego X-Real-IP", () => {
    // El cliente puede inventarse "1.2.3.4"; 203.0.113.9 la añadió nuestro proxy.
    expect(clientIp(new Headers({ "x-forwarded-for": "1.2.3.4, 203.0.113.9" }))).toBe("203.0.113.9");
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.9" }))).toBe("203.0.113.9");
    expect(clientIp(new Headers({ "x-real-ip": "5.6.7.8" }))).toBe("5.6.7.8");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});

describe("clientIp · proxies de confianza (V3-S02)", () => {
  const h = (xff?: string, real?: string) => new Headers({ ...(xff ? { "x-forwarded-for": xff } : {}), ...(real ? { "x-real-ip": real } : {}) });
  it("0 proxies: no se fía de ninguna cabecera", () => {
    expect(clientIp(h("1.1.1.1, 2.2.2.2", "3.3.3.3"), 0)).toBe("unknown");
  });
  it("2 proxies: la penúltima entrada; con menos entradas, unknown", () => {
    expect(clientIp(h("9.9.9.9, 1.1.1.1, 2.2.2.2"), 2)).toBe("1.1.1.1");
    expect(clientIp(h("2.2.2.2"), 2)).toBe("unknown");
    expect(clientIp(h(undefined, "3.3.3.3"), 2)).toBe("unknown");
  });
  it("valor por defecto del entorno: 1 proxy; un valor roto vuelve a 1", () => {
    const old = process.env.TRUSTED_PROXY_HOPS;
    try {
      process.env.TRUSTED_PROXY_HOPS = "abc";
      expect(clientIp(h("1.1.1.1, 2.2.2.2"))).toBe("2.2.2.2");
      process.env.TRUSTED_PROXY_HOPS = "0";
      expect(clientIp(h("1.1.1.1, 2.2.2.2"))).toBe("unknown");
    } finally {
      if (old === undefined) delete process.env.TRUSTED_PROXY_HOPS;
      else process.env.TRUSTED_PROXY_HOPS = old;
    }
  });
});
