"use client";

// RequestQuotesButton
// ============================================================================
// Sends a saved draft to dealers through requestQuotesAction, from its row on
// the dashboard or from its own quotes page. On success the buyer lands on
// that quotes page, which now reads as open; on failure the server's reason
// is shown beside the button. The label matches the calculator's button that
// does the same thing for a new estimate.
// ============================================================================

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { requestQuotesAction } from "@/features/quotes/actions";
import { BusyLabel } from "@/components/busy-label";
import { Button } from "@/components/ui/button";

interface Props {
  projectId: string;
  size?: "sm" | "default";
  className?: string;
}

export function RequestQuotesButton({ projectId, size = "default", className }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await requestQuotesAction(projectId);
      if (!result.success) {
        setError(result.error);
        return;
      }
      const quotesPage = `/dashboard/project/${projectId}/quotes`;
      if (pathname === quotesPage) {
        router.refresh();
      } else {
        router.push(quotesPage);
      }
    });
  }

  return (
    <div className={className}>
      <Button
        size={size}
        className={size === "sm" ? "h-7 px-2.5 text-xs" : undefined}
        onClick={handleClick}
        disabled={isPending}
        aria-busy={isPending}
      >
        <BusyLabel busy={isPending} busyText="Sending…">
          Request Dealer Quotes
        </BusyLabel>
      </Button>
      {error && (
        <p role="alert" className="mt-1.5 text-[12px] leading-snug text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
