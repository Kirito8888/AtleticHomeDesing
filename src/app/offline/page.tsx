import { WifiOff } from "lucide-react";

export const metadata = { title: "Sin conexión · LifeOS" };

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
      <WifiOff className="size-10 text-muted-foreground" />
      <h1 className="text-xl font-semibold">Sin conexión</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        LifeOS necesita conexión para guardar y leer tus datos. Las páginas que ya visitaste siguen disponibles.
      </p>
    </main>
  );
}
