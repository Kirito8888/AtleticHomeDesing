# syntax=docker/dockerfile:1.7
# LifeOS — imagen multi-stage (Next.js standalone + Prisma 7)

ARG NODE_VERSION=22-bookworm-slim

# ---------- deps: instala dependencias exactas del lockfile ----------
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
# postinstall ejecuta `prisma generate` (no necesita conexión a BD)
RUN npm ci

# ---------- builder: compila Next.js ----------
FROM deps AS builder
WORKDIR /app
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate && npm run build

# ---------- migrate: herramienta one-shot (migraciones + seed idempotente) ----------
# Usada por el servicio `migrate` (perfil "tools") del docker-compose.
FROM deps AS migrate
WORKDIR /app
# Para `npm run user` (prisma/scripts/user-admin.ts): mismo hash que la app.
COPY src/lib/auth/scrypt.ts src/lib/auth/constants.ts ./src/lib/auth/
CMD ["sh", "-c", "npx prisma migrate deploy && npx prisma db seed"]

# ---------- runner: imagen mínima de producción ----------
FROM node:${NODE_VERSION} AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs \
  && mkdir -p /app/uploads && chown nextjs:nodejs /app/uploads

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
