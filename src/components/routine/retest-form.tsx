"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/client-api";
import { TESTS, type TestKey } from "@/lib/routine/questionnaire";

/** Repite un test (cada 4 semanas, por ejemplo) y tu punto real aparece sobre la curva. */
export function RetestForm({ routineId, metrics, today }: { routineId: string; metrics: TestKey[]; today: string }) {
  const router = useRouter();
  const [metric, setMetric] = useState<TestKey>(metrics[0] ?? "pushups");
  const [value, setValue] = useState("");
  return (
    <form
      className="flex flex-wrap items-end gap-2 text-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await api(`/api/routine/${routineId}/tests`, { body: { metric, value: Number(value.replace(",", ".")), date: today } });
          toast.success("Test anotado");
          setValue("");
          router.refresh();
        } catch (err) {
          toast.error((err as Error).message);
        }
      }}
    >
      <Select aria-label="Test" className="min-w-0 flex-1" value={metric} onChange={(e) => setMetric(e.target.value as TestKey)}>
        {(Object.keys(TESTS) as TestKey[]).map((k) => (
          <option key={k} value={k}>
            {TESTS[k].label}
          </option>
        ))}
      </Select>
      <Input aria-label="Resultado" inputMode="decimal" className="w-24" value={value} onChange={(e) => setValue(e.target.value)} placeholder={TESTS[metric].unit} />
      <Button type="submit" variant="outline" disabled={!value.trim()}>
        Anotar test
      </Button>
    </form>
  );
}
