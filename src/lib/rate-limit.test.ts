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
