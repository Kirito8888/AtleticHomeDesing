import { route } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/admin";
import { catalogStatus, runCatalogSyncJob } from "@/lib/nutrition/catalog-sync";
import { log } from "@/lib/log";

export const GET = route(async () => {
  await requireAdmin();
  return catalogStatus();
});

/** v1.10 · Lanza en segundo plano una pasada corta (10 páginas, ~1 min) de la sincronización con OpenFoodFacts. */
export const POST = route(async () => {
  await requireAdmin();
  void runCatalogSyncJob({ maxPages: 10 }).catch((e) => log.error("sincronización del catálogo", { job: "catalog-sync", err: e }));
  return { started: true };
});
