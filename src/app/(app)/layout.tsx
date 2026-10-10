import { AppNav } from "@/components/layout/app-nav";
import { OutboxSync } from "@/components/offline/outbox-sync";
import { pageUser } from "@/lib/auth/page";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await pageUser();
  return (
    <div className="min-h-dvh md:pl-56">
      <AppNav userName={user.name ?? user.email} />
      <main className="mx-auto w-full max-w-5xl px-4 pt-4 pb-24 sm:px-6 md:pb-10">
        <OutboxSync />
        {/* v1.7 · el dominio reservado .invalid identifica las cuentas demo sin otra consulta */}
        {user.email?.endsWith("@demo.lifeos.invalid") ? (
          <p role="status" className="mb-3 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs">
            Cuenta de demostración: datos inventados que se borran solos a los 30 días.
          </p>
        ) : null}
        {children}
      </main>
    </div>
  );
}
