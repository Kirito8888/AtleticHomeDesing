# Registro de actividades de tratamiento (art. 30 RGPD)

**Responsable:** [nombre] · [NIF] · [dirección] · [email]
**Delegado de protección de datos:** no obligatorio para una persona física sin tratamiento a gran escala.

| Actividad | Finalidad | Base jurídica | Categorías de interesados y de datos | Destinatarios | Transferencias internacionales | Plazo | Medidas de seguridad |
|---|---|---|---|---|---|---|---|
| Cuentas de usuario | Acceso a la app | 6.1.b (servicio solicitado) | Usuarios: nombre, email, hash de la contraseña, llaves de acceso (clave pública) | Ninguno | No | Mientras exista la cuenta | Argon2id, 2FA, llaves de acceso, bloqueo por intentos, límite por IP |
| Entrenamiento y recuperación | Registro y análisis del rendimiento | 6.1.b | Usuarios: sesiones, marcas, carga, sueño, VFC, molestias | Entrenador/a con permiso por ámbito | No | Mientras exista la cuenta | Permisos por ámbito, auditoría |
| Salud de la mujer y ciclo | Avisos y patrones | 9.2.a (consentimiento explícito) | Usuarias: ciclo, síntomas, analíticas, cribados | Nadie (ni IA ni entrenador/a); enlaces temporales que crea la propia usuaria | No | Hasta que los borre | Cifrado AES-256-GCM, fuera de la IA y del `.ics` |
| Astras AI | Respuestas sobre apuntes y datos | 6.1.a (consentimiento) | Usuarios: apuntes, preguntas, resumen numérico sin identificar | Google (Gemini) como encargado | Sí: EE. UU. (Marco de Privacidad de Datos y cláusulas contractuales tipo) | Lo que retenga Google según su contrato | Consentimiento previo y revocable; sin nombre ni salud |
| «Entreno sola» | Avisar a un contacto si no llega | 6.1.a | Usuarias y su contacto: hora de salida y vuelta, nota y ubicación opcional | El contacto aceptado | No | Salidas: 90 días | Cifrado, vínculo aceptado por ambas partes |
| Seguridad | Proteger las cuentas | 6.1.f y art. 32 | IP, navegador, eventos | Nadie | No | 180 días | Registro encadenado con HMAC |
| Copias de seguridad | Disponibilidad | 6.1.f y art. 32 | Todo lo anterior | [destino de la copia externa, si hay] | [No / Sí] | 14 días + 12 mensuales | Cifradas con `age`, restauración probada a diario |
