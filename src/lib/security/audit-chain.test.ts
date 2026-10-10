import { describe, expect, it } from "vitest";

import { chainKey, eventHash, verifyChain } from "./audit-chain";

const key = chainKey("secreto-de-prueba");
function chain(n: number) {
  const out = [];
  let prev: string | null = null;
  for (let i = 0; i < n; i++) {
    const e = { id: `e${i}`, userId: "u", type: "LOGIN_SUCCESS", ip: "1.2.3.4", userAgent: null, detail: null, createdAt: new Date(Date.UTC(2026, 9, 1, 0, i)) };
    const hash = eventHash(key, prev, e);
    out.push({ ...e, prevHash: prev, hash });
    prev = hash;
  }
  return out;
}

describe("auditoría encadenada", () => {
  it("una cadena intacta se verifica", () => {
    expect(verifyChain(key, chain(5))).toEqual({ ok: true, checked: 5 });
  });
  it("detecta un evento cambiado, uno borrado del medio y una clave distinta", () => {
    const c = chain(5);
    expect(verifyChain(key, c.map((e, i) => (i === 2 ? { ...e, ip: "9.9.9.9" } : e)))).toMatchObject({ ok: false, brokenAt: "e2" });
    expect(verifyChain(key, c.filter((_, i) => i !== 2))).toMatchObject({ ok: false, brokenAt: "e3" });
    expect(verifyChain(chainKey("otra"), c).ok).toBe(false);
  });
  it("borrar los más antiguos (conservación) no rompe la cadena; los eventos sin hash se ignoran", () => {
    const c = chain(5).slice(2);
    expect(verifyChain(key, [{ ...c[0], id: "viejo", hash: null, prevHash: null }, ...c])).toEqual({ ok: true, checked: 3 });
  });
});
