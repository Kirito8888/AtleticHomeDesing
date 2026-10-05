import "server-only";
import { z } from "zod";

// Variables de servidor validadas una sola vez. Las opcionales (Gemini, OFF)
// no rompen el arranque: los endpoints que las necesitan devuelven 503.
const schema = z.object({
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(1).optional(),
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
