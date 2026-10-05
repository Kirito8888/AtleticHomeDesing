// Prisma 7 no carga .env automáticamente. Mismo orden de prioridad que Next.js:
// .env.local (desarrollo) > .env. En Docker las variables llegan por env_file.
import { config } from "dotenv";
import { defineConfig } from "prisma/config";

config({ path: [".env.local", ".env"], quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
