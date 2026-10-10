import { connection } from "next/server";

import { TERMS_VERSION } from "@/lib/auth/access";
import { controller } from "@/lib/privacy/legal";

export const metadata = { title: "Condiciones de uso · Atlenza" };

/** v1.9 · Condiciones de uso: se aceptan al crear la cuenta y cada vez que cambia la versión. */
export default async function Terms() {
  await connection();
  const c = controller();
  return (
    <article>
      <h1>Condiciones de uso</h1>
      <p className="text-sm">Versión {TERMS_VERSION}</p>
      <h2>1. Quién eres para Atlenza</h2>
      <p>
        Atlenza es un programa de David Ornelas Luna (© 2026, todos los derechos reservados). Puedes usar esta instalación porque su administración te ha invitado. Ese permiso es personal: no puedes cederlo, compartir tu cuenta ni dar acceso a otras personas.
      </p>
      <h2>2. Qué puedes hacer</h2>
      <p>Usar la app para registrar y consultar tus propios datos (entrenamiento, recuperación, nutrición, finanzas y estudio), y descargarlos o borrarlos cuando quieras desde Ajustes.</p>
      <h2>3. Qué no puedes hacer</h2>
      <ul>
        <li>Copiar, descargar, modificar o redistribuir el programa, o intentar extraer su código o su diseño.</li>
        <li>Usarlo para fines comerciales o para dar servicio a terceros.</li>
        <li>Intentar acceder a datos de otras personas, saltarte la seguridad o sobrecargar el servidor.</li>
        <li>Subir contenido ilícito o del que no tengas derechos.</li>
      </ul>
      <h2>4. Salud: orientativo, no médico</h2>
      <p>
        Atlenza no es un producto sanitario. Sus avisos (carga, recuperación, molestias, ciclo, cribados, predicciones) son pautas de prudencia y estimaciones: no diagnostican, no sustituyen el consejo de profesionales y no sirven como método anticonceptivo.
      </p>
      <h2>5. Inteligencia artificial</h2>
      <p>
        Si activas la IA, eliges el proveedor y, en su caso, usas tu propia clave: quedas sujeto también a sus condiciones. Lo que se envía y a quién se explica en Ajustes → Privacidad e IA. Los datos de salud cifrados nunca se envían.
      </p>
      <h2>6. Disponibilidad y responsabilidad</h2>
      <p>
        Es una instalación personal, sin garantía de disponibilidad. Haz copias de tus datos (Ajustes → Tus datos). En la medida que permita la ley, ni el autor ni la administración responden de daños derivados del uso.
      </p>
      <h2>7. Fin del acceso</h2>
      <p>La administración puede suspender o retirar el acceso si se incumplen estas condiciones. Tú puedes borrar tu cuenta y tus datos en cualquier momento.</p>
      <h2>8. Privacidad</h2>
      <p>
        El tratamiento de tus datos se explica en la <a href="/legal/privacidad">política de privacidad</a>. Responsable: {c.name ?? "la administración de esta instalación"}
        {c.email ? ` (${c.email})` : ""}.
      </p>
      <h2>9. Ley aplicable</h2>
      <p>Ley española.</p>
    </article>
  );
}
