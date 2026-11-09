# Migración técnica de v2.7 a v2.8

> **Estado: cerrada (v2.8.0, 09/11/2026).** Recoge lo necesario para actualizar el servidor desde v2.7.
> Marcadores: `<RUTA_DE_LA_APP>` es el directorio del repositorio en el servidor; `dc` es `docker compose --env-file .env.production`.

**Migraciones:** ninguna. La última sigue siendo `20270602080000_v2_6_study_pack`.
**Dependencias nuevas:** ninguna.
**Variables nuevas:** ninguna.

## 1. Actualizar

Como en cualquier versión (`manual_docker_debian.md` § 8):

```bash
cd <RUTA_DE_LA_APP>
./scripts/update.sh
```

## 2. Comprobar

- *Estado del servidor* muestra la versión 2.8.0, `/api/health` responde ok y las migraciones están al día (sin pendientes).
- En `/study`, subir un apunte y ver que pasa a «Listo» sin repintar la página entera.
- Resumir: editar el texto antes de guardar; «Crear flashcards»: elegir mazo y ver nuevas/duplicadas.
- Modo Juego: «Reiniciar partida» pide confirmación y «Cómo se juega» abre el tutorial.

## 3. Marcha atrás

Sin cambios de esquema: volver a la imagen anterior (`update.sh` con la etiqueta de v2.7.0) no requiere tocar la base de datos.
