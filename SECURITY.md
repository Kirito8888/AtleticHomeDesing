# Seguridad

Atlenza guarda datos de salud, entrenamiento, finanzas y apuntes. El código es **público**; los datos, nunca.

## Avisar de una vulnerabilidad

**No abras un issue público.** Usa el aviso privado de GitHub: pestaña **Security → Report a vulnerability** de este repositorio. Incluye:
- qué afecta (ruta, componente, versión o commit);
- cómo reproducirlo, con datos inventados;
- qué impacto crees que tiene.

Respondo en cuanto pueda; es un proyecto personal sin plazos garantizados. Si el fallo es real, se corrige primero en una rama privada y se publica después, junto con la versión que lo arregla.

## Qué está dentro y fuera del alcance

**Dentro:**
- la app (`src/`), la API (`src/app/api/`);
- el esquema y las migraciones (`prisma/`);
- el despliegue (`docker-compose.yml`, `Dockerfile`, `deploy/`, `scripts/`).

**Fuera:**
- ataques que requieren acceso de administrador al servidor o a la BD;
- denegación de servicio por volumen;
- fallos de servicios de terceros (Gemini, OpenFoodFacts, servicios push), salvo que Atlenza los use de forma insegura.

## Medidas que ya existen

**Acceso**
- Registro cerrado por defecto, con límites de intentos por IP y por cuenta, y bloqueo temporal.
- 2FA TOTP opcional, con anti-reutilización y códigos de recuperación de un solo uso.
- Sesiones revocables: cambiar la contraseña invalida los tokens ya emitidos.
- Logs de logins fallidos para fail2ban.

**Navegador**
- CSP con nonce por petición, HSTS y cabeceras de aislamiento.
- El service worker no guarda en caché las páginas privadas y se vacía al cerrar sesión.

**Datos**
- Secretos 2FA cifrados (AES-256-GCM).
- Copias de seguridad cifradas con la clave pública de `age`: el servidor no puede leerlas.
- La IA está desactivada hasta que el usuario da su consentimiento; las lesiones nunca se envían a la IA.

**Entradas**
- Subidas validadas por contenido, no por extensión.
- Zip con límites anti zip bomb.
- XML sin entidades.
- Push solo a dominios de servicios push conocidos (anti-SSRF).

**Desarrollo**
- CI con `npm audit`, reglas Semgrep propias (bloqueantes) y un test que falla si una ruta `/api` no exige sesión.
- Dependabot semanal.

## Datos personales y este repositorio

- **Ninguna credencial en el repositorio.** Todo va por variables de entorno (`.env.production`, `.env.local`; ver `.env.example`), y esos ficheros están en `.gitignore`.
- **Ningún dato personal real** en el código, los tests, los fixtures, las capturas ni los issues: ni planes de entrenamiento, ni métricas de salud, ni extractos bancarios. Los tests generan datos sintéticos.
- Si encuentras un dato personal o un secreto en el historial, avisa por el canal privado de arriba. Se rota el secreto y se limpia el historial.
