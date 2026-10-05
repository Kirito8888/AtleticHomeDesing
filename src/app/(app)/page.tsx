import { Activity, Apple, Brain, CalendarDays, Wallet } from "lucide-react";

import { ThemeToggle } from "@/components/theme-toggle";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Placeholder de Fase 1: el dashboard de widgets se construye en Fase 3.
const modules = [
  { title: "Rendimiento", desc: "Pista, técnica, fuerza · PMC", icon: Activity },
  { title: "Periodización", desc: "Macro / Meso / Microciclos", icon: CalendarDays },
  { title: "Finanzas", desc: "Partida doble · presupuestos", icon: Wallet },
  { title: "Nutrición", desc: "OpenFoodFacts · macros", icon: Apple },
  { title: "Astras AI", desc: "RAG · flashcards · coach", icon: Brain },
];

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">LifeOS</h1>
        <ThemeToggle />
      </header>
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map(({ title, desc, icon: Icon }) => (
          <Card key={title}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Icon className="size-5" /> {title}
              </CardTitle>
              <CardDescription>{desc}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </section>
    </main>
  );
}
