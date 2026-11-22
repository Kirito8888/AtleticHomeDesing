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
| Diagnóstico del servidor (solo lectura; menú o `--all/--env/--web/--ops`) | `bash scripts/ops/doctor.sh` |
| Licencias | `node scripts/third-party-notices.mjs --check` |
| Contraste de tokens (claro, oscuro, `.hc`; lo pasa la CI) | `npm run a11y:contrast` (`-- --all` lista todos los pares) |
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
- La frase de autoría y uso no comercial vive en `src/lib/legal/notice.ts` y debe ser idéntica en `LICENSE`, `README.md`, `NOTICE` y la interfaz (`license.test.ts`); el texto legal es provisional, pendiente de revisión por un abogado.
- Recuperación y lesiones con entrenadora o club son salud (art. 9): `RECOVERY` nunca nace marcado (`DEFAULT_SHARED_SCOPES`) y solo cuenta con el consentimiento `COACH_RECOVERY` (`lib/coach/recovery-consent.ts`). Edad mínima 14 años. Al cambiar condiciones o política, subir `TERMS_VERSION`.
- Seguridad v3.0 D: ADMIN/COACH sin 2FA, pasada `STAFF_2FA_REQUIRED_FROM`, solo pueden configurarla (`requireUser` 403 `second_factor` + `SecondFactorGate`); `TRUSTED_PROXY_HOPS` (defecto 1) fija qué entrada de `X-Forwarded-For` es la IP; `AUTH_SECRET` es obligatorio en producción. Detalle en `docs/estado.md`.
- Cadena de suministro (v3.0 E): las acciones de `.github/workflows/*` van solo por SHA completo con `# vX.Y.Z` y `permissions:` mínimo (lo vigila `src/test/workflows-pinned.test.ts`; Dependabot las actualiza); `lib/ai/**` no puede importar `lib/health/isak*|cycle*|women*` (`src/test/architecture.test.ts`). Detalle en `docs/arquitectura.md`.
- Control de acceso y abuso (v3.0 R): toda escritura (POST/PUT/PATCH/DELETE) cuenta contra `LIMITS.mutation` por usuaria dentro de `requireUser` (429; exentas solo `mutationLimitExempt` en `request-context.ts`: derechos RGPD y configuración de acceso); las rutas con cubo propio lo conservan además. Una ruta con `[id]` nueva debe clasificarse en `src/lib/auth/route-isolation.int.test.ts` (probada, excluida o PENDIENTE; PENDIENTE solo baja). Los fallos de acceso que salgan de auditorías se arreglan sin detallar el método en el repo.
- SSRF y copias locales (v3.0 S): las URL de proveedores escritas por usuarias se resuelven una vez y se conecta a esa IP (`lib/security/ssrf.ts`: `isPrivateAddress`, `pinnedFetch`); no volver a resolver el nombre. Las copias privadas del SW caducan a las 24 h y se purgan con 401 o redirección a `/login` (`public/sw.js`, `lib/offline/private-cache.ts`).
- Apple Fitness (v3.1 A): los entrenos del reloj llegan por `POST /api/training/apple-fitness` (token personal Bearer, hash en `PersonalToken`, revocable) a una bandeja de borradores; nada entra en el diario sin aceptar. «Crear aparte» lleva `source = APPLE_FITNESS` con el mismo aislamiento que Strava: **los orígenes privados viven en `PRIVATE_SOURCES` de `lib/strava/policy.ts`**; toda consulta que llegue a la IA, la entrenadora, el club, el informe o el `.ics` usa `notFromStrava` (nunca `source: STRAVA` suelto) y `lib/ai/**` no importa `lib/apple-fitness/**`. «Completar» solo rellena huecos de una sesión propia (`source: null`), que sigue siendo de la usuaria.
- Apple Salud (v3.1 B): `POST /api/recovery/apple-health` (mismo token Bearer que Apple Fitness) guarda sueño, VFC, FC en reposo y peso por día. Por métrica: campo vacío → se guarda; igual con tolerancia (`TOLERANCE` en `lib/recovery/health-sync.ts`) → se conserva lo existente; distinto de lo anotado → **no se pisa** y se abre un `HealthSyncConflict` que se resuelve en `/recovery`. **La VFC de Apple es SDNN: vive en `hrvSdnnMs`, nunca en `hrvRmssdMs`**; el readiness la puntúa solo contra su propia línea base. `RecoveryMetrics.healthSync` guarda lo último que escribió Apple (así un reenvío corrige a Apple sin aviso). Peso, grasa y `healthSync` no salen a la entrenadora (`GET /api/recovery` los quita para quien no es la dueña); `lib/ai/**` no importa `lib/recovery/health-sync*` (`architecture.test.ts`).
- Apple · calibración y diagnóstico (v3.1 C): las entradas de Atajos pasan por `lib/integrations/apple-units.ts` (números con coma o punto de miles, unidades explícitas kcal/kJ, m/km/mi, h/min/s, kg/g/lb, lpm, ms; **un número desnudo se toma en la unidad del campo, nunca se adivina por magnitud**; instantes ISO con o sin zona: **sin zona = hora de Madrid**, y también «AAAA-MM-DD HH:mm:ss ±hhmm»). El día de un entreno o de una métrica es siempre el de Madrid (`localDay`); el sueño cuenta para el día en que te despiertas (`sleepEnd`). Deporte: `mapActivity` en `lib/apple-fitness/normalize.ts` (fuerza → STRENGTH, HIIT/cruzado → MIXED, resto TRACK; respaldo TRACK + OTHER, **nunca TECHNICAL**). Tolerancias de `TOLERANCE`: sueño ±1 min (comparado en minutos enteros), peso ±0,05 kg, FC ±1 lpm, VFC ±1 ms. Diagnóstico: `AppleDelivery` (por usuaria y vía FITNESS/HEALTH, **solo recuentos y nombres de campo, nunca valores ni mensajes con texto recibido**; vive aparte del token, revocarlo no lo borra); `?dryRun=1` en los dos endpoints valida sin guardar; `POST /api/settings/apple-fitness/test` (token pegado = el tuyo, mensaje único si no) pasa un payload sintético sin escribir datos.
- Nada escribe en el plan sin confirmación (siempre borrador + aceptar).
- Migraciones solo aditivas; una por versión, regenerada con `regen-mig.sh`.
- La usuaria fusiona los PR; Claude nunca fusiona. Rama de trabajo: la que indique la sesión.
- Respuestas en español, como asesor crítico (ver preferencias de la usuaria).

