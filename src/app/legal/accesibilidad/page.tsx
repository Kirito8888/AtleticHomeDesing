import { connection } from "next/server";

import { A11Y_KNOWN_ISSUES, A11Y_REVIEWED, A11Y_STATUS, A11Y_STATUS_LABEL, A11Y_VERIFIED } from "@/lib/legal/accessibility";
import { LEGAL_REVIEW_PENDING } from "@/lib/legal/notice";
import { controller } from "@/lib/privacy/legal";

export const metadata = { title: "Declaración de accesibilidad · Atlenza" };

/** v3.0 T · Declaración de accesibilidad (alcance, estado real, contacto genérico). */
export default async function AccessibilityStatement() {
  await connection();
  const c = controller();
  return (
    <article>
      <h1>Declaración de accesibilidad</h1>
      <p>
        Atlenza es un proyecto personal. Se compromete, de forma voluntaria, a que esta instalación sea accesible según las pautas WCAG 2.2 de nivel AA. Esta declaración describe el estado real, no una garantía.
      </p>
      <h2>Estado</h2>
      <p>
        Esta instalación es <strong>{A11Y_STATUS_LABEL[A11Y_STATUS]}</strong>. Última revisión: {A11Y_REVIEWED}.
      </p>
      <h2>Qué se ha comprobado</h2>
      <ul>
        {A11Y_VERIFIED.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      <h2>Contenido que aún no es accesible</h2>
      <ul>
        {A11Y_KNOWN_ISSUES.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      <h2>Cómo se evaluó</h2>
      <p>
        Con pruebas automáticas y una pasada automatizada de teclado. La prueba manual con lector de pantalla la realizará la propia usuaria y, cuando se haga, esta declaración se actualizará con su resultado.
      </p>
      <h2>Contacto</h2>
      <p>
        Si encuentras una barrera, díselo a quien administra tu instalación{c.email ? ` (${c.email})` : ""}, indicando la página y qué ayuda técnica usas. Si necesitas un dato en otro formato, pídelo por el mismo medio.
      </p>
      <p className="text-xs text-muted-foreground">{LEGAL_REVIEW_PENDING}</p>
    </article>
  );
}
