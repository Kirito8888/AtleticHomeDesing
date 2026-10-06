import "server-only";
import { z } from "zod";

// Variables de servidor validadas una sola vez. Las opcionales (Gemini, OFF)
// no rompen el arranque: los endpoints que las necesitan devuelven 503.
const schema = z.object({
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(1).optional(),
  // Debe ser la URL pública completa (https://…). Sin esquema, Auth.js falla con "Invalid URL".
  AUTH_URL: z
    .string()
    .regex(/^https?:\/\/[^/\s]+\/?$/, "AUTH_URL debe ser una URL completa, p.ej. https://lifeos.midominio.es")
    .optional(),
  // Registro de cuentas nuevas. Por defecto cerrado; el primer usuario siempre puede registrarse.
  ALLOW_REGISTRATION: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  // Tareas programadas (suscripciones diarias, coach semanal) dentro del contenedor web.
  SCHEDULER_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  // Cuota de almacenamiento de apuntes por usuario.
  UPLOAD_QUOTA_MB: z.coerce.number().int().positive().default(200),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_CHAT_MODEL: z.string().default("gemini-2.5-flash"),
  GEMINI_EMBEDDING_MODEL: z.string().default("gemini-embedding-001"),
  GEMINI_EMBEDDING_DIM: z.coerce.number().int().positive().default(768),
  OFF_BASE_URL: z.string().url().default("https://es.openfoodfacts.org"),
  OFF_USER_AGENT: z.string().default("LifeOS/0.1"),
  UPLOAD_DIR: z.string().default("./uploads"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  cached ??= schema.parse(process.env);
  return cached;
}
