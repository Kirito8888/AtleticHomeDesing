import Link from "next/link";

import { AUTHORSHIP_NOTICE } from "@/lib/legal/notice";

/** v3.0 · Bloque C · Pie de autoría (V3-L02). Sin dominio, correo ni datos de la instalación. */
export function AuthorshipFooter({ className = "" }: { className?: string }) {
  return (
    <footer className={`mt-8 text-center text-xs text-muted-foreground ${className}`}>
      <Link href="/legal/aviso" className="inline-flex min-h-11 items-center justify-center px-1 underline underline-offset-2">
        {AUTHORSHIP_NOTICE} · Aviso legal
      </Link>
    </footer>
  );
}
