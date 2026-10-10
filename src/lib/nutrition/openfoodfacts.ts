// =============================================================================
// Cliente OpenFoodFacts (instancia España).
// - Búsqueda por texto: /cgi/search.pl (límite OFF: ~10 req/min por IP).
// - Producto por código de barras: /api/v2/product/{code} (~100 req/min).
// OFF exige un User-Agent identificable: "App/versión (contacto)".
// =============================================================================

export const OFF_FIELDS = [
  "code",
  "product_name",
  "product_name_es",
  "brands",
  "image_front_small_url",
  "serving_quantity",
  "nutriscore_grade",
  "nutriments",
].join(",");

export interface OffNutriments {
  "energy-kcal_100g"?: number;
  energy_100g?: number; // kJ
  proteins_100g?: number;
  carbohydrates_100g?: number;
  sugars_100g?: number;
  fat_100g?: number;
  "saturated-fat_100g"?: number;
  fiber_100g?: number;
  salt_100g?: number;
  iron_100g?: number; // g
  // v1.10 · micronutrientes (OFF los da en gramos por 100 g)
  calcium_100g?: number;
  "vitamin-d_100g"?: number;
  "vitamin-b12_100g"?: number;
  magnesium_100g?: number;
  sodium_100g?: number;
  potassium_100g?: number;
}

export interface OffProduct {
  code?: string;
  product_name?: string;
  product_name_es?: string;
  brands?: string;
  image_front_small_url?: string;
  serving_quantity?: number | string;
  nutriscore_grade?: string;
  nutriments?: OffNutriments;
}

export interface NormalizedFood {
  barcode: string | null;
  name: string;
  brand: string | null;
  imageUrl: string | null;
  servingSizeG: number | null;
  kcalPer100g: number | null;
  proteinPer100g: number | null;
  carbsPer100g: number | null;
  sugarsPer100g: number | null;
  fatPer100g: number | null;
  satFatPer100g: number | null;
  fiberPer100g: number | null;
  saltPer100g: number | null;
  /** mg (OFF lo da en g); a menudo no viene. */
  ironPer100g: number | null;
  /** v1.10 · mg, salvo vitamina D y B12 en µg. Casi siempre vienen vacíos salvo en lácteos y enriquecidos. */
  calciumPer100g: number | null;
  vitDPer100g: number | null;
  b12Per100g: number | null;
  magnesiumPer100g: number | null;
  sodiumPer100g: number | null;
  potassiumPer100g: number | null;
  nutriScore: string | null;
}

function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number.parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/** g → mg (×1000) o µg (×1e6), redondeado; null si no viene. */
function scaled(v: unknown, factor: number): number | null {
  const n = num(typeof v === "number" ? v * factor : typeof v === "string" ? Number.parseFloat(v) * factor : undefined);
  return n;
}

/** Normaliza un producto OFF. Devuelve null si no tiene nombre (inútil para el usuario). */
export function normalizeOffProduct(p: OffProduct): NormalizedFood | null {
  const name = (p.product_name_es || p.product_name || "").trim();
  if (!name) return null;
  const n = p.nutriments ?? {};
  // Algunos productos solo traen kJ: 1 kcal = 4.184 kJ
  const kcal = num(n["energy-kcal_100g"]) ?? (num(n.energy_100g) != null ? num(n.energy_100g! / 4.184) : null);
  const grade = p.nutriscore_grade?.trim().toUpperCase();
  return {
    barcode: p.code?.trim() || null,
    name,
    brand: p.brands?.split(",")[0]?.trim() || null,
    imageUrl: p.image_front_small_url ?? null,
    servingSizeG: num(p.serving_quantity),
    kcalPer100g: kcal,
    proteinPer100g: num(n.proteins_100g),
    carbsPer100g: num(n.carbohydrates_100g),
    sugarsPer100g: num(n.sugars_100g),
    fatPer100g: num(n.fat_100g),
    satFatPer100g: num(n["saturated-fat_100g"]),
    fiberPer100g: num(n.fiber_100g),
    saltPer100g: num(n.salt_100g),
    ironPer100g: num(n.iron_100g) != null ? num(n.iron_100g! * 1000) : null,
    calciumPer100g: scaled(n.calcium_100g, 1000),
    vitDPer100g: scaled(n["vitamin-d_100g"], 1e6),
    b12Per100g: scaled(n["vitamin-b12_100g"], 1e6),
    magnesiumPer100g: scaled(n.magnesium_100g, 1000),
    // Si no viene el sodio, se deduce de la sal (sal = sodio × 2,5)
    sodiumPer100g: scaled(n.sodium_100g, 1000) ?? scaled(n.salt_100g != null ? n.salt_100g / 2.5 : undefined, 1000),
    potassiumPer100g: scaled(n.potassium_100g, 1000),
    nutriScore: grade && /^[A-E]$/.test(grade) ? grade : null,
  };
}

