// Seguridad (bloque 7): TOTP con los vectores del RFC 6238 (SHA-1, secreto "12345678901234567890"), ventana de ±30 s y anti-reutilización.
import { randomBytes } from "node:crypto";

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: async () => null }));

const HAS_DB = Boolean(process.env.DATABASE_URL);
const KEY = randomBytes(32).toString("base64");
const SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"; // base32 de «12345678901234567890»
// Tabla del RFC 6238 (apéndice B, SHA-1): los 8 dígitos reducidos a 6.
const VECTORS: Array<[number, string]> = [
  [59, "287082"],
  [1111111109, "081804"],
  [1111111111, "050471"],
  [1234567890, "005924"],
  [2000000000, "279037"],
  [20000000000, "353130"],
];

describe.skipIf(!HAS_DB)("TOTP (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let totp: typeof import("./totp");
  let seal: typeof import("./secret-box").seal;
  const t = Date.now();
  const ids: string[] = [];

  const at = (epochSec: number) => vi.useFakeTimers({ toFake: ["Date"], now: epochSec * 1000 });
  async function newUser(label: string, lastStep: number | null = null) {
    const u = await prisma.user.create({ data: { email: `totp-${label}-${t}@test.dev`, totpSecret: seal(SECRET, KEY), totpEnabledAt: new Date(), totpLastStep: lastStep } });
    ids.push(u.id);
    return u;
  }
  const fresh = (id: string) => prisma.user.findUniqueOrThrow({ where: { id }, select: { id: true, totpSecret: true, totpLastStep: true } });

  beforeAll(async () => {
    process.env.TOTP_ENCRYPTION_KEY = KEY;
    vi.resetModules();
    prisma = (await import("@/lib/prisma")).prisma;
    totp = await import("./totp");
    seal = (await import("./secret-box")).seal;
  });
  afterEach(() => vi.useRealTimers());
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  });

  it("acepta los vectores del RFC 6238", async () => {
    const u = await newUser("rfc");
    for (const [time, code] of VECTORS) {
      at(time);
      expect(await totp.verifySecondFactor(await fresh(u.id), code), `T=${time}`).toBe("totp");
    }
  });

  it("ventana: vale el código del paso anterior y del siguiente, no el de hace dos pasos", async () => {
    const T = 1111111111; // paso 37037037; el código de T=1111111109 es el del paso anterior
    const prev = await newUser("prev");
    at(T);
    expect(await totp.verifySecondFactor(await fresh(prev.id), "081804")).toBe("totp");
    const next = await newUser("next");
    at(1111111109); // el código de T=1111111111 es el del paso siguiente
    expect(await totp.verifySecondFactor(await fresh(next.id), "050471")).toBe("totp");
    const old = await newUser("old");
    at(1234567890 + 61); // el código de 1234567890 queda a más de un paso
    expect(await totp.verifySecondFactor(await fresh(old.id), "005924")).toBe(false);
  });

  it("un código gastado no vuelve a valer aunque siga en su ventana", async () => {
    const u = await newUser("reuse");
    at(1234567890);
    expect(await totp.verifySecondFactor(await fresh(u.id), "005924")).toBe("totp");
    expect(await totp.verifySecondFactor(await fresh(u.id), "005924")).toBe(false);
    // tampoco uno anterior al ya gastado, aunque aún esté en la ventana
    at(1234567890 + 20);
    expect(await totp.verifySecondFactor(await fresh(u.id), "005924")).toBe(false);
    // con la copia vieja del usuario (lastStep desfasado) la condición en BD también lo impide
    const stale = { id: u.id, totpSecret: u.totpSecret, totpLastStep: null };
    expect(await totp.verifySecondFactor(stale, "005924")).toBe(false);
  });

  it("dos logins simultáneos con el mismo código: solo gana uno", async () => {
    const u = await newUser("race");
    at(1111111111);
    const snapshot = await fresh(u.id);
    const r = await Promise.all([totp.verifySecondFactor(snapshot, "050471"), totp.verifySecondFactor(snapshot, "050471")]);
    expect(r.filter((x) => x === "totp")).toHaveLength(1);
  });

  it("formato inválido, otro código o sin secreto: false", async () => {
    const u = await newUser("bad");
    at(59);
    const row = await fresh(u.id);
    for (const bad of ["", "12345", "1234567", "abcdef", "28708 2x", "000000"]) expect(await totp.verifySecondFactor(row, bad), bad).toBe(false);
    expect(await totp.verifySecondFactor({ id: u.id, totpSecret: null, totpLastStep: null }, "287082")).toBe(false);
  });

  it("código de recuperación: vale una vez y solo para su dueño", async () => {
    const a = await newUser("rec-a");
    const b = await newUser("rec-b");
    const [code] = await totp.regenerateRecoveryCodes(a.id);
    expect(await totp.verifySecondFactor(await fresh(b.id), code)).toBe(false);
    expect(await totp.verifySecondFactor(await fresh(a.id), code.toLowerCase())).toBe("recovery");
    expect(await totp.verifySecondFactor(await fresh(a.id), code)).toBe(false);
  });

  it("activar: el código del RFC confirma el alta y entrega 10 códigos; con el reloj atrasado no revienta", async () => {
    const u = await prisma.user.create({ data: { email: `totp-setup-${t}@test.dev`, totpSecret: seal(SECRET, KEY) } });
    ids.push(u.id);
    at(1111111111);
    await expect(totp.confirmTotpSetup(u.id, "111111")).rejects.toMatchObject({ status: 400 });
    expect(await totp.confirmTotpSetup(u.id, " 050471 ")).toHaveLength(10);
    expect((await totp.totpStatus(u.id)).enabled).toBe(true);
    await expect(totp.confirmTotpSetup(u.id, "050471")).rejects.toMatchObject({ status: 409 });
    // reloj atrasado respecto del último paso gastado: rechazo normal, no un error 500
    at(1111111111 - 3600);
    await expect(totp.verifySecondFactor(await fresh(u.id), "287082")).resolves.toBe(false);
  });
});

describe.skipIf(!HAS_DB)("TOTP sin clave de servidor", () => {
  it("no se puede iniciar el alta: 503", async () => {
    const saved = process.env.TOTP_ENCRYPTION_KEY;
    delete process.env.TOTP_ENCRYPTION_KEY;
    vi.resetModules();
    try {
      const totp = await import("./totp");
      expect(totp.totpConfigured()).toBe(false);
      await expect(totp.startTotpSetup("no-importa", "a@test.dev")).rejects.toMatchObject({ status: 503 });
    } finally {
      process.env.TOTP_ENCRYPTION_KEY = saved;
    }
  });
});
