"use client";

import { RouteError } from "@/components/route-error";

export default function AppError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError where="Esta página" {...props} />;
}
