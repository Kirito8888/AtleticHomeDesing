# LifeOS

PWA de gestión personal centrada en atletismo multi-disciplina (pista, saltos,
lanzamientos), fuerza, recuperación, finanzas, nutrición y estudio con IA.

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind v4 · shadcn/ui ·
PostgreSQL 17 + pgvector · Prisma 7 · Docker Compose.

## Estado

- [x] **Fase 1 — Init:** proyecto, Prisma, `schema.prisma` (aprobado), Docker.
- [x] **Fase 2 — Backend & APIs:** auth multiusuario, motor de carga (TSS/CTL/ATL/TSB/ACWR/Readiness), OpenFoodFacts, finanzas de partida doble, Astras AI (RAG, flashcards, coach semanal).
- [ ] Fase 3 — Frontend mobile-first
- [ ] Fase 4 — Documentación (`manual_backend.md`, `manual_docker_debian.md`)

## Desarrollo local

```bash
cp .env.example .env.local        # rellena valores
npm install                       # ejecuta `prisma generate`
npm run dev
```

Base de datos local (con la BD levantada y `DATABASE_URL` en `.env.local`):

```bash
npx prisma migrate dev            # aplica migraciones
npm run db:seed                   # catálogo global de ejercicios
```

Scripts útiles: `npm test`, `npm run typecheck`, `npm run lint`, `npm run db:validate`.

## Archivos clave

| Archivo | Qué es |
|---|---|
| `prisma/schema.prisma` | Modelo de datos completo (37 tablas) |
| `prisma/migrations/*_init` | Migración inicial + índice HNSW y trigger de partida doble (SQL manual al final) |
| `src/lib/training/` | Motor de carga: `tss.ts`, `strength.ts`, `pmc.ts`, `readiness.ts` (funciones puras con tests) |
| `src/lib/{nutrition,finance,ai}/` | Servicios de cada módulo |
| `src/app/api/**/route.ts` | API REST (ver `manual_backend.md` en la Fase 4) |
| `docker-compose.yml` | `web`, `db` (pgvector), `pgadmin` + `migrate` (perfil `tools`) |
| `.env.example` | Plantilla de variables; ninguna credencial en el repo |
