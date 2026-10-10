import { AppNav } from "@/components/layout/app-nav";
import { OutboxSync } from "@/components/offline/outbox-sync";
import { DisplayPrefs, UsageBeacon } from "@/components/layout/display-prefs";
import { pageUser } from "@/lib/auth/page";
import { NotificationBell } from "@/components/layout/notification-bell";
import { unreadCount } from "@/lib/push/inbox";
import { getPrefs } from "@/lib/rules/prefs-service";
import { TermsGate } from "@/components/legal/terms-gate";
import { hasAcceptedTerms, TERMS_VERSION } from "@/lib/auth/access";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await pageUser();
  // v1.9 · Uso solo con las condiciones aceptadas (versión vigente). La administración no lo necesita.
  if (user.role !== "ADMIN" && !user.email?.endsWith("@demo.lifeos.invalid") && !(await hasAcceptedTerms(user.id))) {
    return (
      <main className="mx-auto w-full max-w-5xl px-4">
        <TermsGate version={TERMS_VERSION} />
      </main>
    );
  }
  const [prefs, unread] = await Promise.all([getPrefs(user.id), unreadCount(user.id)]);
  return (
    <div className="min-h-dvh md:pl-56">
      <DisplayPrefs fontScale={prefs.fontScale} highContrast={prefs.highContrast} />
      <UsageBeacon enabled={prefs.usageStats} />
      <AppNav userName={user.name ?? user.email} hidden={prefs.hiddenModules} bell={<NotificationBell unread={unread} />} />
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