export class OffError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export interface OffClientOptions {
  baseUrl: string;
  userAgent: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export function createOffClient(opts: OffClientOptions) {
  const doFetch = opts.fetchImpl ?? fetch;
  const base = opts.baseUrl.replace(/\/$/, "");

  async function get<T>(url: string): Promise<T> {
    let res: Response;
    try {
      res = await doFetch(url, {
        headers: { "User-Agent": opts.userAgent, Accept: "application/json" },
        signal: AbortSignal.timeout(opts.timeoutMs ?? 8000),
      });
    } catch {
      throw new OffError("OpenFoodFacts no responde", 502);
    }
    if (res.status === 404) throw new OffError("Producto no encontrado en OpenFoodFacts", 404);
    if (res.status === 429) throw new OffError("Límite de peticiones de OpenFoodFacts alcanzado", 429);
    if (!res.ok) throw new OffError(`OpenFoodFacts respondió ${res.status}`, 502);
    return (await res.json()) as T;
  }

  return {
    async search(query: string, page = 1, pageSize = 20): Promise<{ count: number; products: NormalizedFood[] }> {
      const params = new URLSearchParams({
        search_terms: query,
        search_simple: "1",
        action: "process",
        json: "1",
        page: String(page),
        page_size: String(pageSize),
        fields: OFF_FIELDS,
      });
      const data = await get<{ count?: number; products?: OffProduct[] }>(`${base}/cgi/search.pl?${params}`);
      const products = (data.products ?? []).map(normalizeOffProduct).filter((p): p is NormalizedFood => p != null);
      return { count: data.count ?? products.length, products };
    },

    /**
     * v1.10 · Página de productos de una marca vendidos en España (API v2), para el catálogo local.
     * Límite de OFF: 10 búsquedas por minuto por IP; quien llama espacia las peticiones.
     */
    async brandPage(brand: string, page: number, pageSize = 100): Promise<{ count: number; products: NormalizedFood[] }> {
      const params = new URLSearchParams({ brands_tags: brand, countries_tags_en: "spain", page: String(page), page_size: String(pageSize), fields: OFF_FIELDS, sort_by: "code" });
      const data = await get<{ count?: number; products?: OffProduct[] }>(`${base}/api/v2/search?${params}`);
      const products = (data.products ?? []).map(normalizeOffProduct).filter((p): p is NormalizedFood => p != null);
      return { count: data.count ?? products.length, products };
    },

    async product(barcode: string): Promise<{ food: NormalizedFood; raw: OffProduct }> {
      if (!/^\d{6,14}$/.test(barcode)) throw new OffError("Código de barras inválido", 400);
      const data = await get<{ status?: number; product?: OffProduct }>(
        `${base}/api/v2/product/${barcode}?fields=${OFF_FIELDS}`,
      );
      const food = data.product ? normalizeOffProduct({ code: barcode, ...data.product }) : null;
      if (data.status === 0 || !food) throw new OffError("Producto no encontrado en OpenFoodFacts", 404);
      return { food, raw: data.product! };
    },
  };
}

/** Macros de una ración a partir de valores por 100 g. */
export function macrosForQuantity(food: Pick<NormalizedFood, "kcalPer100g" | "proteinPer100g" | "carbsPer100g" | "fatPer100g" | "fiberPer100g">, quantityG: number) {
  const f = quantityG / 100;
  const r = (v: number | null) => Math.round((v ?? 0) * f * 10) / 10;
  return {
    kcal: r(food.kcalPer100g),
    proteinG: r(food.proteinPer100g),
    carbsG: r(food.carbsPer100g),
    fatG: r(food.fatPer100g),
    fiberG: food.fiberPer100g == null ? null : r(food.fiberPer100g),
  };
}
