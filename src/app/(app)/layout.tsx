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
        {children}
      </main>
    </div>
  );
}
