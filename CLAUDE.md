@AGENTS.md

# Atlenza · instrucciones para Claude

Lee también `docs/estado.md` (versión, siguiente bloque, decisiones). Cómo se trabaja: `docs/como-trabajar.md` (encargos preparados con el Gem de Gemini: `docs/gemini-gem.md`).

## Entorno (contenedor de la web)
El hook `scripts/dev/session-start.sh` deja listos Postgres 16 + pgvector (127.0.0.1:5432, BD `lifeos`),
`.env.local` de desarrollo, tesseract/poppler, dependencias, migraciones y seed. Si algo falla: `sh scripts/dev/session-start.sh`.
Para comandos que necesitan la BD: `set -a; . ./.env.local; set +a`.
Antes de vitest/E2E en un contenedor nuevo: `npm install` (el hook no siempre trae las dependencias nuevas, p. ej. `mammoth`),
`CHROMIUM_PATH=/opt/pw-browsers/chromium` y las claves VAPID solo-CI de `ci.yml` en `.env.local`. Sin ellas fallan `study-manual`/`pdf-render`
(503) y las suites `e2e`/`e2e:security` por entorno, no por código.

## Comandos
| Qué | Comando |
|---|---|
| Tipos / lint | `npm run -s typecheck` · `npm run -s lint` |
| Tests (unitarios + integración con BD) | `npx vitest run [ruta]` |
| E2E de un bloque | `npm run -s build && sh scripts/dev/e2e.sh e2e:v110` (suites en package.json) |
| Todas las E2E (solo al cerrar versión) | `sh scripts/dev/e2e.sh all` |
| Foto de la BD antes de cambiar el esquema | `sh scripts/dev/snapshot.sh` (o `--before <migración> […]` en bloques posteriores al A) |
| Migración de la versión (una por versión) | `sh scripts/dev/regen-mig.sh <AAAAMMDDhhmmss_v2_0_features>` |
| Probar la migración sobre copia | `sh scripts/dev/test-migration.sh` |
| Licencias | `node scripts/third-party-notices.mjs --check` |
| Semgrep (lo pasa la CI; en local solo al cerrar) | `pip install -q semgrep && semgrep scan --config .semgrep.yml --error --metrics=off src prisma e2e` |

## Reglas fijas
- Commits con autor David Ornelas Luna <82316475+Kirito8888@users.noreply.github.com>; la IA solo como co-autora.
- Nunca: secretos o claves en el código, `.env*` (salvo `.env.example`), los PDF del plan, datos reales sin anonimizar,
  scraping, umbrales personales en el código (van en prefs), identificadores de modelo en el repo.
- **El repo es público:** nunca IPs, usuarios, rutas, dominios, nombres de equipos ni la topología real del servidor o del router,
  ni en docs, ni en tests, ni en mensajes de commit o PR. Usar marcadores (`USUARIO`, `IP_DEL_SERVIDOR`, `<RUTA>`).
- La recuperación (sueño, VFC, FC en reposo…) sin ámbito RECOVERY no entra en el prompt ni sale en el texto de la IA (`lib/ai/recovery-redact.ts`, informe semanal).
- La salud cifrada (ciclo, salud de la mujer, composición corporal ISAK `lib/health/isak*`) nunca va a la IA, al coach, al informe semanal ni al `.ics`. Lo importado de Strava (`notFromStrava`) no va a la IA ni a la entrenadora.
- IA: si hay `LOCAL_AI_BASE_URL`, el servidor de IA local va primero (`lib/ai/local.ts`); la usuaria no quiere IA ajena por ahora: con `LOCAL_AI_ONLY=true` `aiFor` nunca devuelve otro proveedor (sin embeddings; local apagado → 503). Detalle en `docs/estado.md`.
- Nada escribe en el plan sin confirmación (siempre borrador + aceptar).
- Migraciones solo aditivas; una por versión, regenerada con `regen-mig.sh`.
- La usuaria fusiona los PR; Claude nunca fusiona. Rama de trabajo: la que indique la sesión.
- Respuestas en español, como asesor crítico (ver preferencias de la usuaria).

## Versionado y documentación viva
- **Parche (x.y.Z):** arreglos y ajustes sin función nueva. **Menor (x.Y.0):** bloques y funciones pequeñas. **Mayor (X.0.0):** cambios estructurales o hitos grandes (arquitectura, esquema que rompe compatibilidad, rediseños).
- `package.json` se sube al **cerrar** la versión, no en cada bloque; la decisión del número final es de la usuaria.
- **Tras fusionar el PR de cierre (v2.9.0 incluida):** la usuaria resube los adjuntos del Gem (`CLAUDE.md`, `docs/estado.md`, `docs/como-trabajar.md`; ver `docs/gemini-gem.md`). `e2e.sh all` incluye `e2e:noeval` desde v2.8.0 y `e2e:v29a` desde v2.9.0. En un contenedor nuevo, `test-migration.sh` necesita antes `snapshot.sh --before 20270701080000_v2_9_features`.
- **Tras cada cambio** (bloque, arreglo o dependencia) se actualizan siempre `CLAUDE.md`, `docs/estado.md` y `docs/como-trabajar.md` si lo cambiado les afecta, en el mismo commit.

## Verificación (proporcional, para gastar poco)
- **Cada bloque:** typecheck, lint, los tests de lo tocado y la suite E2E del bloque. Commit + push. Actualizar `docs/estado.md`.
- **Cierre de versión:** todo lo anterior + `e2e.sh all` + `test-migration.sh` + Semgrep + licencias, CHANGELOG, guía,
  manual «De vX a vY», PR. La CI hace el resto: consultarla solo si avisa de un fallo y con salidas cortas.
- No leas ficheros enteros si basta un `grep -n` o un rango de líneas; no vuelques logs completos (usa `tail`).
