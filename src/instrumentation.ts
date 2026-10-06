// Se ejecuta una vez al arrancar el servidor. Tareas programadas dentro del
// contenedor web (sin cron externo). Desactivar con SCHEDULER_ENABLED=false.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || !process.env.DATABASE_URL) return;
  const { startScheduler } = await import("@/lib/scheduler");
  startScheduler();
}
