// Integración (v1.10): catálogo local desde OpenFoodFacts (cliente simulado), búsqueda local primero,
// alimentos propios aislados por usuario y micronutrientes de cada toma.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: async () => null }));

const HAS_DB = Boolean(process.env.DATABASE_URL);

describe.skipIf(!HAS_DB)("catálogo de alimentos v1.10 (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let sync: typeof import("./catalog-sync");
  let svc: typeof import("./service");
  const t = Date.now();
  const brand = `marca-test-${t}`;
  let a: string;
  let b: string;

  beforeAll(async () => {
    process.env.OFF_SYNC_BRANDS = brand;
    vi.resetModules();
    prisma = (await import("@/lib/prisma")).prisma;
    sync = await import("./catalog-sync");
    svc = await import("./service");
    a = (await prisma.user.create({ data: { email: `cat-a-${t}@test.dev` } })).id;
    b = (await prisma.user.create({ data: { email: `cat-b-${t}@test.dev` } })).id;
  });
  afterAll(async () => {
    await prisma.foodProduct.deleteMany({ where: { barcode: { startsWith: `99${String(t).slice(-6)}` } } });
    await prisma.catalogSyncState.deleteMany({ where: { brand } });
    await prisma.user.deleteMany({ where: { email: { contains: `-${t}@test.dev` } } });
    delete process.env.OFF_SYNC_BRANDS;
  });

  const product = (i: number) => ({
    barcode: `99${String(t).slice(-6)}${String(i).padStart(4, "0")}`,
    name: `Garbanzo cocido zztest ${i}`,
    brand: "Hacendado",
    imageUrl: null,
    servingSizeG: null,
    kcalPer100g: 120,
    proteinPer100g: 7,
    carbsPer100g: 16,
    sugarsPer100g: null,
    fatPer100g: 2,
    satFatPer100g: null,
    fiberPer100g: 5,
    saltPer100g: 0.6,
    ironPer100g: 2,
    calciumPer100g: 45,
    vitDPer100g: null,
    b12Per100g: null,
    magnesiumPer100g: 30,
    sodiumPer100g: 240,
    potassiumPer100g: null,
    nutriScore: "A",
  });

  it("sincroniza por páginas, espera entre peticiones, se reanuda y no repite la semana siguiente", async () => {
    const calls: number[] = [];
    const sleeps: number[] = [];
    const client = { brandPage: async (_b: string, page: number) => (calls.push(page), { count: 250, products: page <= 3 ? Array.from({ length: page < 3 ? 100 : 50 }, (_, i) => product(page * 1000 + i)) : [] }) };
    const opts = { client, delayMs: 6500, sleep: async (ms: number) => void sleeps.push(ms) };
    expect(await sync.runCatalogSyncJob({ ...opts, maxPages: 2 })).toMatchObject({ pages: 2, products: 200 });
    expect(sleeps).toEqual([6500]);
    expect(await prisma.catalogSyncState.findUniqueOrThrow({ where: { brand } })).toMatchObject({ page: 2, total: 250, finishedAt: null });
    expect(await sync.runCatalogSyncJob({ ...opts, maxPages: 5 })).toMatchObject({ pages: 1, products: 50 });
    expect(calls).toEqual([1, 2, 3]);
    expect((await prisma.catalogSyncState.findUniqueOrThrow({ where: { brand } })).finishedAt).not.toBeNull();
    expect(await sync.runCatalogSyncJob({ ...opts })).toMatchObject({ pages: 0 });
    // Un error de OFF se guarda y no rompe nada
    await prisma.catalogSyncState.update({ where: { brand }, data: { finishedAt: new Date(Date.now() - 8 * 864e5) } });
    const r = await sync.runCatalogSyncJob({ client: { brandPage: async () => Promise.reject(new Error("caído")) }, sleep: async () => {} });
    expect(r.stopped).toMatch(/no responde/);
  });

  it("la búsqueda va primero al catálogo local y los alimentos propios solo los ve su dueño", async () => {
    const r = await svc.searchFoods("garbanzo zztest", 1, a);
    expect(r.source).toBe("local");
    expect(r.products.length).toBeGreaterThanOrEqual(8);
    const mine = await svc.createOwnFood(a, { name: "Tortilla de mi abuela zztest", kcalPer100g: 180, proteinPer100g: 8, carbsPer100g: 12, fatPer100g: 11, saltPer100g: 1 });
    expect(mine.sodiumPer100g).toBe(400);
    expect((await svc.searchLocalFoods(a, "tortilla abuela zztest")).map((p) => p.id)).toContain(mine.id);
    expect(await svc.searchLocalFoods(b, "tortilla abuela zztest")).toHaveLength(0);
    await expect(svc.createEntry(b, { date: "2026-10-01", mealType: "LUNCH", foodProductId: mine.id, quantityG: 100 })).rejects.toMatchObject({ status: 404 });
    await expect(svc.deleteOwnFood(b, mine.id)).rejects.toMatchObject({ status: 404 });
  });

  it("cada toma guarda sus micronutrientes", async () => {
    const p = await prisma.foodProduct.findFirstOrThrow({ where: { barcode: product(1000).barcode } });
    const e = await svc.createEntry(a, { date: "2026-10-01", mealType: "LUNCH", foodProductId: p.id, quantityG: 200 });
    expect(e).toMatchObject({ ironMg: 4, calciumMg: 90, magnesiumMg: 60, sodiumMg: 480, vitDUg: null });
  });
});
