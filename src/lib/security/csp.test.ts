import { describe, expect, it } from "vitest";

import { buildCsp, generateNonce } from "./csp";

describe("csp", () => {
  it("genera nonces distintos", () => {
    expect(generateNonce()).not.toBe(generateNonce());
  });

  it("incluye el nonce y bloquea inline sin nonce", () => {
    const csp = buildCsp("abc", { dev: false, https: true });
    expect(csp).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("en desarrollo permite eval y sin https no fuerza upgrade", () => {
    const csp = buildCsp("abc", { dev: true, https: false });
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).not.toContain("upgrade-insecure-requests");
  });
});