## Versionado y documentación viva
- **Parche (x.y.Z):** arreglos y ajustes sin función nueva. **Menor (x.Y.0):** bloques y funciones pequeñas. **Mayor (X.0.0):** cambios estructurales o hitos grandes (arquitectura, esquema que rompe compatibilidad, rediseños).
- `package.json` se sube al **cerrar** la versión, no en cada bloque; la decisión del número final es de la usuaria.
- **Tras fusionar el PR de cierre (v2.11.0 incluida):** la usuaria resube los adjuntos del Gem (`CLAUDE.md`, `docs/estado.md`, `docs/como-trabajar.md`; ver `docs/gemini-gem.md`). `e2e.sh all` incluye `e2e:noeval` desde v2.8.0 `e2e:v29a` desde v2.9.0 y `e2e:v210a` desde v2.10.0 (v2.10.0 no tiene migración) y `e2e:practica` (Práctica guiada, v2.11.0) y `e2e:v30d` (2FA de staff, v3.0 D; arranca el servidor con `STAFF_2FA_REQUIRED_FROM=2000-01-01`) y `e2e:v30h` («Hoy»: acción principal y registro en 1–2 toques a 390 px, v3.0 H) y `e2e:v30g` (navegación, barra móvil en prefs y foco por teclado, v3.0 G; principios en `docs/diseno-v3.md`) y `e2e:apple` (Apple Fitness: token, envío Bearer, bandeja y aislamiento, 390 px, v3.1 A) y `e2e:health` (Apple Salud: envío diario, aviso de conflicto en `/recovery`, 390 px, v3.1 B) y `e2e:applediag` (diagnóstico y «Probar envío» en Ajustes, unidades y horas límite de Madrid, 390 px, v3.1 C) y `e2e:macros` (macros por tipo de sesión y día de la semana, 390 px, 0 RSC) y `e2e:historial` (importación de historial Excel/CSV en `/training`, 390 px) y `e2e:a11y` (axe WCAG 2.2 AA en las 8 verticales × claro/oscuro/`.hc`, v3.0 F; excepciones en `ALLOWED` y en `docs/auditoria-v3-0.md` § 5) y `e2e:v30t` (declaración `/legal/accesibilidad`, teclado, tablas de gráficos y avisos, v3.0 T; la declaración no se marca «conforme» hasta la prueba con lector de pantalla de la usuaria); v2.11.0 y v3.0.0-preview tampoco tienen migración; **v3.1 sí** (`20270801080000_v3_1_features`, Bloque A; al cerrar: `EXPECTED_MIGRATION` de `doctor.sh`, `snapshot.sh --before 20270801080000_v3_1_features` y `test-migration.sh`). En un contenedor nuevo, `test-migration.sh` necesita antes `snapshot.sh --before 20270701080000_v2_9_features`.
- **Cierre de versión y cambios de rutas/variables/migraciones:** actualizar el bloque «ACTUALIZAR EN CADA CIERRE DE VERSIÓN» de `scripts/ops/doctor.sh` (`EXPECTED_MIGRATION`, `PUBLIC_ROUTES`, `PRIVATE_PAGES`, `PRIVATE_API`, `CRITICAL_KEYS`, ahora con `STAFF_2FA_REQUIRED_FROM`) y ampliar `scripts/ops/selftest.sh` si cambia su comportamiento. Una ruta nueva (o movida) sin reflejar ahí da avisos falsos en producción.
- **Tras cada cambio** (bloque, arreglo o dependencia) se actualizan siempre `CLAUDE.md`, `docs/estado.md` y `docs/como-trabajar.md` si lo cambiado les afecta, en el mismo commit.

## Verificación (proporcional, para gastar poco)
- **Cada bloque:** typecheck, lint, los tests de lo tocado y la suite E2E del bloque. Commit + push. Actualizar `docs/estado.md`.
- **Cierre de versión:** todo lo anterior + `e2e.sh all` + `test-migration.sh` + Semgrep + licencias, CHANGELOG, guía,
  manual «De vX a vY», PR. La CI hace el resto: consultarla solo si avisa de un fallo y con salidas cortas.
- No leas ficheros enteros si basta un `grep -n` o un rango de líneas; no vuelques logs completos (usa `tail`).
