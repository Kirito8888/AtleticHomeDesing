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
- [x] **v1.1 — Seguridad y privacidad:** registro cerrado, límites de intentos y bloqueo de cuenta, CSP con nonce y HSTS, sesiones revocables, cambio de contraseña/email, consentimiento de IA, exportación y borrado de cuenta, copias cifradas, editar sesiones, tareas programadas y CI. Actualización desde v1.0: [`manual_docker_debian.md` § 8](manual_docker_debian.md#de-v10-a-v11-seguridad-y-privacidad).
- [x] **v1.2 — 20 mejoras:** 2FA con códigos de recuperación, registro de actividad, permisos del coach por ámbito, fail2ban, Semgrep/Dependabot, healthcheck, copias automáticas cifradas con restauración comprobada, `scripts/update.sh` con vuelta atrás, temporizador de descanso, plantillas de sesión, comidas favoritas, gráfica de 1RM, lesiones, calendario con detalle del día, notificaciones push, importar FIT/GPX/TCX, importar extractos (CSV/Norma 43) e ingesta de apuntes en segundo plano. Actualización: [`manual_docker_debian.md` § 8](manual_docker_debian.md#de-v11-a-v12-20-mejoras).

## Producción (Debian + Docker)

Ver [`manual_docker_debian.md`](manual_docker_debian.md). En resumen:

```bash
cp .env.example .env.production   # rellena secretos y AUTH_URL
alias dc='docker compose --env-file .env.production'
dc up -d db && dc --profile tools run --rm --build migrate && dc up -d --build web
dc --profile tools run --rm migrate npm run user -- list    # gestión de usuarios
./scripts/update.sh                                         # actualizar (copia + vuelta atrás automática)
```

## Desarrollo local

```bash
cp .env.example .env.local        # rellena valores
APP_ENV_FILE=.env.local docker compose --env-file .env.local up -d db
npm install                       # ejecuta `prisma generate`
npx prisma migrate dev && npm run db:seed
npm run dev
```

Scripts útiles: `npm test`, `npm run typecheck`, `npm run lint`, `npm run e2e` y `npm run e2e:security` (con la app arrancada; `BASE_URL`), `npm run user -- <list|create|reset-password|unlock|set-role>`.

## Archivos clave

| Archivo | Qué es |
|---|---|
| `prisma/schema.prisma` | Modelo de datos completo (37 tablas) |
| `prisma/migrations/*_init` | Migración inicial + índice HNSW y trigger de partida doble (SQL manual al final) |
| `src/lib/training/` | Motor de carga: `tss.ts`, `strength.ts`, `pmc.ts`, `readiness.ts` (funciones puras con tests) |
| `src/lib/{nutrition,finance,ai}/` | Servicios de cada módulo |
| `src/app/api/**/route.ts` | API REST (referencia en `manual_backend.md` § 6) |
| `docker-compose.yml` | `web`, `db` (pgvector), `pgadmin` (perfil `pgadmin`) + `migrate` (perfil `tools`) |
| `src/proxy.ts` · `src/auth.ts` | Protección de páginas + CSP con nonce · login con límites, bloqueo y revocación de sesiones |
| `prisma/scripts/user-admin.ts` | Gestión de usuarios por terminal (`npm run user`) |
| `scripts/update.sh` · `deploy/backup` · `deploy/fail2ban` | Actualizar con vuelta atrás · servicio de copias cifradas · filtro y jail de fail2ban |
| `.semgrep.yml` · `.github/dependabot.yml` | Reglas de seguridad propias (bloquean la CI) · actualizaciones de dependencias |
| `.env.example` | Plantilla de variables; ninguna credencial en el repo |
