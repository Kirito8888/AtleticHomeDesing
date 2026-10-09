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
  // Clave para cifrar los secretos de 2FA en la BD (32 bytes en base64: openssl rand -base64 32).
  // Sin ella no se puede activar la verificación en dos pasos.
  TOTP_ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, "base64").length === 32, "TOTP_ENCRYPTION_KEY debe ser 32 bytes en base64 (openssl rand -base64 32)")
    .optional(),
  // Clave para cifrar datos de salud especialmente sensibles (ciclo menstrual). Opcional:
  // si no está, se usa TOTP_ENCRYPTION_KEY. Mismo formato (openssl rand -base64 32).
  DATA_ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, "base64").length === 32, "DATA_ENCRYPTION_KEY debe ser 32 bytes en base64 (openssl rand -base64 32)")
    .optional(),
  // v1.7 · Rotación: la clave ANTERIOR, solo mientras se vuelve a cifrar todo con la nueva
  // (Estado del servidor → «Volver a cifrar con la clave nueva»). Después, se quita.
  DATA_ENCRYPTION_KEY_PREVIOUS: z
    .string()
    .refine((v) => Buffer.from(v, "base64").length === 32, "DATA_ENCRYPTION_KEY_PREVIOUS debe ser 32 bytes en base64")
    .optional(),
  TOTP_ENCRYPTION_KEY_PREVIOUS: z
    .string()
    .refine((v) => Buffer.from(v, "base64").length === 32, "TOTP_ENCRYPTION_KEY_PREVIOUS debe ser 32 bytes en base64")
    .optional(),
  // v1.7 · Datos del responsable para la política de privacidad y el aviso legal (públicos en
  // /legal/…). Sin ellos, las páginas dicen que es una instalación personal sin terceros.
  LEGAL_NAME: z.string().max(120).optional(),
  LEGAL_EMAIL: z.string().email().optional(),
  LEGAL_NIF: z.string().max(20).optional(),
  LEGAL_ADDRESS: z.string().max(200).optional(),
  // Notificaciones push (Web Push / VAPID). Generar con: npx web-push generate-vapid-keys
  // Sin ellas la app funciona igual, solo sin notificaciones.
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  // Contacto para el servicio de push: mailto:tu@email o https://tu-dominio
  VAPID_SUBJECT: z.string().regex(/^(mailto:|https:\/\/)/, "VAPID_SUBJECT debe empezar por mailto: o https://").optional(),
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
