import { FinanceOverviewZone } from "@/components/finance/overview-zone";
import type { ImportProfile } from "@/components/finance/bank-import";
import { pageUser } from "@/lib/auth/page";
import { addDays, today, toIsoDay } from "@/lib/dates";
import { ensureBasicCategories } from "@/lib/finance/service";
import { financeOverview } from "@/lib/finance/overview";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Finanzas · Atlenza" };

export default async function FinancePage() {
  const user = await pageUser();
  const now = today();
  await ensureBasicCategories(user.id);
  const [overview, importProfiles, competitions] = await Promise.all([
    financeOverview(user.id),
    prisma.bankImportProfile.findMany({ where: { userId: user.id }, orderBy: { name: "asc" } }),
    prisma.calendarEvent.findMany({
      where: { userId: user.id, type: "COMPETITION", startAt: { gte: addDays(now, -120), lte: addDays(now, 240) } },
      orderBy: { startAt: "asc" },
      select: { id: true, title: true, startAt: true },
    }),
  ]);
  return (
    <FinanceOverviewZone
      initial={overview}
      today={toIsoDay(now)}
      competitions={competitions.map((c) => ({ id: c.id, title: c.title, date: toIsoDay(c.startAt) }))}
      profiles={importProfiles.map((p) => ({ id: p.id, name: p.name, accountId: p.accountId, mapping: p.mapping as unknown as ImportProfile["mapping"] }))}
    />
  );
}
