import Link from "next/link";

export const metadata = { title: "Página no encontrada · Atlenza" };

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-xl font-semibold">Página no encontrada</h1>
      <p className="max-w-sm text-sm text-muted-foreground">Esta dirección no existe o ya no está disponible.</p>
      <Link href="/" className="inline-flex min-h-11 items-center rounded-md border px-4 text-sm font-medium">
        Ir al inicio
      </Link>
    </main>
  );
}
