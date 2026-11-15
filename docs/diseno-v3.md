# Diseño v3 · principios, inventario y mapa de destinos

> Bloque G de v3.0 (15/11/2026). Fuente: `docs/auditoria-v3-0.md` (V3-D01, V3-D02, V3-D03, V3-A07) y `docs/roadmap-v3-0.md`.
> Validación (Puerta 0.4): la usuaria y las suites automáticas (`e2e:v30g`, `e2e:a11y`), sin pruebas externas.
> Lo que este documento **no** cambia: los tokens OKLCH (`src/app/globals.css`), el esquema y las rutas.

## 1. Los cinco principios (V3-D03)

Cada principio lleva una regla que se puede comprobar en una revisión. Los bloques H–O los aplican pantalla a pantalla.

| # | Principio | Regla comprobable | Ya existe así | Falta (bloque) |
|---|---|---|---|---|
| 1 | **Una acción principal por pantalla** | Como mucho un `Button` de variante por defecto (relleno) por pantalla, normalmente en `PageHeader action`; el resto, `outline`/`ghost` o enlace | Entreno (`+ Sesión`), Estudio (tras G ya no lleva «Crear plan» ni «Pregunta a tus datos» en su cabecera) | Panel de inicio (H), Finanzas (M), Nutrición (K) |
| 2 | **Detalle bajo demanda** | Lo secundario va plegado (`<details>`, pestañas, hoja) o en la pantalla hija; la primera vista cabe en 390 × 844 sin desplazarse para lo principal | Pestañas de Estudio, «Más» del móvil | Sesión y rendimiento (I), recuperación (J) |
| 3 | **Borrador → aceptar en todo** | Nada escribe en el plan, los datos de salud o el presupuesto sin un paso explícito de aceptación; el borrador se ve igual en todas las verticales | `ai-plan-actions`, `plan-versions`, `manual-plan`, `multi-plan`, `routine-wizard`, `voice-session`, `food-ai`, `route-plan` | Un componente común de borrador (I–O, cuando se toque cada vertical) |
| 4 | **Estados vacíos que enseñan** | Una pantalla sin datos usa `EmptyState` con qué es, por qué sirve y el primer paso (un enlace o botón) | `EmptyState` en las listas | «Hoy» (H) y cada vertical (I–O) |
| 5 | **Modo foco** | Lo que la usuaria oculta en Ajustes → Módulos (`prefs.hiddenModules`) desaparece del menú, de la barra y del panel; nunca se borra nada | `buildNav`, panel, bienvenida | La barra móvil también lo respeta desde G |

**Marca de IA.** La IA no es un destino: se presenta donde actúa con `AiBadge` (`src/components/ai/ai-badge.tsx`, icono + texto «IA», nunca solo color). Todo lo que produce la IA sigue el principio 3.

## 2. Tokens (se conservan)

Los tokens OKLCH de `globals.css` no cambian en v3.0 G: `--background`, `--foreground`, `--card`, `--popover`, `--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`, `--chart-*`, `--series-*`, `--status-good|warning|serious|critical`, `--radius*`, más `.hc` (contraste alto) y `.dark`. Escala de texto: `text-2xs` (0,6875 rem) como mínimo, todo en rem (`fontScale`).

- El contraste lo vigila `npm run a11y:contrast` (CI). Sin cambios en G.
- **Deuda visual abierta** (excepciones de F, no se tocan aquí porque sería rediseñar tokens): borde `--input` fuera de `.hc` (1,3–1,6:1), `--status-warning/serious` y `--chart-4/5` en claro. Siempre van con texto, icono o leyenda. Se revisan al rediseñar cada vertical (I–O) o en un bloque de tokens propio si la usuaria lo decide.
- **Foco (G):** `:focus-visible` dibuja un contorno sólido de 2 px con `--ring` (≥ 3:1) para todo lo que no trae su propio anillo (`focus-visible:ring-*` de `ui/button`, `ui/input`…). El panel de pestañas (`ui/tabs` `TabsContent`) ya no lleva `outline-none`. El mapa corporal marca el foco engrosando el trazo con `--ring`.

