// Se ejecuta una vez al arrancar el servidor:
// - tareas programadas (suscripciones, coach semanal, limpieza de auditoría), desactivables con SCHEDULER_ENABLED=false;
// - trabajador de la cola de ingesta de apuntes (pg-boss), siempre que haya BD.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || !process.env.DATABASE_URL) return;
  const { startScheduler } = await import("@/lib/scheduler");
  startScheduler();
  const { startIngestWorker } = await import("@/lib/jobs/queue");
  startIngestWorker().catch((err) => console.error("[jobs] no se pudo arrancar la cola:", err));
}
