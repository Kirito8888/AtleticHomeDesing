import { connection } from "next/server";

import { controller } from "@/lib/privacy/legal";

export const metadata = { title: "Aviso legal · LifeOS" };

/** v1.7 · Aviso legal (art. 10 LSSI). */
export default async function LegalNotice() {
  await connection();
  const c = controller();
  return (
    <article>
      <h1>Aviso legal</h1>
      <p>
        Titular: {c.name ?? "instalación personal de LifeOS (sin actividad económica)"}
        {c.nif ? ` · NIF ${c.nif}` : ""}
        {c.address ? ` · ${c.address}` : ""}
        {c.email ? ` · contacto: ${c.email}` : ""}.
      </p>
      <p>
        LifeOS es una herramienta personal de registro y análisis del entrenamiento, la salud, el estudio y las finanzas. Sus avisos (carga, molestias, ciclo, cribados) son pautas de prudencia, no diagnósticos médicos: ante cualquier duda, consulta con un profesional sanitario.
      </p>
      <p>Las estimaciones y proyecciones (marcas, progreso, previsiones) son orientativas y dependen de tus propios datos; no son una promesa de resultado.</p>
      <p>El código es software libre en GitHub; cada instalación es responsabilidad de quien la administra.</p>
    </article>
  );
}
