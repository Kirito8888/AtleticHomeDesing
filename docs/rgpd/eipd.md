# Evaluación de impacto (EIPD, art. 35 RGPD) — plantilla

## 1. Descripción del tratamiento
Atlenza en un servidor propio: registro de entrenamiento, salud (incluido el ciclo menstrual), estudio y finanzas de sus usuarios. [Número de usuarios previsto, quiénes son.]

## 2. Necesidad y proporcionalidad
- **Minimización:**
  - la salud solo se guarda si la persona la activa;
  - a la IA va un resumen numérico sin identificar;
  - el entrenador/a ve solo los ámbitos permitidos.
- **Conservación:** plazos por defecto en `src/lib/privacy/retention.ts`, configurables.
- **Derechos:** atendidos desde la app (Ajustes → Privacidad y derechos), incluida la limitación.

## 3. Riesgos y medidas
| Riesgo | Probabilidad / impacto | Medidas |
|---|---|---|
| Acceso no autorizado a la cuenta | Media / alto | Argon2id, 2FA, llaves de acceso, bloqueo, alertas push, cierre de sesiones |
| Robo de la base de datos | Baja / muy alto | Salud cifrada con clave fuera de la BD, BD solo en localhost, copias cifradas, rotación de claves |
| Alteración del registro de actividad | Baja / medio | Cadena HMAC verificable en Ajustes |
| Filtración por enlaces compartidos | Media / alto | Token de 32 bytes con hash, caducidad de 7 días, revocables, bloqueados con la limitación |
| Transferencia a Google (IA) | — / medio | Consentimiento previo y revocable, datos sin identificar, nunca salud |
| Caída o pérdida de datos | Media / alto | Copias diarias verificadas, mensuales, copia fuera del servidor (opcional) |
| Vulnerabilidades de software | Media / alto | `npm audit`, Semgrep y Trivy en la CI; imágenes fijadas por versión; contenedores sin privilegios |

## 4. Riesgo residual y decisión
[Valoración y firma. Si el riesgo residual es alto, consulta previa a la AEPD (art. 36).]
