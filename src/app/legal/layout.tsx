import Link from "next/link";

/** v1.7 · Páginas legales públicas (sin sesión): política de privacidad y aviso legal. */
export default function LegalLayout({ children }: LayoutProps<"/legal">) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 text-sm leading-relaxed [&_h1]:mb-4 [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_p]:mb-2">
      {children}
      <p className="mt-8 text-xs text-muted-foreground">
        <Link href="/legal/privacidad" className="underline underline-offset-2">
          Privacidad
        </Link>{" "}
        ·{" "}
        <Link href="/legal/aviso" className="underline underline-offset-2">
          Aviso legal
        </Link>{" "}
        ·{" "}
        <Link href="/login" className="underline underline-offset-2">
          Entrar
        </Link>
      </p>
    </main>
  );
}
