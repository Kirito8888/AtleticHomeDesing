"use client";

import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/client-api";

export function DeleteEntry({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-8"
      aria-label={`Quitar ${name}`}
      onClick={async () => {
        try {
          await api(`/api/nutrition/entries/${id}`, { method: "DELETE" });
          router.refresh();
        } catch (e) {
          toast.error((e as Error).message);
        }
      }}
    >
      <X className="size-4" />
    </Button>
  );
}
