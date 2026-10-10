# Atlenza

PWA personal para un atleta (pista, saltos y lanzamientos) que junta en una sola app:
- **entrenamiento:** fuerza, técnica y carga (PMC), recuperación y planificación;
- **nutrición**, **finanzas** y **estudio con IA**.

Pensada para el móvil y autoalojada en tu propio servidor.

> **© 2026 David Ornelas Luna. Todos los derechos reservados.**
> Este repositorio es público para que se pueda ver, pero **usar, instalar, copiar, modificar o
> distribuir Atlenza requiere permiso previo y por escrito del autor**. Para pedirlo, abre una
> [issue](https://github.com/Kirito8888/AtleticHomeDesing/issues). Condiciones completas en
> [`LICENSE`](LICENSE); componentes de terceros en [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
> No es «open source»: es código visible con todos los derechos reservados.

**Versión actual: v1.9**: licencia y autoría, nombre Atlenza, acceso solo por invitación, IA con la clave de cada usuario (Gemini, OpenAI, Claude, Mistral, OpenRouter o un modelo local) y monitorización interna. Ver [`CHANGELOG.md`](CHANGELOG.md).

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind v4 · shadcn/ui · PostgreSQL 17 + pgvector · Prisma 7 · pg-boss · Docker Compose · Google Gemini (opcional).

## Qué hace

| Módulo | Lo principal |
|---|---|
| **Inicio** | Readiness, forma (CTL/ATL/TSB, ACWR), «Hoy toca», **avisos de «Mis reglas»**, próxima competición, nutrición, finanzas y tareas |
| **Entreno** | Fuerza con temporizador y plantillas, técnica intento a intento (con vídeo contado), pista, **sesiones mixtas**, importar del reloj, **tabla de RM, serie de test y APRE**, semana L–D con tope de lanzamientos, 3 mejores por implemento, marcas personales |
| **Planificación** | Calendario con ciclos, eventos y tareas; **importar el plan en PDF** con versiones; plan del día con **kg desde tu RM** y registrar desde el plan; **modo competición** (checklist y hoja de intentos); calendario .ics |
| **Recuperación** | Sueño, VFC y FC en reposo → readiness; **control rápido** (squeeze, talón, salto); molestias y lesiones; **Mi ciclo** (opcional, cifrado) |
| **Nutrición** | OpenFoodFacts y escáner de códigos de barras, comidas favoritas, **hidratos según el día del plan** |
| **Finanzas** | Partida doble, presupuestos, suscripciones, importar extractos sin duplicados, **gastos deportivos por temporada** |
| **Atlenza IA** | **Crear tu planificación** con un cuestionario sin escribir; chat sobre tus apuntes (RAG), flashcards, coach semanal. Solo con tu consentimiento |
| **Ajustes** | Mis reglas, 2FA, notificaciones y recordatorios, informe para la entrenadora, permisos del entrenador, exportar y borrar tus datos |

## Documentación

| Para… | Lee |
|---|---|
| Usar la app (incluido importar tu plan) | [`docs/guia-usuario.md`](docs/guia-usuario.md) |
| Instalarla o actualizarla en Debian con Docker | [`manual_docker_debian.md`](manual_docker_debian.md) (actualizar: § 8) |
| Entender cómo está hecha | [`docs/arquitectura.md`](docs/arquitectura.md) → [`manual_backend.md`](manual_backend.md) (API, fórmulas, RAG) |
| Contribuir o probar en local | [`CONTRIBUTING.md`](CONTRIBUTING.md) |
| Avisar de un fallo de seguridad | [`SECURITY.md`](SECURITY.md) |
| Ver qué cambió en cada versión | [`CHANGELOG.md`](CHANGELOG.md) |

## Inicio rápido

**Producción** (Debian + Docker; detalle en el manual):

```bash
cp .env.example .env.production   # rellena secretos y AUTH_URL
alias dc='docker compose --env-file .env.production'
dc up -d db && dc --profile tools run --rm --build migrate && dc up -d --build web
dc --profile tools run --rm migrate npm run user -- create tu@email   # primer usuario
./scripts/update.sh                                                   # actualizar (copia previa + vuelta atrás automática)
```

**Desarrollo:**

```bash
cp .env.example .env.local
APP_ENV_FILE=.env.local docker compose --env-file .env.local up -d db
npm install && npx prisma migrate deploy && npm run db:seed
npm run dev
```

Comprobaciones:
- `npm run lint`, `npm run typecheck` y `npm test` (con `DATABASE_URL`, también los de integración);
- con la app arrancada: `npm run e2e`, `npm run e2e:plan` y `npm run e2e:security`.

## Privacidad

El repositorio es público; tus datos no. Ninguna credencial va en el código: todo por variables de entorno.

Los tests usan datos sintéticos; tu plan, tus métricas y tus extractos solo entran por la app, en tu servidor:
- **Copias:** se cifran con tu clave pública.
- **IA:** desactivada hasta que la autorizas.
- **Plan en PDF:** los ficheros no se guardan tras importarlos.
- **Ciclo menstrual:** cifrado en la BD, nunca se envía a la IA ni lo ve la entrenadora.
- **Enlaces compartidos** (.ics, informe): secretos, revocables y sin datos de salud.

## Archivos clave

| Archivo | Qué es |
|---|---|
| `prisma/schema.prisma` · `prisma/migrations/` | Modelo de datos y migraciones, siempre aditivas |
| `src/lib/training/` | Motor de carga (`tss.ts`, `pmc.ts`, `readiness.ts`), importar del reloj |
| `src/lib/planning/plan-import/` | Lector del plan en PDF (`parse.ts`), versiones (`rules.ts`) e importación (`service.ts`) |
| `src/lib/{nutrition,finance,ai,security,push,jobs}/` | Servicios de cada módulo |
| `src/app/api/**/route.ts` | API REST (referencia en `manual_backend.md` § 6) |
| `src/proxy.ts` · `src/auth.ts` | Páginas protegidas + CSP con nonce · login con límites, 2FA y revocación |
| `docker-compose.yml` | `web`, `db` y, por perfiles, `migrate`, `backup` y `pgadmin` |
| `scripts/update.sh` · `deploy/` | Actualizar con vuelta atrás · copias cifradas y fail2ban |
| `.github/workflows/ci.yml` | Lint, tipos, tests, build, Semgrep, E2E y stack Docker real |
