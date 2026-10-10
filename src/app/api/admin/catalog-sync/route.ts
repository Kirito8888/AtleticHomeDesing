import { route } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/admin";
import { catalogStatus, runCatalogSyncJob } from "@/lib/nutrition/catalog-sync";

export const GET = route(async () => {
  await requireAdmin();
  return catalogStatus();
});

/** v1.10 · Lanza en segundo plano una pasada corta (10 páginas, ~1 min) de la sincronización con OpenFoodFacts. */
export const POST = route(async () => {
  await requireAdmin();
  void runCatalogSyncJob({ maxPages: 10 }).catch((e) => console.error("[catálogo]", e));
  return { started: true };
});
