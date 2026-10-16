# Auditoría UX/UI a 390 px · rutas de entrenamiento y ajustes (exploratorio v2.3)

> Documento temporal de trabajo. **Ningún cambio de código aplicado**: cada hallazgo espera confirmación de la usuaria.
> Fecha: 16/10/2026 · Base: v2.2.0 (`main`).

## Alcance y método
- **Rutas:** 19 páginas de `/training/**` (sin las `[id]`) y `/settings`, `/settings/privacy`, `/settings/trash`; sus componentes en `src/components/{training,settings,ui}` y `components/charts/lazy.tsx`.
- **Estático:** `grep` de controles nativos, clases de tamaño sin `max-md:`, rejillas sin prefijo responsive, tablas, límites de error y `dynamic()`.
- **Dinámico:** build de producción servido en `:3100`, Chromium a 390×844 táctil, claro y oscuro, usuaria sintética **vacía** (`npm run user -- create`). Se midió scroll horizontal, controles < 44 px y errores de consola/página. El script vive en el scratchpad, no en el repo.
- **Privacidad:** no se leyó ni exportó ningún dato de salud ni de Strava; no hay datos reales. Fuera de alcance: Prisma, API de IA, sincronización.
- **Limitación importante:** con la cuenta vacía **no se pintan** los registradores (fuerza, técnica, pista, descanso) ni las tablas con datos. Esos hallazgos son **estáticos** (marcados «E») y deben confirmarse con una sesión sintética rellena antes de arreglarlos.

## Resultado medido (cuenta vacía, 19 rutas × claro/oscuro)
- Scroll horizontal: **0** en las 38 combinaciones. Errores de consola/página: **0**. HTTP: todo 200. Ninguna `ChunkLoadError`.
- Controles < 44 px: solo `/settings` (3, idénticos en claro y oscuro) → P2-1.

## Hallazgos

### P1 — fallo posible sin red de seguridad
| ID | Dónde | Evidencia | Propuesta | Toca lógica |
|---|---|---|---|---|
| P1-1 (E) | `src/app/(app)/training/**` y resto de `(app)` | Solo existe **un** `error.tsx` en todo `src/app`: `settings/error.tsx`, que es el único que trata `ChunkLoadError`. `components/charts/lazy.tsx:12-19` carga 8 gráficas con `next/dynamic` (`ssr:false`); si un chunk falla tras un despliegue, en `/training` no hay límite de error que recargue. | Extraer la lógica de `settings/error.tsx` a un componente compartido y añadir `error.tsx` en `(app)/` (cubre training y el resto). | No |

> Matiz: no he reproducido el fallo; es riesgo por ausencia de protección, no un bug observado.

### P2 — táctil y rejillas (flujos frecuentes)
| ID | Dónde | Evidencia | Propuesta |
|---|---|---|---|
| P2-1 (M) | `settings/carbs-form.tsx:124,128,131` (`track-name`, `track-lat`, `track-lon`) | `<input>` nativo con `h-10`: **40 px** medidos. Son los 3 avisos de `e2e:v22b`. | Usar `<Input>` de `ui/` (ya sube a 44 px en móvil) o `h-10 max-md:h-11`. |
| P2-2 (E) | `training/strength-logger.tsx:200` | Botón borrar serie `size-7` (28 px) pisando el `max-md:size-11` del icono. Se usa en cada serie. | Quitar `className="size-7"` o `max-md:size-11`. |
| P2-3 (E) | `training/strength-logger.tsx:218` | `<input>` VBT `h-8` (32 px). | `h-8 max-md:h-11`. |
| P2-4 (E) | `training/track-logger.tsx:145` | Borrar serie `size-8` (32 px). | `max-md:size-11`. |
| P2-5 (E) | `training/rest-timer.tsx:198,219` | Pausa/reanudar y otro icono `size-8`. Es el control que se toca con las manos sudadas entre series. | `max-md:size-11`. |
| P2-6 (E) | `training/rest-timer.tsx:168` | Botones de preajuste `<button>` nativos en un `overflow-x-auto`: sin comprobar altura. | Medir con sesión activa; subir a `min-h-11` si < 44. |
| P2-7 (E) | `training/technical-logger.tsx:224-246,257` | «Nulo» `h-10` (40 px); estrellas de valoración `p-1` + `size-5` ≈ **28 px**; viento `h-8` (32 px). | `h-10 max-md:h-11`; estrellas con `p-2.5` (≥ 44) o `min-size-11`; viento `max-md:h-11`. |
| P2-8 (E) | `training/equipment.tsx:122` | Input «+usos» `h-8 w-20`. | `max-md:h-11`. |
| P2-9 (E) | `training/coach-library.tsx:27` | Botón copiar `h-6` (24 px) con `size="sm"`; `className` anula `max-md:h-11`. | Quitar `h-6`. |
| P2-10 (E) | `training/season-goals.tsx:38` | «✕» quitar objetivo sin padding: ≈ 16–20 px. | `size-11` con área clicable (o `Button size="icon"`). |
| P2-11 (E) | `training/minimums.tsx:58` y `comment-thread.tsx:61` | Enlaces-botón «borrar» solo texto `text-xs`. | `min-h-11 px-2` o `Button variant="link"`. |
| P2-12 (E) | `training/exercises/page.tsx:38` | «Buscar» `<button>` nativo sin altura (≈ 36 px) junto a un `Input` de 44. | Usar `<Button>`. |
| P2-13 (E) | `training/strength-logger.tsx:92,188,233`, `rm-manager.tsx:75`, `template-chips.tsx:27`, `prehab.tsx:69` | `<button>` nativos sin altura mínima declarada. | Medir con datos; unificar con `Button`/`min-h-11`. |

