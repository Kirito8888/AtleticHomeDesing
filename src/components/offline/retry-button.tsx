"use client";

import { Button } from "@/components/ui/button";

export function RetryButton() {
  return (
    <Button type="button" onClick={() => window.location.reload()}>
      Reintentar
    </Button>
  );
}
