"use client";

import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";
import { BusyLabel } from "@/components/busy-label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { joinWaitlistAction } from "@/features/waitlist/actions";
import { WAITLIST_HONEYPOT, WAITLIST_INITIAL_STATE } from "@/features/waitlist/schema";

/**
 * "Get notified when it launches". A plain form action, so it also works
 * before JavaScript loads. The reply is identical for a new email and a
 * repeat (see joinWaitlistAction).
 */
export function NotifyForm() {
  const [state, formAction, pending] = useActionState(joinWaitlistAction, WAITLIST_INITIAL_STATE);

  if (state.status === "success") {
    return (
      <div role="status" className="flex gap-3 border-2 border-ink bg-phase-yellow p-5">
        <CheckCircle2 aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-ink" />
        <p>
          <span className="block font-display text-lg font-extrabold tracking-tight text-ink">
            You&apos;re on the list.
          </span>
          <span className="mt-1 block text-[14px] leading-relaxed text-neutral-800">
            We&apos;ll email you when Snap-to-BOM launches.
          </span>
        </p>
      </div>
    );
  }

  const error = state.status === "error" ? state : null;

  return (
    <form action={formAction} className="relative border-2 border-ink bg-white p-5">
      <label htmlFor="notify-email" className="block font-display text-lg font-extrabold tracking-tight text-ink">
        Get notified when it launches
      </label>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Input
          id="notify-email"
          name="email"
          type="email"
          required
          maxLength={254}
          autoComplete="email"
          inputMode="email"
          placeholder="you@example.com"
          defaultValue={error?.email ?? ""}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "notify-error" : undefined}
          className="h-11 flex-1 border-neutral-400 text-[15px] shadow-none"
        />
        <Button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          className="h-11 px-6 text-[15px] font-semibold"
        >
          <BusyLabel busy={pending} busyText="Adding…">
            Notify me
          </BusyLabel>
        </Button>
      </div>
      {error && (
        <p id="notify-error" role="alert" className="mt-2 text-[13px] font-medium text-phase-red">
          {error.message}
        </p>
      )}

      {/* Honeypot: off-screen and out of the tab order, hidden from screen
          readers. A person never fills it; a form-filling bot does. */}
      <div aria-hidden="true" className="absolute -left-[10000px] top-auto size-px overflow-hidden">
        <label htmlFor="notify-website">Website</label>
        <input id="notify-website" name={WAITLIST_HONEYPOT} type="text" tabIndex={-1} autoComplete="off" />
      </div>
    </form>
  );
}
