// Integración con BD real (v1.7): diario de bienestar cifrado y fotos de lesión cifradas en disco.
import { randomBytes } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: async () => null }));

const HAS_DB = Boolean(process.env.DATABASE_URL);
// JPEG mínimo: solo importa la firma (FF D8 FF) para el control de tipo
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("foto de prueba sintética")]);

describe.skipIf(!HAS_DB)("bienestar v1.7 (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let svc: typeof import("./wellbeing-service");
  let userId: string;
  let other: string;
  let dir: string;
  const saved = { ...process.env };

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "lifeos-photos-"));
    process.env.DATA_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    process.env.UPLOAD_DIR = dir;
    vi.resetModules();
    prisma = (await import("@/lib/prisma")).prisma;
    svc = await import("./wellbeing-service");
    const t = Date.now();
    userId = (await prisma.user.create({ data: { email: `wb1-${t}@test.dev` } })).id;
    other = (await prisma.user.create({ data: { email: `wb2-${t}@test.dev` } })).id;
  });
  afterAll(async () => {
    process.env = saved;
    await prisma.user.deleteMany({ where: { id: { in: [userId, other] } } });
    await rm(dir, { recursive: true, force: true });
  });

  it("guarda cifrado, devuelve descifrado y solo a su dueño; deja constancia del consentimiento de salud", async () => {
    const e = svc.parseWellbeing({ kind: "MOOD", date: "2026-10-08", mood: 2, stress: 4 });
    const { id } = await svc.addWellbeing(userId, e);
    const raw = await prisma.wellbeingLog.findUniqueOrThrow({ where: { id } });
    expect(raw.data).not.toContain("stress");
    expect(await svc.listWellbeing(userId, "2026-10-09")).toEqual([expect.objectContaining({ id, kind: "MOOD", mood: 2, stress: 4, date: "2026-10-08" })]);
    expect(await svc.listWellbeing(other, "2026-10-09")).toEqual([]);
    await expect(svc.deleteWellbeing(other, id)).rejects.toThrow(/no encontrado/i);
    expect(await prisma.consent.count({ where: { userId, purpose: "HEALTH", granted: true } })).toBe(1);
    await svc.deleteWellbeing(userId, id);
    expect(() => svc.parseWellbeing({ kind: "NADA" })).toThrow();
  });

  it("fotos: comprueba la firma, cifra en disco, solo las abre su dueño y se borran", async () => {
    const injury = await prisma.injury.create({ data: { userId, area: "ELBOW", pain: 3, startedOn: new Date("2026-10-01") } });
    await expect(svc.addInjuryPhoto(userId, injury.id, Buffer.from("<svg/>"), "2026-10-08")).rejects.toThrow(/JPEG/);
    await expect(svc.addInjuryPhoto(other, injury.id, JPEG, "2026-10-08")).rejects.toThrow(/no encontrada/i);
    const { id } = await svc.addInjuryPhoto(userId, injury.id, JPEG, "2026-10-08");
    const files = await readdir(path.join(dir, userId, "photos"));
    expect(files).toEqual([`${id}.jpg.enc`]);
    const onDisk = await readFile(path.join(dir, userId, "photos", files[0]));
    expect(onDisk.includes(Buffer.from("foto de prueba"))).toBe(false);
    const back = await svc.readInjuryPhoto(userId, id);
    expect(back.mime).toBe("image/jpeg");
    expect(back.bytes.equals(JPEG)).toBe(true);
    await expect(svc.readInjuryPhoto(other, id)).rejects.toThrow(/no encontrada/i);
    expect(() => svc.photoFile(userId, "../otro/fichero")).toThrow(/no válida/);
    await svc.deleteInjuryPhoto(userId, id);
    expect(await readdir(path.join(dir, userId, "photos"))).toEqual([]);
  });
});
