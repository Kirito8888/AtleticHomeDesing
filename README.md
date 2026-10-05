# LifeOS

PWA de gestión personal centrada en atletismo multi-disciplina (pista, saltos,
lanzamientos), fuerza, recuperación, finanzas, nutrición y estudio con IA.

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind v4 · shadcn/ui ·
PostgreSQL 17 + pgvector · Prisma 7 · Docker Compose.

## Estado

- [x] **Fase 1 — Init:** proyecto, Prisma, `schema.prisma`, Docker. *Pendiente de aprobación del schema; aún no hay migraciones.*
- [ ] Fase 2 — Backend & APIs (OpenFoodFacts, TSS/CTL/ATL/TSB/Readiness, Gemini)
- [ ] Fase 3 — Frontend mobile-first
- [ ] Fase 4 — Documentación (`manual_backend.md`, `manual_docker_debian.md`)

## Desarrollo local

```bash
cp .env.example .env.local        # rellena valores
npm install                       # ejecuta `prisma generate`
npm run dev
```

Scripts útiles: `npm run typecheck`, `npm run lint`, `npm run db:validate`.

## Archivos clave

| Archivo | Qué es |
|---|---|
| `prisma/schema.prisma` | Modelo de datos completo (37 tablas) |
| `prisma/sql/pgvector_setup.sql` | Índice HNSW + trigger de partida doble (se añade a la 1ª migración) |
| `docker-compose.yml` | `web`, `db` (pgvector), `pgadmin` + `migrate` (perfil `tools`) |
| `.env.example` | Plantilla de variables; ninguna credencial en el repo |
