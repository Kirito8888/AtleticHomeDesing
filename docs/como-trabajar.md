# Cómo pedir trabajo a Claude gastando pocos tokens (web de Claude Code)

**Idea clave:** una sesión nueva por bloque. El contexto vive en el repo (`docs/estado.md`, `CLAUDE.md`), no en la conversación.
Cuanto más larga es una sesión, más cuesta cada mensaje (se relee todo) y más se pierde al compactarse.

## Pasos en claude.ai/code
1. **Sesión nueva** desde la barra lateral, repo `AtleticHomeDesing` (en la web no existe `/clear`: sesión nueva = empezar limpio).
2. **Modo Plan** en el desplegable junto al cuadro de texto (móvil: **+** → **Permission** → **Plan**).
3. **Primer mensaje, solo:** `/model opus` (en la web `/model` siempre lleva el nombre; `opusplan` no consta que funcione).
4. **Segundo mensaje: el encargo** (plantilla abajo). Claude lee los dos ficheros y propone un plan corto. Lo apruebas.
5. **Justo después de aprobar:** `/model sonnet` y cambia el desplegable a **Auto** (o **Accept edits**). Sonnet implementa.
6. **Si se atasca** (falla dos veces o es un problema de diseño): `/model opus`; resuelto, vuelve a `/model sonnet`.
7. **Al terminar** («bloque subido»): cierra la sesión. El siguiente bloque, sesión nueva.

Consejo: `/context` dice cuánto lleva la sesión; si pasa de la mitad, que cierre el bloque y abre otra.

## Ejemplo completo (bloque A de la v2.0)
```
/model opus
```
```
Lee docs/estado.md y CLAUDE.md. Haz la v2.0 bloque A (clubes y cuotas internas).
Decisiones: una atleta puede estar en varios clubes; las cuotas solo se apuntan, no se cobran.
Terminado = puedo crear un club, invitar a una entrenadora y dos atletas, ver el panel del club y apuntar una cuota.
No me preguntes salvo bloqueo. Al acabar: commit, push y actualiza docs/estado.md.
```
(apruebas el plan)
```
/model sonnet
```

## Plantillas
- **Siguiente bloque:** `Lee docs/estado.md y sigue con el bloque que toque. No me preguntes salvo bloqueo.`
- **Cierre de versión** (con `/model opus`, migración y PR): `Lee docs/estado.md. Cierre de la v2.0: todas las E2E, prueba de la migración, documentación y PR.`
- **Arreglo pequeño** (sin plan, modo Auto, `/model sonnet`): `Lee CLAUDE.md. En /nutrition/micros el calcio sale con 3 decimales; déjalo en entero. Commit y push.`
- **Revisar un fallo de la CI:** `Lee CLAUDE.md. La CI del PR #N falla en <job>; arréglalo con el mínimo cambio.`

## Qué modelo
| Tarea | Modelo |
|---|---|
| Diseñar: esquema de BD, permisos, seguridad, migraciones con datos | Opus |
| Implementar un plan aprobado, pantallas, tests, textos, documentación | Sonnet |
| Atasco que no sale al segundo intento | Opus, y luego vuelta a Sonnet |

## Qué no hacer (es lo que más gasta)
- Seguir en una sesión que ya se ha compactado o encadenar varias versiones en la misma sesión.
- Reabrir el modo plan a mitad de un bloque (cada vez se reenvía el plan entero).
- Pedir versiones de 10 o más funcionalidades: mejor 3–4 por bloque.
- Dar las decisiones a medias: si las pones en el primer mensaje, no hay rondas de preguntas.
