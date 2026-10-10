import "server-only";

import { env } from "@/lib/env";
import { createOffClient, OffError, type NormalizedFood } from "@/lib/nutrition/openfoodfacts";
import { prisma } from "@/lib/prisma";

/**
 * v1.10 · Catálogo local de alimentos de marcas españolas desde OpenFoodFacts (licencia ODbL: uso
 * con atribución). Nada de *scraping* de webs de supermercados: solo los productos que la comunidad
 * de OFF ya ha subido. Sincronización semanal y reanudable, a menos de 10 búsquedas por minuto
 * (límite de OFF por IP), para que buscar un alimento no dependa de la red.
 */
export const DEFAULT_BRANDS = ["hacendado", "carrefour", "dia", "eroski", "alcampo", "consum", "milbona", "chef-select", "aldi"];
const PAGE_SIZE = 100;
const REFRESH_DAYS = 7;

export function syncBrands(): string[] {
  const raw = env().OFF_SYNC_BRANDS;
  const list = raw ? raw.split(",").map((b) => b.trim().toLowerCase().replace(/\s+/g, "-")).filter(Boolean) : DEFAULT_BRANDS;
  return [...new Set(list)].slice(0, 30);
}

type Client = Pick<ReturnType<typeof createOffClient>, "brandPage">;
const defaultClient = (): Client => createOffClient({ baseUrl: env().OFF_BASE_URL, userAgent: env().OFF_USER_AGENT, timeoutMs: 20_000 });

async function saveProducts(foods: NormalizedFood[], now: Date) {
  let n = 0;
  for (const f of foods) {
    if (!f.barcode) continue;
    const data = { ...f, source: "openfoodfacts", syncedAt: now, fetchedAt: now };
    await prisma.foodProduct.upsert({ where: { barcode: f.barcode }, create: data, update: data });
    n++;
  }
  return n;
}

/**
 * Una pasada: sigue por donde se quedó, hasta `maxPages` páginas, esperando `delayMs` entre
 * peticiones. Si OFF limita (429/503) o falla, guarda el error y lo intenta en la siguiente pasada.
 */
export async function runCatalogSyncJob(opts: { client?: Client; maxPages?: number; delayMs?: number; now?: Date; sleep?: (ms: number) => Promise<void> } = {}) {
  if (!env().OFF_SYNC_ENABLED) return { pages: 0, products: 0 };
  const client = opts.client ?? defaultClient();
  const maxPages = opts.maxPages ?? 50;
  const delayMs = opts.delayMs ?? 6500;
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const now = opts.now ?? new Date();
  let pages = 0;
  let products = 0;
  for (const brand of syncBrands()) {
    let state = await prisma.catalogSyncState.upsert({ where: { brand }, create: { brand }, update: {} });
    if (state.finishedAt && now.getTime() - state.finishedAt.getTime() < REFRESH_DAYS * 864e5) continue;
    if (!state.startedAt || state.finishedAt) {
      state = await prisma.catalogSyncState.update({ where: { brand }, data: { page: 0, products: 0, startedAt: now, finishedAt: null, error: null } });
    }
    while (pages < maxPages) {
      if (pages > 0) await sleep(delayMs);
      const page = state.page + 1;
      let r: Awaited<ReturnType<Client["brandPage"]>>;
      try {
        r = await client.brandPage(brand, page, PAGE_SIZE);
      } catch (e) {
        const msg = e instanceof OffError ? e.message : "OpenFoodFacts no responde";
        await prisma.catalogSyncState.update({ where: { brand }, data: { error: msg.slice(0, 200) } });
        return { pages, products, stopped: msg };
      }
      pages++;
      const saved = await saveProducts(r.products, now);
      products += saved;
      const done = r.products.length === 0 || page * PAGE_SIZE >= r.count;
      state = await prisma.catalogSyncState.update({
        where: { brand },
        data: { page, total: r.count, products: { increment: saved }, error: null, finishedAt: done ? new Date() : null },
      });
      if (done) break;
    }
    if (pages >= maxPages) break;
  }
  return { pages, products };
}

export async function catalogStatus() {
  const [states, total] = await Promise.all([
    prisma.catalogSyncState.findMany({ orderBy: { brand: "asc" } }),
    prisma.foodProduct.count({ where: { ownerId: null, syncedAt: { not: null } } }),
  ]);
  return { enabled: env().OFF_SYNC_ENABLED, brands: syncBrands(), states, total };
}
