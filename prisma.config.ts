// Prisma 7 no carga .env automáticamente. Mismo orden de prioridad que Next.js:
// .env.local (desarrollo) > .env. En Docker las variables llegan por env_file.
import { config } from "dotenv";
import { defineConfig } from "prisma/config";

config({ path: [".env.local", ".env"], quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
  // DocumentChunk lleva un índice HNSW (pgvector) que Prisma no sabe expresar.
  // Marcarla como externa evita que cada `migrate dev` genere un DROP INDEX.
  // La tabla sigue en schema.prisma y en el cliente; sus cambios de estructura
  // se escriben a mano en SQL dentro de una migración.
  experimental: { externalTables: true },
  tables: { external: ["public.DocumentChunk"] },
});
