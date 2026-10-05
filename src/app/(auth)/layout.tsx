import { Activity } from "lucide-react";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="mb-6 flex items-center gap-2 text-2xl font-bold tracking-tight">
        <Activity className="size-7" /> LifeOS
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
