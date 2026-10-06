// Administración de usuarios desde la terminal del servidor (sin SQL a mano).
//
//   npm run user -- list
//   npm run user -- create <email> [--name "Nombre"] [--role ATHLETE|COACH|ADMIN]
//   npm run user -- reset-password <email>
//   npm run user -- unlock <email>
//   npm run user -- set-role <email> <ATHLETE|COACH|ADMIN>
//   npm run user -- disable-2fa <email>     (si se pierde el móvil y los códigos de recuperación)
//
// En Docker:  docker compose --profile tools run --rm migrate npm run user -- list
//
// Las contraseñas se generan aleatoriamente y se muestran UNA vez: nunca se pasan
// como argumento (quedarían en el historial de la shell y en `ps`).
import { config } from "dotenv";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../../src/generated/prisma/client";
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
  npm run user -- disable-2fa <email>`);
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
          },
        });
        console.log("Usuario creado.");
        printPassword(email, password);
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
