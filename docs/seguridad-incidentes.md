# Plan de respuesta a incidentes de seguridad

Qué hacer si sospechas que alguien ha entrado en LifeOS o en el servidor, o que se han filtrado datos. Está pensado para una instalación personal en un Debian con Docker.

> **Marco legal.** Mientras la app la uses solo tú, te cubre la exención doméstica del RGPD (art. 2.2.c), y la obligación de notificar no se aplica.
>
> En cuanto otras personas tengan cuenta con datos reales, eres **responsable del tratamiento**. Entonces una brecha que suponga un riesgo para ellas se notifica a la AEPD **en 72 horas** (art. 33 RGPD). Si el riesgo es alto, se comunica también a las afectadas (art. 34).
>
> Las cuentas de prueba con datos inventados no cuentan.

## 1. Detectar
Señales que da la propia app:
- **Alertas push:** inicio de sesión nuevo, cuenta bloqueada, contraseña, email, 2FA o llaves cambiados, datos descargados y enlaces para compartir creados.
- **Ajustes → Actividad reciente:** IPs y navegadores, y si la **cadena de auditoría** está íntegra. Si sale rota, alguien ha tocado la base de datos.
- **Ajustes → Estado del servidor:** última copia, migraciones y espacio.
- **En el servidor:**
  - `docker compose --env-file .env.production logs --since 24h web | grep -i "login fallido\|error"`;
  - `sudo fail2ban-client status lifeos`.

## 2. Contener (en los primeros minutos)
1. **Corta el acceso desde fuera** sin borrar nada:
   - para el proxy (`sudo systemctl stop caddy` o el contenedor de Nginx Proxy Manager);
   - o deja la web solo para Tailscale.
2. **Guarda las pruebas antes de tocar nada:**
   ```bash
   cd /opt/lifeos
   mkdir -p ~/incidente-$(date +%F)
   docker compose --env-file .env.production logs --no-color > ~/incidente-$(date +%F)/logs.txt
   docker compose --env-file .env.production exec -T db pg_dump -U lifeos -d lifeos -Fc > ~/incidente-$(date +%F)/bd.dump
   ```
   La copia de la BD contiene datos personales: guárdala cifrada (`age`) y bórrala cuando termines.
3. **Cierra todas las sesiones:** Ajustes → «Cerrar sesión en todos los dispositivos», o en el servidor `npm run user -- reset-password tu@correo` desde el contenedor `migrate`.

## 3. Erradicar
- **Cambia todos los secretos de `.env.production`:**
  - `AUTH_SECRET`: invalida todas las sesiones;
  - contraseña de PostgreSQL;
  - claves VAPID.
- **Claves de cifrado** (`DATA_ENCRYPTION_KEY`, `TOTP_ENCRYPTION_KEY`): **rótalas**, nunca las sustituyas sin más, o perderás los datos cifrados.
  1. Mueve la actual a `*_PREVIOUS` y pon una nueva.
  2. `dc up -d web`.
  3. Estado del servidor → «Volver a cifrar».
  4. Quita las `*_PREVIOUS`.
- **Revisa** usuarios (`npm run user -- list`), llaves de acceso, vínculos de entrenador y contactos de «Entreno sola».
- **Actualiza** el sistema (`sudo apt update && sudo apt upgrade`), Docker y LifeOS (`./scripts/update.sh`).

## 4. Recuperar
- Si dudas de la integridad de la BD, restaura la última copia buena (manual § 8 «Restaurar»). Las copias van cifradas con `age` y se prueban cada día.
- Vuelve a abrir el acceso desde fuera y vigila los avisos unos días.

## 5. Notificar (solo si hay datos de otras personas)
- **AEPD:**
  - sede electrónica → «Notificación de brechas de datos personales», en 72 h desde que lo sabes;
  - si aún no tienes toda la información, notifica lo que sepas y completa después (art. 33.4).
- **Personas afectadas** (si el riesgo es alto, art. 34): qué ha pasado, qué datos, qué has hecho y qué deben hacer (cambiar la contraseña, vigilar el phishing).
- **Ayuda:** INCIBE ofrece la línea gratuita **017** para incidentes de ciberseguridad.

### Plantilla de notificación
```
Fecha y hora en que se detectó: …
Qué ha pasado (acceso no autorizado / pérdida / filtración): …
Datos afectados (categorías, ¿datos de salud?): …
Personas afectadas (número aproximado): …
Consecuencias probables: …
Medidas tomadas y previstas: …
Contacto: …
```

## 6. Aprender
Escribe qué pasó, cómo entró y qué cambias para que no se repita. Guárdalo con las pruebas (cifrado) al menos el tiempo que exija la AEPD si hubo notificación. El registro de brechas es obligatorio aunque no notifiques (art. 33.5).