### P3 — consistencia, duplicidad, rendimiento
| ID | Dónde | Evidencia | Propuesta |
|---|---|---|---|
| P3-1 (E) | `training/[id]/page.tsx:158,307` | De 3 tablas, solo la de `:200` va dentro de `overflow-x-auto`; las de `:158` y `:307` no (si `:158` está en un `Card` con `overflow-x-auto` ya lo cubre, **no verificado**). | Envolver en `overflow-x-auto` o confirmar contenedor. |
| P3-2 (E) | `training/pmc-charts.tsx:184` | Tabla de datos sin `overflow-x-auto`. | Envolver. |
| P3-3 (E) | Rejillas `grid-cols-3` sin prefijo: `[id]/page.tsx:100,297`, `technical-logger.tsx:185`, `minimums.tsx:37`, `import-activity.tsx:79` | A 390 px dan ~110 px por columna; riesgo de recorte con cifras largas o texto en español. `week-strip` (7 col.) ya está verificada a ≥ 44 px. | Revisar visualmente con datos; `grid-cols-2 sm:grid-cols-3` si se aprieta. |
| P3-4 (E) | 14 casillas `<input type="checkbox" className="size-4">` (`app-preferences.tsx:42,70,83`, `coach-report.tsx:64`, `calendar-feed.tsx:73`, `session-form.tsx:280,285`, `test-form.tsx:63`, `rm-manager.tsx:114`, `welcome-wizard.tsx:112`…) | Caja de 16 px; el área real depende de que el `<label>` envuelva con altura ≥ 44. No medido (el barrido v22b excluye checkbox). | Medir la altura del `label` y, si < 44, `min-h-11` en el contenedor; valorar un `Checkbox` común. |
| P3-5 | `delete-curve.tsx` / `delete-session-button.tsx` | 30/32 líneas casi iguales (confirm → DELETE → refresh). Difieren en mensaje, papelera y redirección. | Ahorro bajo (~25 líneas): **no recomiendo** refactorizar; solo si aparece un 3.º borrado. |
| P3-6 | `value-chart.tsx` (30), `marks-chart.tsx` (54), `e1rm-chart.tsx` (43) | Estructura parecida de recharts. No se leyó en detalle. | Descartado hasta confirmar; riesgo > beneficio. |
| P3-7 | `lazy.tsx` | Los huecos `Hold` ya evitan saltos de maquetación (bien resuelto). Sin `loading.tsx` en rutas: la navegación no muestra esqueleto. | Medir TTFB a 390 px antes de tocar nada (objetivo 3 de v2.3). |
| P3-8 | `settings/server-status.tsx:8` exporta `shortWhen` mientras `lib/format.ts` agrupa formateadores | Helper de fecha fuera de su sitio. | Mover a `lib/format.ts` (mecánico, sin lógica). |

Leyenda: (M) medido en navegador · (E) estático, pendiente de confirmar con datos.

## Lo que está bien (no tocar)
`Button`/`Select`/`Tabs`/`Switch` ya garantizan 44 px en móvil; `Switch` amplía el área con `after:-inset-y-3`; tablas principales con `overflow-x-auto`; `week-strip` ≥ 44×44 (probado en v22b); `Hold` en gráficas; cero scroll horizontal en las 19 rutas.

## Propuesta de bloques (a confirmar)
1. **v2.3-A (pequeño, mecánico, sin lógica):** P2-1…P2-12 + P1-1 + `e2e:v22b` ampliado para medir con sesión rellena. Una clase CSS por sitio; unas 15 líneas tocadas.
2. **v2.3-B (medir primero):** P2-13, P3-1…P3-4 con una sesión sintética completa (fuerza, técnica, pista) y barrido táctil sobre ella.
3. **Descartar:** P3-5, P3-6 (refactorización sin beneficio claro).

**Decisión que necesito:** ¿apruebas v2.3-A tal cual, o primero amplío la medición con datos sintéticos (B) para convertir los «E» en «M»?
