// Integración con BD real (v2.1 bloque 3): protocolos de fisio compartidos y curvas de referencia, con permisos.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: async () => null }));

const HAS_DB = Boolean(process.env.DATABASE_URL);
type U = { id: string; role: "ATHLETE" | "COACH" | "ADMIN" };

const phases = [
  { name: "1 · Calmar", maxPain: 2, exercises: [{ name: "Isométricos", dose: "5×30 s" }], criteria: [{ text: "Sin dolor en reposo" }, { text: "Movilidad completa" }] },
  { name: "2 · Fuerza", maxPain: 3, exercises: [], criteria: [{ text: "Fuerza simétrica" }] },
];
const curveInput = {
  testKey: "cmj",
  unit: "cm",
  higherIsBetter: true,
  title: "CMJ de prueba",
  study: "Estudio de prueba",
  authors: "Autora A",
  year: 2020,
  citation: "Autora A (2020). Estudio de prueba. Revista de prueba.",
  points: [{ x: 14, p50: 40, low: 36, high: 44 }, { x: 16, p50: 48, low: 42, high: 54 }],
};

describe.skipIf(!HAS_DB)("fisio compartida y curvas v2.1 (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let physio: typeof import("./physio-service");
  let curves: typeof import("@/lib/training/reference-curves-service");
  const t = Date.now();
  const u: Record<string, U> = {};
  let protoId: string;
  let shareId: string;

  beforeAll(async () => {
    vi.resetModules();
    prisma = (await import("@/lib/prisma")).prisma;
    physio = await import("./physio-service");
    curves = await import("@/lib/training/reference-curves-service");
    for (const [k, role] of [["coa", "COACH"], ["coa2", "COACH"], ["adm", "ADMIN"], ["at1", "ATHLETE"], ["at2", "ATHLETE"], ["at3", "ATHLETE"]] as const) {
      u[k] = { id: (await prisma.user.create({ data: { email: `${k}-${t}@test.dev`, role, passwordHash: "x", athleteProfile: { create: k === "at1" ? { birthDate: new Date("2010-01-01") } : {} } } })).id, role };
    }
    // at1: vínculo con todos los ámbitos; at2: vínculo sin RECOVERY; at3: sin vínculo
    await prisma.coachAthlete.create({ data: { coachId: u.coa.id, athleteId: u.at1.id, status: "ACTIVE", scopes: ["LOAD", "RECOVERY"] } });
    await prisma.coachAthlete.create({ data: { coachId: u.coa.id, athleteId: u.at2.id, status: "ACTIVE", scopes: ["SESSIONS"] } });
    await prisma.testResult.create({ data: { userId: u.at1.id, testKey: "cmj", name: "CMJ", unit: "cm", higherIsBetter: true, value: 46, date: new Date("2025-01-01") } });
  });
  afterAll(async () => {
    const { purgeUser } = await import("@/lib/account/service");
    await prisma.referenceCurve.deleteMany({ where: { createdById: { in: Object.values(u).map((x) => x.id) } } });
    for (const x of Object.values(u)) await purgeUser(x.id);
  });

  it("curvas: la atleta no las crea; ADMIN → global, COACH → privada; atribución obligatoria", async () => {
    await expect(curves.createCurve(u.at1, curveInput)).rejects.toMatchObject({ status: 403 });
    const g = await curves.createCurve(u.adm, curveInput);
    const p = await curves.createCurve(u.coa, { ...curveInput, title: "Privada" });
    expect((await prisma.referenceCurve.findUnique({ where: { id: g.id } }))?.global).toBe(true);
    expect((await prisma.referenceCurve.findUnique({ where: { id: p.id } }))?.global).toBe(false);
    expect((await curves.listCurves(u.at1)).some((c) => c.id === g.id)).toBe(true);
    expect((await curves.listCurves(u.at1)).some((c) => c.id === p.id)).toBe(false); // la privada de la entrenadora no se ve
    expect((await curves.listCurves(u.coa)).some((c) => c.id === p.id)).toBe(true);
    await expect(curves.deleteCurve(u.coa2, p.id)).rejects.toMatchObject({ status: 404 });
    const { curveInputSchema } = await import("@/lib/training/reference-curves");
    expect(curveInputSchema.safeParse({ ...curveInput, citation: "" }).success).toBe(false);
  });

  it("comparativa: valores conocidos, y permisos de la entrenadora (LOAD y restricción)", async () => {
    const g = (await curves.listCurves(u.at1)).find((c) => c.title === "CMJ de prueba")!;
    const mine = await curves.compareCurve(u.at1, g.id);
    expect(mine.rows).toHaveLength(1);
    expect(mine.rows[0].ref).toBeCloseTo(44, 1);
    expect(mine.rows[0].deltaPct).toBeCloseTo(4.55, 1);
    expect(mine.curve.citation).toContain("Autora A");
    expect((await curves.compareCurve(u.coa, g.id, u.at1.id)).rows).toHaveLength(1);
    await expect(curves.compareCurve(u.coa, g.id, u.at2.id)).rejects.toMatchObject({ status: 403 }); // sin LOAD
    await expect(curves.compareCurve(u.coa, g.id, u.at3.id)).rejects.toMatchObject({ status: 403 }); // sin vínculo
    await prisma.user.update({ where: { id: u.at1.id }, data: { processingRestrictedAt: new Date() } });
    await expect(curves.compareCurve(u.coa, g.id, u.at1.id)).rejects.toMatchObject({ status: 403 });
    expect((await curves.compareCurve(u.at1, g.id)).rows).toHaveLength(1); // ella sí ve lo suyo
    await prisma.user.update({ where: { id: u.at1.id }, data: { processingRestrictedAt: null } });
  });

  it("protocolo: solo entrenadora; ajena → 404; ADMIN y atleta → 403", async () => {
    await expect(physio.createProtocol(u.at1, { title: "x", phases })).rejects.toMatchObject({ status: 403 });
    await expect(physio.createProtocol(u.adm, { title: "x", phases })).rejects.toMatchObject({ status: 403 });
    await expect(physio.createProtocol(u.coa, { title: "x", phases: [] })).rejects.toThrow();
    protoId = (await physio.createProtocol(u.coa, { title: "Tobillo", area: "ANKLE", phases })).id;
    await expect(physio.getOwn(u.coa2, protoId)).rejects.toMatchObject({ status: 404 });
    await expect(physio.updateProtocol(u.coa2, protoId, { title: "y" })).rejects.toMatchObject({ status: 404 });
  });

  it("compartir: exige vínculo y ámbito RECOVERY; la restricción bloquea", async () => {
    await expect(physio.shareProtocol(u.coa, protoId, u.at2.id)).rejects.toMatchObject({ status: 403 }); // sin RECOVERY
    await expect(physio.shareProtocol(u.coa, protoId, u.at3.id)).rejects.toMatchObject({ status: 403 }); // sin vínculo
    await expect(physio.shareProtocol(u.adm, protoId, u.at1.id)).rejects.toMatchObject({ status: 403 }); // ADMIN no se salta nada
    await expect(physio.shareProtocol(u.coa2, protoId, u.at1.id)).rejects.toMatchObject({ status: 404 }); // no es suyo
    expect((await physio.shareableAthletes(u.coa)).map((a) => a.id)).toEqual([u.at1.id]);
    await prisma.user.update({ where: { id: u.at1.id }, data: { processingRestrictedAt: new Date() } });
    await expect(physio.shareProtocol(u.coa, protoId, u.at1.id)).rejects.toMatchObject({ status: 403 });
    expect(await physio.shareableAthletes(u.coa)).toEqual([]);
    await prisma.user.update({ where: { id: u.at1.id }, data: { processingRestrictedAt: null } });
    shareId = (await physio.shareProtocol(u.coa, protoId, u.at1.id)).id;
    expect((await physio.shareProtocol(u.coa, protoId, u.at1.id)).id).toBe(shareId); // idempotente
    // v2.2 · un solo aviso a la atleta por compartido, sin título ni zona del protocolo
    const notes = await prisma.notificationLog.findMany({ where: { userId: u.at1.id, key: `physio-share:${shareId}` } });
    expect(notes).toHaveLength(1);
    expect(`${notes[0].title} ${notes[0].body}`).not.toContain((await physio.getOwn(u.coa, protoId)).title);
  });

  it("la atleta ve fases y marca criterios; no edita; la ajena no lo ve", async () => {
    expect((await physio.listShared(u.at1)).map((s) => s.shareId)).toEqual([shareId]);
    const v = await physio.getShared(u.at1, shareId);
    expect(v.phases).toHaveLength(2);
    expect(v).toMatchObject({ done: 0, total: 3, phase: 0 });
    const after = await physio.updateShared(u.at1, shareId, { progress: [[true, true], [false]], painToday: 1 });
    expect(after).toMatchObject({ done: 2, pct: 67, phase: 1, painToday: 1 });
    await expect(physio.getShared(u.at2, shareId)).rejects.toMatchObject({ status: 404 });
    await expect(physio.updateShared(u.at2, shareId, { painToday: 9 })).rejects.toMatchObject({ status: 404 });
    await expect(physio.updateProtocol(u.at1, protoId, { title: "hack" })).rejects.toMatchObject({ status: 403 });
    await expect(physio.getOwn(u.at1, protoId)).rejects.toMatchObject({ status: 403 });
  });

  it("la entrenadora ve el seguimiento; con restricción queda bloqueado y sin datos", async () => {
    const own = await physio.getOwn(u.coa, protoId);
    expect(own.shares[0]).toMatchObject({ blocked: false, done: 2 });
    await prisma.user.update({ where: { id: u.at1.id }, data: { processingRestrictedAt: new Date() } });
    const locked = await physio.getOwn(u.coa, protoId);
    expect(locked.shares[0]).toMatchObject({ blocked: true });
    expect(JSON.stringify(locked.shares[0])).not.toContain("progress");
    expect((await physio.getShared(u.at1, shareId)).done).toBe(2); // la atleta sigue viendo lo suyo
    await prisma.user.update({ where: { id: u.at1.id }, data: { processingRestrictedAt: null } });
  });

  it("editar fases reajusta el seguimiento; quitar el acceso lo borra", async () => {
    await physio.updateProtocol(u.coa, protoId, { phases: [...phases, { name: "3 · Vuelta", maxPain: 1, exercises: [], criteria: [{ text: "Semana normal" }] }] });
    expect((await physio.getShared(u.at1, shareId))).toMatchObject({ total: 4, done: 2 });
    await physio.unshareProtocol(u.coa, protoId, u.at1.id);
    expect(await physio.listShared(u.at1)).toEqual([]);
    await expect(physio.getShared(u.at1, shareId)).rejects.toMatchObject({ status: 404 });
  });
});
