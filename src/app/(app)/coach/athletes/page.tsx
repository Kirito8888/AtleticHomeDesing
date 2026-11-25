import { redirect } from "next/navigation";

import { AthleteList } from "@/components/coach/athlete-list";
import { NewAthlete } from "@/components/coach/new-athlete";
import { PageHeader } from "@/components/page-header";
import { pageUser } from "@/lib/auth/page";
import { portfolio } from "@/lib/managed/portfolio";

export const metadata = { title: "Mis atletas · Atlenza" };

/** Cartera de la entrenadora: atletas con y sin cuenta en una sola lista. */
export default async function AthletesPage() {
  const user = await pageUser();
  if (user.role !== "COACH" && user.role !== "ADMIN") redirect("/");
  const rows = await portfolio(user);
  const groups = [...new Set(rows.map((r) => r.group).filter((g): g is string => Boolean(g)))];
  return (
    <>
      <PageHeader title="Mis atletas" description="Las que llevas, con o sin cuenta. Toca una para ver su ficha." />
      <div className="mb-4">
        <NewAthlete groups={groups} />
      </div>
      <AthleteList rows={rows} />
    </>
  );
}
