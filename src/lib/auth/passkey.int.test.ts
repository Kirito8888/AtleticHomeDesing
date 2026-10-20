// Seguridad (bloque 7): llaves de acceso. Un autenticador de software (ES256) firma de verdad; se comprueba que
// la firma solo vale una vez, para este dominio y con el contador creciendo, y que los retos no se reutilizan.
import { createHash, generateKeyPairSync, sign } from "node:crypto";

import { isoCBOR } from "@simplewebauthn/server/helpers";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: async () => null }));

const HAS_DB = Boolean(process.env.DATABASE_URL);
const ORIGIN = "https://atlenza.test";
const b64u = (b: Buffer | Uint8Array) => Buffer.from(b).toString("base64url");

describe.skipIf(!HAS_DB)("passkeys (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let pk: typeof import("./passkey");
  let userA: string;
  let userB: string;
  const t = Date.now();
  const credId = b64u(Buffer.from(`cred-${t}`));
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });

  /** Respuesta de autenticación firmada por la llave de software. */
  function assertion(challenge: string, opts: { origin?: string; counter: number; id?: string; rpID?: string }) {
    const clientDataJSON = Buffer.from(JSON.stringify({ type: "webauthn.get", challenge, origin: opts.origin ?? ORIGIN, crossOrigin: false }));
    const counter = Buffer.alloc(4);
    counter.writeUInt32BE(opts.counter);
    const authData = Buffer.concat([createHash("sha256").update(opts.rpID ?? "atlenza.test").digest(), Buffer.from([0x05]), counter]); // UP + UV
    const signature = sign("sha256", Buffer.concat([authData, createHash("sha256").update(clientDataJSON).digest()]), privateKey);
    const id = opts.id ?? credId;
    return { id, rawId: id, type: "public-key" as const, clientExtensionResults: {}, response: { clientDataJSON: b64u(clientDataJSON), authenticatorData: b64u(authData), signature: b64u(signature) } };
  }

  beforeAll(async () => {
    process.env.AUTH_URL = ORIGIN;
    vi.resetModules();
    prisma = (await import("@/lib/prisma")).prisma;
    pk = await import("./passkey");
    userA = (await prisma.user.create({ data: { email: `pk-a-${t}@test.dev`, name: "A" } })).id;
    userB = (await prisma.user.create({ data: { email: `pk-b-${t}@test.dev`, name: "B" } })).id;
    const jwk = publicKey.export({ format: "jwk" });
    const cose = isoCBOR.encode(new Map<number, number | Uint8Array>([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x!, "base64url")], [-3, Buffer.from(jwk.y!, "base64url")]]));
    await prisma.passkey.create({ data: { userId: userA, credentialId: credId, publicKey: Buffer.from(cose), counter: 5, transports: ["internal"], name: "Móvil" } });
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [userA, userB].filter(Boolean) } } });
    await prisma.webAuthnChallenge.deleteMany({ where: { userId: { in: [userA, userB].filter(Boolean) } } });
  });

  it("el dominio y el origen salen de AUTH_URL, no de la petición", () => {
    expect(pk.relyingParty("https://otro.example")).toMatchObject({ rpID: "atlenza.test", origin: ORIGIN });
  });

  it("sin AUTH_URL ni origen: 503; sin AUTH_URL, el origen de la petición (desarrollo)", async () => {
    vi.resetModules();
    const keep = process.env.AUTH_URL;
    delete process.env.AUTH_URL;
    try {
      const fresh = await import("./passkey");
      expect(() => fresh.relyingParty()).toThrowError(expect.objectContaining({ status: 503 }));
      expect(fresh.relyingParty("http://localhost:3000").rpID).toBe("localhost");
    } finally {
      process.env.AUTH_URL = keep;
      vi.resetModules();
    }
  });

  it("inicio de sesión: firma válida → la dueña y el contador sube; el mismo reto no se reutiliza", async () => {
    const { challengeId, options } = await pk.loginOptions();
    expect(await pk.verifyLogin(challengeId, assertion(options.challenge, { counter: 6 }))).toBe(userA);
    const row = await prisma.passkey.findUniqueOrThrow({ where: { credentialId: credId } });
    expect(row.counter).toBe(6);
    expect(row.lastUsedAt).not.toBeNull();
    // mismo reto otra vez (reproducción de la respuesta capturada)
    expect(await pk.verifyLogin(challengeId, assertion(options.challenge, { counter: 7 }))).toBeNull();
  });

  it("rechaza: otro origen, otro dominio, contador que no sube, credencial desconocida y firma de otro reto", async () => {
    const attempt = async (make: (c: string) => ReturnType<typeof assertion>) => {
      const { challengeId, options } = await pk.loginOptions();
      return pk.verifyLogin(challengeId, make(options.challenge));
    };
    expect(await attempt((c) => assertion(c, { counter: 7, origin: "https://phishing.example" }))).toBeNull();
    expect(await attempt((c) => assertion(c, { counter: 7, rpID: "phishing.example" }))).toBeNull();
    expect(await attempt((c) => assertion(c, { counter: 6 }))).toBeNull(); // clon: el contador no avanza
    expect(await attempt((c) => assertion(c, { counter: 7, id: b64u(Buffer.from("desconocida")) }))).toBeNull();
    const other = await pk.loginOptions();
    expect(await pk.verifyLogin(other.challengeId, assertion("otro-reto", { counter: 7 }))).toBeNull();
    expect((await prisma.passkey.findUniqueOrThrow({ where: { credentialId: credId } })).counter).toBe(6);
  });

  it("los retos caducan, solo se usan una vez y no valen de otro tipo ni de otra persona", async () => {
    const reg = await pk.registrationOptions(userA);
    const bogus = { id: "x", rawId: "x", type: "public-key" as const, clientExtensionResults: {}, response: { clientDataJSON: "", attestationObject: "" } };
    // de otra persona → 400, y el reto queda gastado
    await expect(pk.verifyRegistration(userB, { challengeId: reg.challengeId, name: "x", response: bogus }, {})).rejects.toMatchObject({ status: 400 });
    expect(await prisma.webAuthnChallenge.findUnique({ where: { id: reg.challengeId } })).toBeNull();
    // un reto de inicio de sesión no sirve para registrar
    const login = await pk.loginOptions();
    await expect(pk.verifyRegistration(userA, { challengeId: login.challengeId, name: "x", response: bogus }, {})).rejects.toMatchObject({ status: 400 });
    // un reto de registro no sirve para entrar
    const reg2 = await pk.registrationOptions(userA);
    expect(await pk.verifyLogin(reg2.challengeId, assertion(reg2.options.challenge, { counter: 7 }))).toBeNull();
    // caducado
    const old = await pk.registrationOptions(userA);
    await prisma.webAuthnChallenge.update({ where: { id: old.challengeId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(pk.verifyRegistration(userA, { challengeId: old.challengeId, name: "x", response: bogus }, {})).rejects.toMatchObject({ status: 400 });
    // reto inexistente
    await expect(pk.verifyRegistration(userA, { challengeId: "no-existe", name: "x", response: bogus }, {})).rejects.toMatchObject({ status: 400 });
  });

  it("las opciones de registro excluyen las llaves ya dadas de alta", async () => {
    const { options } = await pk.registrationOptions(userA);
    expect(options.excludeCredentials?.map((c) => c.id)).toEqual([credId]);
    expect(options.authenticatorSelection).toMatchObject({ residentKey: "required", userVerification: "required" });
  });

  it("listar y borrar: solo las propias; borrar deja rastro en la auditoría", async () => {
    expect((await pk.listPasskeys(userB))).toEqual([]);
    const id = (await pk.listPasskeys(userA))[0].id;
    await expect(pk.deletePasskey(userB, id, {})).rejects.toMatchObject({ status: 404 });
    expect(await prisma.passkey.count({ where: { id } })).toBe(1);
    await pk.deletePasskey(userA, id, { ip: "203.0.113.9" });
    expect(await prisma.passkey.count({ where: { id } })).toBe(0);
    expect(await prisma.securityEvent.count({ where: { userId: userA, type: "PASSKEY_REMOVED" } })).toBe(1);
  });
});
