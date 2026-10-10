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
# v1.9: invitaciones (`npm run user -- invite`) con el mismo formato de token que la app
COPY src/lib/security/share-token.ts ./src/lib/security/
CMD ["sh", "-c", "npx prisma migrate deploy && npx prisma db seed"]

# ---------- runner: imagen mínima de producción ----------
FROM node:${NODE_VERSION} AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
# v1.7: parches de seguridad del sistema base y fuera npm/corepack/yarn (la imagen final solo ejecuta
# `node server.js`): menos tamaño y menos componentes con fallos conocidos.
RUN apt-get update && apt-get upgrade -y --no-install-recommends && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /opt/yarn* /usr/local/bin/yarn /usr/local/bin/yarnpkg \
  && groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs \
  && mkdir -p /app/uploads && chown nextjs:nodejs /app/uploads

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# v1.8: commit de esta imagen (lo pasa update.sh) para avisar de versiones nuevas en Estado del servidor.
# Al final para no invalidar la caché de las capas anteriores.
ARG GIT_SHA=""
ENV GIT_SHA=${GIT_SHA}

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
