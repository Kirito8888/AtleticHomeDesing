import { describe, expect, it, vi } from "vitest";

import { createOffClient, macrosForQuantity, normalizeOffProduct, OffError } from "./openfoodfacts";

const hacendadoYogur = {
  code: "8480000160157",
  product_name: "Yogur natural",
  product_name_es: "Yogur natural Hacendado",
  brands: "Hacendado, Mercadona",
  nutriscore_grade: "a",
  serving_quantity: "125",
  nutriments: {
    "energy-kcal_100g": 61,
    proteins_100g: 3.6,
    carbohydrates_100g: 4.6,
    sugars_100g: 4.6,
    fat_100g: 3.1,
    "saturated-fat_100g": 2,
    salt_100g: 0.13,
  },
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("normalizeOffProduct", () => {
  it("prefiere el nombre en español, primera marca y Nutri-Score en mayúscula", () => {
    const f = normalizeOffProduct(hacendadoYogur)!;
    expect(f).toMatchObject({
      barcode: "8480000160157",
      name: "Yogur natural Hacendado",
      brand: "Hacendado",
      nutriScore: "A",
      servingSizeG: 125,
      kcalPer100g: 61,
      fiberPer100g: null,
    });
  });
  it("convierte kJ a kcal si falta energy-kcal", () => {
    expect(normalizeOffProduct({ product_name: "x", nutriments: { energy_100g: 418.4 } })!.kcalPer100g).toBe(100);
  });
  it("descarta productos sin nombre", () => {
    expect(normalizeOffProduct({ code: "1" })).toBeNull();
  });
});

describe("cliente OFF", () => {
  it("search envía User-Agent y filtra productos sin nombre", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ count: 2, products: [hacendadoYogur, { code: "2" }] }),
    );
    const off = createOffClient({ baseUrl: "https://es.openfoodfacts.org/", userAgent: "Atlenza/test", fetchImpl });
    const r = await off.search("hacendado yogur");
    expect(r.products).toHaveLength(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toMatch(/^https:\/\/es\.openfoodfacts\.org\/cgi\/search\.pl\?/);
    expect(String(url)).toContain("search_terms=hacendado+yogur");
    expect(init.headers["User-Agent"]).toBe("Atlenza/test");
  });

  it("product devuelve 404 tipado cuando OFF responde status 0", async () => {
    const off = createOffClient({
      baseUrl: "https://es.openfoodfacts.org",
      userAgent: "t",
      fetchImpl: vi.fn().mockResolvedValue(jsonResponse({ status: 0 })),
    });
    await expect(off.product("1234567890123")).rejects.toMatchObject({ status: 404 });
  });

  it("rechaza códigos de barras no numéricos sin llamar a la red", async () => {
    const fetchImpl = vi.fn();
    const off = createOffClient({ baseUrl: "https://x", userAgent: "t", fetchImpl });
    await expect(off.product("abc")).rejects.toBeInstanceOf(OffError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("traduce 429 a error de límite", async () => {
    const off = createOffClient({
      baseUrl: "https://x",
      userAgent: "t",
      fetchImpl: vi.fn().mockResolvedValue(new Response("", { status: 429 })),
    });
    await expect(off.search("a")).rejects.toMatchObject({ status: 429 });
  });
});

describe("macrosForQuantity", () => {
  it("escala por 100 g", () => {
    const f = normalizeOffProduct(hacendadoYogur)!;
    expect(macrosForQuantity(f, 125)).toEqual({ kcal: 76.3, proteinG: 4.5, carbsG: 5.8, fatG: 3.9, fiberG: null });
  });
});

describe("v1.10 · micronutrientes y búsqueda por marca", () => {
  it("convierte los micronutrientes de g a mg y µg, y deduce el sodio de la sal", () => {
    const f = normalizeOffProduct({ ...hacendadoYogur, nutriments: { ...hacendadoYogur.nutriments, calcium_100g: 0.12, "vitamin-d_100g": 0.0000015, "vitamin-b12_100g": 0.0000004, magnesium_100g: 0.011, potassium_100g: 0.15 } })!;
    expect(f).toMatchObject({ calciumPer100g: 120, vitDPer100g: 1.5, b12Per100g: 0.4, magnesiumPer100g: 11, potassiumPer100g: 150, sodiumPer100g: 52 });
    expect(normalizeOffProduct({ product_name: "x", nutriments: {} })).toMatchObject({ calciumPer100g: null, sodiumPer100g: null });
  });

  it("brandPage pide a la API v2 los productos de la marca vendidos en España", async () => {
    const calls: string[] = [];
    const client = createOffClient({
      baseUrl: "https://es.openfoodfacts.org",
      userAgent: "Atlenza-test",
      fetchImpl: (async (url: string) => {
        calls.push(String(url));
        return jsonResponse({ count: 250, products: [hacendadoYogur, { code: "1" }] });
      }) as typeof fetch,
    });
    const r = await client.brandPage("hacendado", 2);
    expect(r.count).toBe(250);
    expect(r.products).toHaveLength(1); // el que no tiene nombre se descarta
    const u = new URL(calls[0]);
    expect(u.pathname).toBe("/api/v2/search");
    expect(Object.fromEntries(u.searchParams)).toMatchObject({ brands_tags: "hacendado", countries_tags_en: "spain", page: "2", page_size: "100" });
  });
});