## 3. Inventario de componentes

### 3.1 Base (`src/components/ui`, 15)
`alert-dialog`, `badge`, `button`, `card`, `confirm-dialog`, `input`, `label`, `progress`, `select`, `sheet` (hoja inferior/lateral), `skeleton`, `sonner` (avisos), `switch`, `tabs`, `textarea`.

### 3.2 Compartidos (`src/components/*.tsx` y `form/`)
| Componente | Para qué | Principio |
|---|---|---|
| `PageHeader` | Título, descripción y **la** acción principal | 1 |
| `EmptyState` | Estado vacío con icono, texto y acción | 4 |
| `StatusLabel` (`status.tsx`) | Estado con icono + texto (nunca solo color) | — |
| `Stat` | Número con etiqueta | 2 |
| `form/chips` (`Chips`, `MultiChips`, `Field`) | Elegir sin escribir; etiqueta visible | — |
| `form/stepper`, `form/body-map` | Números y zonas con dedo y teclado | — |
| `ai/ai-badge` (nuevo en G) | Marca de «aquí actúa la IA» | 3 |
| `layout/app-nav`, `layout/nav-items` | Barra lateral, barra inferior y «Más» | 5 |
| `layout/focus-guard` (nuevo en G) | Foco nunca tapado por barras fijas | — |
| `route-error`, `sw-register`, `theme-toggle`, `print-button`, `ocr-fill`, `offline-day-cache`, `zone-refresh` | Utilidades transversales | — |

### 3.3 Por vertical (ficheros `.tsx`, sin tests)
| Carpeta | Nº | Carpeta | Nº |
|---|---|---|---|
| `training` | 38 | `study` | 32 |
| `settings` | 22 | `nutrition` | 14 |
| `finance` | 13 | `recovery` | 12 |
| `competition` | 7 | `layout` | 6 |
| `planning` | 5 | `admin`, `ai-plan`, `coach`, `offline`, `routine`, `form` | 3 c/u |
| `ai`, `goals`, `legal`, `wellbeing` | 2 c/u | `charts`, `clubs`, `health`, `privacy`, `rules`, `share` | 1 c/u |

Las carpetas grandes (`training`, `study`) son las que más pantallas hijas generan y donde más rinde aplicar los principios 1 y 2 (bloques I y N).

## 4. Navegación por intención (V3-D01)

`NAV_GROUPS` (`src/components/layout/nav-items.ts`) agrupa por **lo que se quiere hacer**, igual en la barra lateral y en «Más»:

| Grupo | Destinos |
|---|---|
| Entrenar | Entreno, Plan, Objetivos |
| Cuidarme | Salud, Nutrición |
| Organizarme | Estudio, Finanzas |
| Con otras personas | Clubes, Mis atletas (entrenadora/administración) |
| Configuración | Ajustes, Privacidad, Notificaciones, Administración, Acerca de |

**Barra inferior del móvil:** Inicio + 3 destinos + «Más» (5 huecos, ≥ 44 px).
- **Elegida** (`prefs.mobileBar`, JSON de prefs, sin esquema nuevo): Ajustes → «Barra inferior (móvil)», 3 huecos sin repetir; «Volver a la sugerida por el uso» la deja en `null`.
- **Sugerida** (`mobileBar = null`, con «Contar qué páginas abro» activado): `suggestBar` toma las visitas de 8 semanas (`UsageBeacon` → `PageUsage`, `usageByPath`), elige los 3 destinos más abiertos con al menos `BAR_USAGE_MIN` (5) visitas, contando rutas hijas, y los **ordena por la posición por defecto** para que la barra no cambie de orden de una semana a otra. Si no hay uso: Entreno, Plan, Salud (lo de siempre).
- Candidatos: todo menos Configuración, filtrado por módulos ocultos y rol. Lo guardado que deje de ser válido se ignora y el hueco se rellena con el orden por defecto.
- Resultado: si la usuaria usa Estudio y Finanzas, están a **1 toque**.

