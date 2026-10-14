// Integración (v2.0 E): límite de peticiones en Postgres, común a todas las réplicas.
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const HAS_DB = Boolean(process.env.DATABASE_URL);

describe.skipIf(!HAS_DB)("rateLimitPersistent (BD real)", () => {
  const keys: string[] = [];
  const t0 = Date.UTC(2026, 9, 10, 10, 0, 0); // ventana de 60 s: [10:00:00, 10:01:00)
  const mk = (n: string) => {
    const k = `t-${n}-${Date.now()}-${Math.random()}`;
    keys.push(k);
    return k;
  };

  afterAll(async () => {
    const { prisma } = await import("@/lib/prisma");
    const { hashKey } = await import("./rate-limit-db");
    await prisma.rateLimitHit.deleteMany({ where: { key: { in: keys.map(hashKey) } } });
  });

  it("límite 3 en 60 s: restan 2, 1, 0; el 4.º se bloquea con el tiempo exacto y la ventana siguiente vuelve a abrir", async () => {
    const { rateLimitPersistent } = await import("./rate-limit-db");
    const key = mk("seq");
    const r = [];
    for (let i = 0; i < 3; i++) r.push(await rateLimitPersistent(key, 3, 60_000, t0 + i * 1000));
    expect(r.map((x) => [x.ok, x.remaining])).toEqual([[true, 2], [true, 1], [true, 0]]);
    const blocked = await rateLimitPersistent(key, 3, 60_000, t0 + 10_000);
    expect(blocked).toEqual({ ok: false, remaining: 0, retryAfterSec: 50 });
    expect(await rateLimitPersistent(key, 3, 60_000, t0 + 60_000)).toEqual({ ok: true, remaining: 2, retryAfterSec: 0 });
  });

  it("es atómico: 10 intentos simultáneos con límite 5 → exactamente 5 pasan", async () => {
    const { rateLimitPersistent } = await import("./rate-limit-db");
    const key = mk("par");
    const res = await Promise.all(Array.from({ length: 10 }, () => rateLimitPersistent(key, 5, 60_000, t0)));
    expect(res.filter((x) => x.ok)).toHaveLength(5);
  });

  it("claves independientes y nunca en claro en la tabla", async () => {
    const { rateLimitPersistent, hashKey } = await import("./rate-limit-db");
    const { prisma } = await import("@/lib/prisma");
    const a = mk("a");
    const b = mk("b");
    await rateLimitPersistent(a, 1, 60_000, t0);
    expect((await rateLimitPersistent(a, 1, 60_000, t0)).ok).toBe(false);
    expect((await rateLimitPersistent(b, 1, 60_000, t0)).ok).toBe(true);
    expect(await prisma.rateLimitHit.count({ where: { key: a } })).toBe(0);
    expect(await prisma.rateLimitHit.count({ where: { key: hashKey(a) } })).toBe(1);
  });
});
