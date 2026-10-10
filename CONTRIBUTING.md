# Contribuir

> **Contribuciones externas:** Atlenza tiene todos los derechos reservados (ver [`LICENSE`](LICENSE)). No se aceptan aportaciones sin un acuerdo previo y por escrito con el autor. Esta guía es para el autor y las personas que autorice.


Proyecto personal, pero con las reglas de uno serio: todo cambio pasa por la CI y lleva tests.

## Regla número uno: nunca datos personales en el repositorio

El repositorio es **público**. No se suben:
- tus PDF del plan, ni exportaciones del reloj, ni extractos del banco, ni capturas con datos reales;
- `.env*` con valores (solo `.env.example`, sin secretos);
- volcados de la BD ni copias de seguridad.

Para probar con tus ficheros reales, hazlo en local y fuera del repositorio. Por ejemplo:

```bash
PLAN_ZIP=/ruta/fuera/del/repo/plan.zip npm run e2e:plan
```

Los tests usan datos **sintéticos** generados en el propio test:
- PDF: `src/test/pdf-fixture.ts` y `src/test/plan-fixtures.ts`;
- FIT: con `fit-file-parser` (MIT); los ficheros de prueba se generan con `e2e/fit-builder.mjs`;
- CSV y Norma 43: escritos a mano.

## Entorno

Requisitos: Node 22 y PostgreSQL 17 con pgvector (o Docker).

```bash
cp .env.example .env.local                       # rellena valores de desarrollo
APP_ENV_FILE=.env.local docker compose --env-file .env.local up -d db
npm install                                      # genera el cliente Prisma
npx prisma migrate deploy && npm run db:seed
npm run dev
```

## Antes de abrir un PR

```bash
npm run lint && npm run typecheck
npm test                       # con DATABASE_URL, también los de integración (*.int.test.ts)
npm run build                  # sin .env: el build no debe necesitar secretos
```

Con la app arrancada (`BASE_URL`, `ALLOW_REGISTRATION=true`):

```bash
npm run e2e
npm run e2e:plan
```

Para `npm run e2e:security`, arranca un servidor nuevo con `ALLOW_REGISTRATION=false`.

## Convenciones

- **Next.js 16 no es el que conoces:** antes de usar una API, consulta `node_modules/next/dist/docs/` (ver `AGENTS.md`). `proxy.ts` sustituye al middleware.
- **Migraciones solo aditivas.** Se generan con `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` y van en una carpeta nueva bajo `prisma/migrations/`. Nada de borrar ni renombrar columnas en uso: `update.sh` depende de que la versión anterior funcione con el esquema nuevo.
- **Rutas API:** siempre `route()` + `requireUser()` + zod. El test `src/test/api-auth.test.ts` lo comprueba.
- **Lógica pura aparte** (sin BD ni red) y con tests unitarios. Los servicios con BD llevan `import "server-only"`.
- **Textos de la UI y de los commits, en español.** Commits con el formato «Módulo: qué cambia».
- **Seguridad:**
  - `.semgrep.yml` bloquea: `$queryRawUnsafe`, `dangerouslySetInnerHTML`, `eval`, `Math.random` para tokens, secretos en los logs y comparar secretos con `===`;
  - credenciales, solo por variables de entorno;
  - las vulnerabilidades se avisan como indica [`SECURITY.md`](SECURITY.md).
