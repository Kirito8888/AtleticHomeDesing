# Migración técnica de v2.6 a v2.7

> **Estado: cerrada (v2.7.0, 06/11/2026).** Recoge lo necesario para actualizar el servidor desde v2.6.
> Marcadores: `<RUTA_DE_LA_APP>` es el directorio del repositorio en el servidor; `dc` es `docker compose --env-file .env.production`; `IP_DEL_SERVIDOR_IA` es el equipo de la red local que sirve la IA.

**Migraciones:** ninguna. La última sigue siendo `20270602080000_v2_6_study_pack`.
**Dependencias nuevas:** `mammoth` (apuntes DOCX) y `sharp` declarada de forma explícita (ya venía con Next; la imagen la incluye con sus binarios). Se instalan al reconstruir la imagen.
**Variables nuevas (todas opcionales, solo servidor):**

| Variable | Para qué |
|---|---|
| `LOCAL_AI_BASE_URL` | Servidor de IA local compatible con OpenAI (p. ej. `http://IP_DEL_SERVIDOR_IA:8080/v1`). Si existe, se usa primero. |
| `LOCAL_AI_KEY`, `LOCAL_AI_MODEL` | Clave y modelo de ese servidor, si los pide. |
| `LOCAL_AI_TIMEOUT_MS` | Tiempo máximo por petición al local (por defecto en `.env.example`: 300000). |
| `LOCAL_AI_ONLY` | `true` = nunca otro proveedor (ni la clave guardada ni `GEMINI_API_KEY`) y sin embeddings. Por defecto `false`. |

## 1. Actualizar

Como en cualquier versión (`manual_docker_debian.md` § 8):

```bash
cd <RUTA_DE_LA_APP>
./scripts/update.sh
```

Si añades o cambias variables `LOCAL_AI_*` en `.env.production`, el contenedor solo las lee al recrearlo:

```bash
dc up -d --force-recreate web
```

## 2. Comprobar

1. *Estado del servidor* (Ajustes, administración) muestra la versión 2.7.0 y ninguna migración pendiente.
2. Con IA local: tras usar una función de IA (p. ej. Resumir en Estudio), en los registros aparece `ia: proveedor local`:

   ```bash
   dc logs web --since 10m | grep "ia:"
   ```

3. Con `LOCAL_AI_ONLY=true`: **Ajustes → IA** indica «solo IA local» y una IA guardada aparece como «guardada, sin uso».
4. Estudio admite subir un `.docx`.

## Cambios de comportamiento a tener en cuenta

- Un corte por tiempo de la IA da **504 `ai_timeout`** y ya no se reintenta.
- Importar un extracto bancario es atómico: si una línea falla, no entra ninguna.
- Tras importar de Strava, CTL/ATL/TSB pueden diferir en 0,01 respecto a v2.6 (sin redondeo intermedio; igual que un recálculo completo).
- El paquete de tema puede quedar en cola hasta 2 h (antes 60 min).
