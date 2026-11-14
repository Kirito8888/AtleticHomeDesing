import { PasskeySettings } from "@/components/settings/passkeys";
import { TwoFactorSettings } from "@/components/settings/two-factor";
import { AuthorshipFooter } from "@/components/legal/authorship-footer";
import { listPasskeys } from "@/lib/auth/passkey";
import { totpStatus } from "@/lib/security/totp";

/**
 * v3.0 D (V3-S01) · Pasada la gracia, una cuenta ADMIN/COACH sin segundo factor solo ve esta pantalla:
 * reutiliza los ajustes de 2FA y de llaves de acceso, así que se configura sin salir de aquí.
 */
export async function SecondFactorGate({ userId }: { userId: string }) {
  const [twoFactor, passkeys] = await Promise.all([totpStatus(userId), listPasskeys(userId)]);
  return (
    <main id="main" className="mx-auto w-full max-w-5xl px-4">
      <section className="mx-auto grid max-w-lg gap-6 py-10 text-sm" aria-labelledby="sf-h">
        <div className="grid gap-2">
          <h1 id="sf-h" className="text-xl font-semibold">
            Activa la verificación en dos pasos
          </h1>
          <p>
            Las cuentas de entrenadora y de administración necesitan un segundo factor: protegen datos de otras personas. Activa una de las dos opciones y entrarás en la app al instante. Si pierdes el acceso, usa un código de recuperación al iniciar sesión.
          </p>
        </div>
        <div className="grid gap-2">
          <h2 className="text-base font-medium">Código de tu móvil</h2>
          <TwoFactorSettings initial={{ ...twoFactor, enabledAt: twoFactor.enabledAt?.toISOString() ?? null }} />
        </div>
        <div className="grid gap-2">
          <h2 className="text-base font-medium">Llave de acceso (huella, cara o PIN)</h2>
          <PasskeySettings passkeys={passkeys.map((p) => ({ ...p, createdAt: p.createdAt.toISOString(), lastUsedAt: p.lastUsedAt?.toISOString() ?? null }))} />
        </div>
        <AuthorshipFooter />
      </section>
    </main>
  );
}
