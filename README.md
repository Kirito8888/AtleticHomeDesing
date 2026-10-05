# LifeOS

PWA de gestión personal centrada en atletismo multi-disciplina (pista, saltos,
lanzamientos), fuerza, recuperación, finanzas, nutrición y estudio con IA.

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind v4 · shadcn/ui ·
PostgreSQL 17 + pgvector · Prisma 7 · Docker Compose.

## Estado

- [x] **Fase 1 — Init:** proyecto, Prisma, `schema.prisma` (aprobado), Docker.
- [x] **Fase 2 — Backend & APIs:** auth multiusuario, motor de carga (TSS/CTL/ATL/TSB/ACWR/Readiness), OpenFoodFacts, finanzas de partida doble, Astras AI (RAG, flashcards, coach semanal).
- [x] **Fase 3 — Frontend mobile-first:** panel de widgets, registro ágil de fuerza/técnica/pista, PMC, recuperación, periodización, nutrición con escáner, finanzas, Astras AI, ajustes y PWA instalable.
- [x] **Fase 4 — Documentación:** [`manual_backend.md`](manual_backend.md) y [`manual_docker_debian.md`](manual_docker_debian.md).

## Producción (Debian + Docker)

Ver [`manual_docker_debian.md`](manual_docker_debian.md). En resumen:

```bash
cp .env.example .env.production   # rellena secretos y AUTH_URL
alias dc='docker compose --env-file .env.production'
dc up -d db && dc --profile tools run --rm --build migrate && dc up -d --build web pgadmin
```

## Desarrollo local

```bash
cp .env.example .env.local        # rellena valores
APP_ENV_FILE=.env.local docker compose --env-file .env.local up -d db
npm install                       # ejecuta `prisma generate`
npx prisma migrate dev && npm run db:seed
npm run dev
```

Scripts útiles: `npm test`, `npm run typecheck`, `npm run lint`, `npm run e2e` (con la app arrancada; `BASE_URL`).

## Archivos clave

| Archivo | Qué es |
|---|---|
| `prisma/schema.prisma` | Modelo de datos completo (37 tablas) |
| `prisma/migrations/*_init` | Migración inicial + índice HNSW y trigger de partida doble (SQL manual al final) |
| `src/lib/training/` | Motor de carga: `tss.ts`, `strength.ts`, `pmc.ts`, `readiness.ts` (funciones puras con tests) |
| `src/lib/{nutrition,finance,ai}/` | Servicios de cada módulo |
| `src/app/api/**/route.ts` | API REST (referencia en `manual_backend.md` § 6) |
| `docker-compose.yml` | `web`, `db` (pgvector), `pgadmin` + `migrate` (perfil `tools`) |
| `.env.example` | Plantilla de variables; ninguna credencial en el repo |
