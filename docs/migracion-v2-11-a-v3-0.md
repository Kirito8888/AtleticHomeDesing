# Migración técnica de v2.11 a v3.0.0-preview

> **Estado: cerrada (v3.0.0-preview, 18/11/2026).** Recoge lo necesario para actualizar el servidor desde v2.11.
> Marcadores: `<RUTA_DE_LA_APP>` es el directorio del repositorio en el servidor; `dc` es `docker compose --env-file .env.production`.

**Migraciones:** ninguna. La última sigue siendo `20270701080000_v2_9_features` (`git diff -- prisma` vacío desde v2.11.0).
**Dependencias nuevas:** ninguna de aplicación.
**Variables nuevas:** `STAFF_2FA_REQUIRED_FROM` (ahora **crítica** para `doctor.sh`) y `TRUSTED_PROXY_HOPS`. `AUTH_SECRET` pasa a ser **obligatoria** en producción (sin ella la web no arranca).
**Qué es «preview»:** el núcleo de v3.0 (seguridad, accesibilidad, diseño y «Hoy», avisos de autoría) más macros por tipo de sesión e importación de historial. El tramo de rediseño de verticales (bloques I–Q de `docs/roadmap-v3-0.md`) queda para v3.1 o una preview posterior.

## 1. Antes de actualizar: el `.env.production`

```bash
cd <RUTA_DE_LA_APP>
grep -c '^AUTH_SECRET=.\+' .env.production      # debe dar 1
grep -n '^STAFF_2FA_REQUIRED_FROM\|^TRUSTED_PROXY_HOPS' .env.production
```

1. `AUTH_SECRET` con valor (`openssl rand -base64 32` solo si estuviera vacía; si ya tenía valor, **no la cambies**: cerraría las sesiones).
2. `TRUSTED_PROXY_HOPS=1` si hay un proxy (Caddy, NPM, nginx) delante de la web; `0` si no lo hay. Con `WEB_BIND=0.0.0.0` y proxies de confianza, `doctor.sh` avisa.
3. `STAFF_2FA_REQUIRED_FROM=AAAA-MM-DD`: fecha de corte desde la que ADMIN y COACH necesitan 2FA o llave de acceso. **Antes de esa fecha solo se les avisa**: elige una fecha futura, avisa a las cuentas de entrenadora y que anoten sus códigos de recuperación. Vacía = nunca se exige y `doctor.sh --env` da ERROR (clave crítica).

## 2. Actualizar

```bash
./scripts/update.sh
bash scripts/ops/doctor.sh --all
```

`update.sh` no ejecuta el doctor. Sin probar en el servidor real.

## 3. Comprobar

- *Estado del servidor* muestra 3.0.0-preview, `/api/health` ok y sin migraciones pendientes. `doctor.sh` sin ERROR (esperadas: `/legal/accesibilidad` pública, `/api/coach/recovery-consent` y `/api/training/history-import/template` en 401 sin sesión).
- Todas las cuentas ven la **re-aceptación de condiciones** (`TERMS_VERSION` 2026-11-14, edad mínima 14 años).
- **Recuperación con entrenadora o club:** los vínculos existentes quedan cerrados hasta que cada atleta pulse «Confirmar» o «Quitar ese permiso» en el aviso de Hoy o de Ajustes.
- Una cuenta ADMIN/COACH sin 2FA ve el aviso con los días restantes; pasada la fecha solo puede configurarla.
- El service worker conserva `lifeos-v4`; las copias privadas caducan a las 24 h y se purgan con 401. Si algo se ve viejo, recargar una vez.
- «Hoy» (`/`): acción principal con su «Por qué» y registro rápido; Ajustes → «Barra inferior (móvil)».
- Nutrición: reglas de macros por tipo de sesión y día de la semana (los hidratos antiguos siguen valiendo mientras no definas reglas). Entreno: importar historial Excel/CSV.
- `/legal/accesibilidad`: declaración «parcialmente conforme». **La prueba con lector de pantalla (V3-A11) sigue pendiente de la usuaria**; checklist en `docs/auditoria-v3-0.md` § 5.

## 4. Marcha atrás

Sin cambios de esquema: volver a la imagen de v2.11.0 con `update.sh` no toca la base de datos. Las preferencias nuevas (`macroRules`, `mobileBar`, objetivos por fecha) viven en el JSON de prefs y las versiones anteriores las ignoran. Con la imagen antigua, `STAFF_2FA_REQUIRED_FROM` y `TRUSTED_PROXY_HOPS` se ignoran.
