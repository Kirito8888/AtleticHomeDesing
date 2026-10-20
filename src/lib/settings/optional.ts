import { log } from "@/lib/log";

/**
 * Bloques opcionales de /settings: si su carga falla (cifrado, red, tabla vacía…), la pantalla
 * se renderiza igual con el valor de reserva. Solo se registra el nombre del error, nunca su
 * mensaje (puede llevar datos) ni tokens.
 */
export async function optional<T>(label: string, load: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await load();
  } catch (e) {
    log.error("bloque de ajustes no disponible", { kind: label, code: e instanceof Error ? e.name : "error" });
    return fallback;
  }
}
