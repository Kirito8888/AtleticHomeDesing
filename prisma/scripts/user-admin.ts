// Administración de usuarios desde la terminal del servidor (sin SQL a mano).
//
//   npm run user -- list
//   npm run user -- create <email> [--name "Nombre"] [--role ATHLETE|COACH|ADMIN]
//   npm run user -- reset-password <email>
//   npm run user -- unlock <email>
//   npm run user -- set-role <email> <ATHLETE|COACH|ADMIN>
//   npm run user -- disable-2fa <email>     (si se pierde el móvil y los códigos de recuperación)
//   npm run user -- invite [email] [--role ATHLETE|COACH] [--days 7]   (v1.9: enlace de invitación)
//   npm run user -- suspend <email> | reactivate <email>                (v1.9: quitar o devolver el acceso)
//
// En Docker:  docker compose --profile tools run --rm migrate npm run user -- list
//
// Las contraseñas se generan aleatoriamente y se muestran UNA vez: nunca se pasan
// como argumento (quedarían en el historial de la shell y en `ps`).
import { config } from "dotenv";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../../src/generated/prisma/client";
import { TERMS_VERSION } from "../../src/lib/auth/constants";
import { newShareToken } from "../../src/lib/security/share-token";
import { generatePassword, hashPassword } from "../../src/lib/auth/scrypt";

config({ path: [".env.local", ".env"], quiet: true });

const ROLES = ["ATHLETE", "COACH", "ADMIN"] as const;
type Role = (typeof ROLES)[number];

function usage(): never {
  console.error(`Uso:
  npm run user -- list
  npm run user -- create <email> [--name "Nombre"] [--role ATHLETE|COACH|ADMIN]
  npm run user -- reset-password <email>
  npm run user -- unlock <email>
  npm run user -- set-role <email> <ATHLETE|COACH|ADMIN>
  npm run user -- disable-2fa <email>
  npm run user -- invite [email] [--role ATHLETE|COACH] [--days 7]
  npm run user -- suspend <email>
  npm run user -- reactivate <email>`);
  process.exit(2);
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

function role(value: string | undefined, fallback: Role): Role {
  if (!value) return fallback;
  const r = value.toUpperCase();
  if (!ROLES.includes(r as Role)) usage();
  return r as Role;
}

function printPassword(email: string, password: string) {
  console.log(`\n  Email:      ${email}\n  Contraseña: ${password}\n\nGuárdala ahora: no se vuelve a mostrar. Cámbiala en Ajustes → Seguridad.\n`);
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  if (!cmd) usage();
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL no está definida");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  const email = args[0]?.trim().toLowerCase();

  try {
    switch (cmd) {
      case "list": {
        const users = await prisma.user.findMany({
          orderBy: { createdAt: "asc" },
          select: { email: true, name: true, role: true, lockedUntil: true, aiConsentAt: true, totpEnabledAt: true, createdAt: true },
        });
        console.table(
          users.map((u) => ({
            email: u.email,
            nombre: u.name ?? "",
            rol: u.role,
            bloqueado: u.lockedUntil && u.lockedUntil > new Date() ? `hasta ${u.lockedUntil.toISOString()}` : "no",
            ia: u.aiConsentAt ? "sí" : "no",
            "2fa": u.totpEnabledAt ? "sí" : "no",
            alta: u.createdAt.toISOString().slice(0, 10),
          })),
        );
        break;
      }
      case "create": {
        if (!email || email.startsWith("--")) usage();
        const password = generatePassword();
        await prisma.user.create({
          data: {
            email,
            name: flag(args, "name") ?? null,
            role: role(flag(args, "role"), "ATHLETE"),
            passwordHash: await hashPassword(password),
            athleteProfile: { create: {} },
            // --accept-terms: solo para pruebas automáticas (la persona real las acepta al entrar)
            ...(args.includes("--accept-terms")
              ? { consents: { create: [{ purpose: "TERMS", version: TERMS_VERSION, granted: true }, { purpose: "PRIVACY", version: TERMS_VERSION, granted: true }] } }
              : {}),
          },
        });
        console.log("Usuario creado.");
        printPassword(email, password);
        break;
      }
      case "invite": {
        // v1.9 · Invitación de un solo uso (el registro está cerrado). El email es opcional.
        const admin = await prisma.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" }, select: { id: true } });
        if (!admin) throw new Error("Crea antes una cuenta ADMIN (npm run user -- create <email> --role ADMIN)");
        const target = email && !email.startsWith("--") ? email : null;
        const r = role(flag(args, "role"), "ATHLETE");
        if (r === "ADMIN") usage();
        const days = Math.min(30, Math.max(1, Number(flag(args, "days") ?? 7) || 7));
        const { token, hash } = newShareToken();
        await prisma.invitation.create({ data: { tokenHash: hash, email: target, role: r, createdById: admin.id, expiresAt: new Date(Date.now() + days * 864e5) } });
        const base = (process.env.AUTH_URL ?? "").replace(/\/$/, "");
        console.log(`\n  Invitación${target ? ` para ${target}` : ""} (${days} días, un solo uso):\n  ${base}/register?invite=${token}\n\nSolo se muestra ahora. Envíala por un canal privado.\n`);
        break;
      }
      case "suspend":
      case "reactivate": {
        if (!email) usage();
        await prisma.user.update({
          where: { email },
          data: cmd === "suspend" ? { suspendedAt: new Date(), sessionVersion: { increment: 1 } } : { suspendedAt: null, failedLogins: 0, lockedUntil: null },
        });
        console.log(cmd === "suspend" ? "Acceso suspendido (sus sesiones se han cerrado)." : "Acceso reactivado.");
        break;
      }
      case "reset-password": {
        if (!email) usage();
        const password = generatePassword();
        await prisma.user.update({
          where: { email },
          // sessionVersion++: quien tuviera la sesión abierta queda fuera.
          data: { passwordHash: await hashPassword(password), sessionVersion: { increment: 1 }, failedLogins: 0, lockedUntil: null },
        });
        console.log("Contraseña restablecida y sesiones cerradas.");
        printPassword(email, password);
        break;
      }
      case "unlock": {
        if (!email) usage();
        await prisma.user.update({ where: { email }, data: { failedLogins: 0, lockedUntil: null } });
        console.log(`Cuenta ${email} desbloqueada.`);
        break;
      }
      case "set-role": {
        if (!email || !args[1]) usage();
        const r = role(args[1], "ATHLETE");
        await prisma.user.update({ where: { email }, data: { role: r } });
        console.log(`Rol de ${email}: ${r}.`);
        break;
      }
      case "disable-2fa": {
        if (!email) usage();
        const u = await prisma.user.findUniqueOrThrow({ where: { email }, select: { id: true } });
        await prisma.$transaction([
          prisma.recoveryCode.deleteMany({ where: { userId: u.id } }),
          // sessionVersion++: si alguien tenía la sesión abierta con el 2FA antiguo, queda fuera.
          prisma.user.update({
            where: { id: u.id },
            data: { totpSecret: null, totpEnabledAt: null, totpLastStep: null, sessionVersion: { increment: 1 } },
          }),
          prisma.securityEvent.create({ data: { userId: u.id, type: "TOTP_DISABLED", detail: "desde la terminal del servidor" } }),
        ]);
        console.log(`Verificación en dos pasos desactivada para ${email}. Que la vuelva a activar en Ajustes.`);
        break;
      }
      default:
        usage();
    }
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "P2025") console.error(`No existe ningún usuario con email ${email}.`);
    else if (code === "P2002") console.error(`Ya existe un usuario con email ${email}.`);
    else throw err;
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
