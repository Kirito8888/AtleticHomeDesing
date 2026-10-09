import { PageHeader } from "@/components/page-header";
import { ShoppingList } from "@/components/nutrition/kitchen";
import { pageUser } from "@/lib/auth/page";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Lista de la compra · LifeOS" };

export default async function ShoppingPage() {
  const user = await pageUser();
  const [items, favorites] = await Promise.all([
    prisma.shoppingItem.findMany({ where: { userId: user.id }, orderBy: [{ done: "asc" }, { createdAt: "asc" }] }),
    prisma.mealTemplate.findMany({ where: { userId: user.id }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return (
    <>
      <PageHeader title="Lista de la compra" description="A mano o con los ingredientes de tus comidas favoritas." />
      <div className="max-w-xl">
        <ShoppingList items={items.map((i) => ({ id: i.id, name: i.name, qty: i.qty, done: i.done }))} favorites={favorites} />
      </div>
    </>
  );
}
