"use client";

// Manual copper-rate entry until an MCX feed exists (Phase 3). Internal tool:
// deliberately plain.

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createPriceSnapshotAction } from "@/features/admin/actions";
import {
  PRICE_SNAPSHOT_SOURCES,
  type PriceSnapshotSource,
} from "@/features/admin/priceSnapshot";

export function CopperRateForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [rate, setRate] = useState("");
  const [source, setSource] = useState<PriceSnapshotSource>("MCX");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await createPriceSnapshotAction(Number(rate), source);
      if (!result.success) {
        setMessage({ ok: false, text: result.error });
        return;
      }
      setRate("");
      setMessage({ ok: true, text: "Recorded. New projects are stamped with this rate." });
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-2">
      <label htmlFor="copper-rate" className="text-sm text-slate-600">
        Copper ₹/kg
      </label>
      <Input
        id="copper-rate"
        type="number"
        inputMode="decimal"
        step="0.01"
        min={0}
        required
        value={rate}
        onChange={(e) => setRate(e.target.value)}
        className="h-8 w-28 tabular-nums"
      />
      <select
        aria-label="Source"
        value={source}
        onChange={(e) => setSource(e.target.value as PriceSnapshotSource)}
        className="h-8 border border-slate-300 bg-white px-2 text-sm"
      >
        {PRICE_SNAPSHOT_SOURCES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <Button type="submit" size="sm" variant="outline" disabled={isPending}>
        {isPending ? "Saving…" : "Record today's rate"}
      </Button>
      {message && (
        <p
          role="status"
          className={`w-full text-sm ${message.ok ? "text-emerald-700" : "text-red-700"}`}
        >
          {message.text}
        </p>
      )}
    </form>
  );
}
