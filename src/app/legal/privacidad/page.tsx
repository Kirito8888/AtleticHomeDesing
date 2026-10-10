import { connection } from "next/server";

import { RETENTION_DEFAULTS, retentionDays } from "@/lib/privacy/retention";
import { controller } from "@/lib/privacy/legal";

export const metadata = { title: "Política de privacidad · LifeOS" };

/** v1.7 · Política de privacidad (arts. 13 y 14 RGPD; LOPDGDD). Los datos del responsable vienen del entorno. */
export default async function PrivacyPolicy() {
  await connection();
  const c = controller();
  const d = retentionDays(process.env);
  return (
    <article>
      <h1>Política de privacidad</h1>
      {!c.name ? (
        <p>
          Esta es una instalación personal de LifeOS. Mientras la use solo su titular para fines personales, el RGPD no se aplica (art. 2.2.c, exención doméstica). Si te han dado una cuenta, pide al titular sus datos de contacto: debe completarlos aquí.
        </p>
      ) : null}
      <h2>Responsable</h2>
      <p>
        {c.name ?? "Titular de esta instalación"}
        {c.nif ? ` · ${c.nif}` : ""}
        {c.address ? ` · ${c.address}` : ""}
        {c.email ? ` · ${c.email}` : ""}
      </p>
      <h2>Qué datos y para qué</h2>
      <ul>
        <li>Cuenta (nombre, email, contraseña cifrada con Argon2id): para que puedas entrar. Base: ejecución del servicio que pides (art. 6.1.b).</li>
        <li>Entrenamiento, recuperación, comidas, estudio y finanzas que anotas: para calcular tu carga, avisos y resúmenes. Base: art. 6.1.b.</li>
        <li>Datos de salud (ciclo, salud de la mujer, molestias): cifrados; solo con tu consentimiento explícito (art. 9.2.a), que retiras borrándolos.</li>
        <li>Registro de seguridad (IP y navegador de inicios de sesión y cambios): para proteger tu cuenta. Base: interés legítimo y obligación de seguridad (arts. 6.1.f y 32).</li>
        <li>Notificaciones push: solo si las activas.</li>
      </ul>
      <h2>Con quién se comparten</h2>
      <ul>
        <li>Nadie, salvo lo que tú decidas: tu entrenador/a (solo lo que marques, nunca salud ni finanzas), enlaces temporales que creas (médica, fisio, entrenadora) y tu contacto de «Entreno sola».</li>
        <li>
          Google (Gemini), solo si activas Astras AI: tus apuntes, preguntas y un resumen numérico sin nombre ni salud. Puede tratarlos fuera del Espacio Económico Europeo (Marco de Privacidad de Datos UE-EE. UU. y cláusulas contractuales tipo).
        </li>
        <li>OpenFoodFacts y Open-Meteo reciben solo búsquedas de alimentos y coordenadas de tu pista, sin datos tuyos.</li>
      </ul>
      <h2>Cuánto tiempo</h2>
      <ul>
        <li>Lo que anotas: mientras tengas cuenta; lo borras cuando quieras, y al borrar la cuenta se borra todo.</li>
        <li>Registro de seguridad: {d.AUDIT} días (por defecto {RETENTION_DEFAULTS.AUDIT}). Salidas de «Entreno sola»: {d.SAFETY_TRIPS} días. Enlaces caducados: {d.EXPIRED_LINKS} días.</li>
        <li>Copias de seguridad cifradas: diarias de las últimas semanas y una mensual durante un año; tras borrar la cuenta, desaparece de ellas al rotar.</li>
      </ul>
      <h2>Tus derechos</h2>
      <p>
        Acceso, rectificación, supresión, limitación, portabilidad y oposición: desde la app, en Ajustes → Privacidad y derechos (descarga de todos tus datos, limitación con un interruptor, borrado de la cuenta).
        {c.email ? ` También escribiendo a ${c.email}.` : ""} Si no te atienden, puedes reclamar ante la Agencia Española de Protección de Datos (aepd.es).
      </p>
      <h2>Seguridad</h2>
      <p>
        Conexión cifrada (HTTPS), datos de salud cifrados (AES-256-GCM), contraseñas con Argon2id, verificación en dos pasos y llaves de acceso, registro de actividad encadenado, copias cifradas verificadas a diario y aviso de brechas a la AEPD en 72 horas cuando corresponda.
      </p>
      <h2>Cookies</h2>
      <p>Solo cookies técnicas imprescindibles (tu sesión). Sin publicidad ni analítica: por eso no hay banner de cookies (art. 22.2 LSSI).</p>
    </article>
  );
}