## 5. Mapa tarea → destino

| Tarea de la usuaria | Hoy (tras G) | Destino v3 | Bloque |
|---|---|---|---|
| Ver qué toca hoy | Inicio (panel) | «Hoy»: portada accionable | H |
| Registrar una sesión | Entreno → `+ Sesión` (`/training/new`) | Igual, y desde «Hoy» en 1–2 toques | H, I |
| Preguntar a mis datos de entreno (IA) | Entreno → «Con IA» → `/study/ask` | Ruta propia en Entreno | I |
| Coach de rendimiento (IA) | Entreno → «Con IA» → `/study?tab=coach` | Pestaña en Rendimiento | I |
| Crear plan con IA | Plan → «Créalo con IA» (y Entreno → «Con IA») → `/study/plan` | Ruta propia en Plan | I/O |
| Ver/editar el plan | Plan (`/planning`) | Igual, con los principios 1–3 | O |
| Recuperación, sueño, VFC | Salud (`/recovery`) | Igual | J |
| Comidas, agua | Nutrición | Igual; registro desde «Hoy» | H, K |
| Apuntes, repasos, horario, exámenes | **Estudio** (`/study`) | Igual, sin las piezas de entreno | N |
| Gastos y presupuestos | Finanzas | Igual; gasto desde «Hoy» | H, M |
| Clubes, atletas | Con otras personas | Igual | L |
| Ocultar lo que no uso | Ajustes → Módulos | Igual (principio 5) | — |
| Elegir la barra del móvil | Ajustes → Barra inferior | Igual | — |
| Activar o retirar la IA | Ajustes → IA / Privacidad (consentimiento «IA») | Igual | — |

Las rutas `/study/plan`, `/study/ask` y la pestaña «coach» siguen bajo `/study` en G (no se mueven rutas: `doctor.sh` y los enlaces externos no cambian). Se mueven al rediseñar su vertical.

## 6. Foco por teclado nunca tapado (V3-A07, WCAG 2.4.7 y 2.4.11)

- `globals.css`: en móvil (`< 48rem`) `scroll-padding-top` = cabecera y `scroll-padding-bottom` = barra inferior; si la pantalla tiene una barra de acción fija (`data-sticky-action`: «Guardar sesión», asistente del plan con IA) el margen inferior sube a la altura de las dos.
- `FocusGuard` (`layout/focus-guard.tsx`), montado en el layout: en cada `focusin` mide la cabecera, la barra inferior y las barras de acción pegadas abajo y, si el elemento enfocado queda debajo, desplaza lo justo (`obscuredShift`, con test). Dentro de hojas y diálogos no actúa (quedan por encima de las barras).
- `e2e:v30g` tabula 35 veces en Inicio, Entreno, Nueva sesión, Plan, Estudio, Finanzas y Ajustes (y la hoja «Más»): cada foco tiene contorno visible y no se solapa con ninguna barra.
- Queda abierta la excepción de axe `/training/new target-size` (los chips en reposo bajo «Guardar sesión»; no es el foco): pasa al **Bloque I**, que rediseña la barra de acción de la sesión.

## 7. Nombres (V3-D02)

- El destino `/study` se llama **Estudio** (menú, módulo, título de página). «Atlenza IA» deja de existir en la interfaz.
- El consentimiento se llama «IA (el proveedor que elijas)» (solo la etiqueta; el texto y su versión no cambian, así que no se pide de nuevo).
- **Pendiente legal:** la política `/legal/privacidad` y `docs/rgpd/registro-actividades.md` aún dicen «Atlenza IA». Cambiarlos obliga a subir `TERMS_VERSION`; se hará con la revisión del abogado.
