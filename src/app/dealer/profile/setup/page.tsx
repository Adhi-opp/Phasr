"use client";

// src/app/dealer/profile/setup/page.tsx
// ============================================================================
// DEALER REGISTRATION SHEET
// ============================================================================
// A trade account form, laid out like one: ruled sections, compact fields, no
// card chrome. Grouped by what the data is for rather than by field type —
// identity, premises, then coverage — because the coverage block is the one
// that actually decides which requisitions reach this dealer, and it deserves
// to be its own section rather than two more inputs at the bottom of a list.
// ============================================================================

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState, useTransition } from "react";
import { useSession } from "next-auth/react";
import {
  saveDealerProfileAction,
  type DealerProfileInput,
} from "@/features/dealer/actions";
import { Section } from "@/components/spec-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** One labelled input on the sheet. Cells rule against each other. */
function CellField({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-slate-100 px-3 py-2.5 last:border-b-0">
      <Label htmlFor={id} className="spec-label">
        {label}
      </Label>
      <div className="mt-1.5">{children}</div>
      {hint && (
        <p className="mt-1 text-[11px] leading-snug text-slate-500">{hint}</p>
      )}
    </div>
  );
}

export default function DealerProfileSetupPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [reverification, setReverification] = useState(false);

  const [form, setForm] = useState<DealerProfileInput>({
    companyName: "",
    gstin: "",
    address: "",
    city: "",
    state: "",
    pincode: "",
    serviceAreas: "",
    brandsSold: "",
  });

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
    if (
      status === "authenticated" &&
      session?.user?.role !== "DEALER" &&
      session?.user?.role !== "ADMIN"
    ) {
      router.push("/dashboard");
    }
  }, [status, session, router]);

  function update(field: keyof DealerProfileInput, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    startTransition(async () => {
      const result = await saveDealerProfileAction(form);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setSuccess(true);
      setReverification(result.reverification);
      // Longer when approval was withdrawn: that message has to be read.
      setTimeout(() => router.push("/dealer/dashboard"), result.reverification ? 4000 : 1200);
    });
  }

  if (status === "loading") {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
        <p className="border border-slate-200 bg-white px-3 py-8 text-center text-[13px] text-slate-500">
          Loading…
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-4 py-10 sm:px-6">
      <div className="mb-4 border-b border-slate-300 pb-3">
        <p className="spec-label">Dealer Registration</p>
        <h1 className="mt-1 text-xl font-bold tracking-tight text-slate-950">
          Trade Account Details
        </h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-slate-600">
          Reviewed by an admin before your account can bid. Accuracy on GSTIN
          and coverage matters — both are checked against the requisitions you
          are shown.
        </p>
      </div>

      {error && (
        <p className="mb-3 border border-destructive/40 bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
          {error}
        </p>
      )}
      {success && !reverification && (
        <p className="mb-3 border border-emerald-300 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800">
          Profile saved. Redirecting to your dashboard…
        </p>
      )}
      {success && reverification && (
        <p className="mb-3 border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
          Profile saved. Your company name or GSTIN changed, so your account is back in
          review. You can bid again once an admin re-verifies it.
        </p>
      )}

      <form className="space-y-4" onSubmit={onSubmit}>
        <Section index={1} title="Business Identity">
          <CellField id="companyName" label="Registered Company Name">
            <Input
              id="companyName"
              className="h-9 text-[13px]"
              value={form.companyName}
              onChange={(e) => update("companyName", e.target.value)}
              placeholder="Singh Electricals & Cables"
              required
            />
          </CellField>

          <CellField
            id="gstin"
            label="GSTIN (optional)"
            hint="Verified against the state code on your address. Accounts with a GSTIN clear approval faster."
          >
            <Input
              id="gstin"
              className="spec-num h-9 uppercase"
              placeholder="07AAACH7409R1ZZ"
              value={form.gstin}
              onChange={(e) => update("gstin", e.target.value)}
              maxLength={15}
            />
          </CellField>
        </Section>

        <Section index={2} title="Premises">
          <CellField id="address" label="Business Address">
            <Textarea
              id="address"
              className="text-[13px]"
              value={form.address}
              onChange={(e) => update("address", e.target.value)}
              rows={2}
              placeholder="M-14, Palika Bhawan, Nehru Place"
              required
            />
          </CellField>

          <div className="grid grid-cols-1 sm:grid-cols-3 sm:divide-x sm:divide-slate-100">
            <CellField id="city" label="City">
              <Input
                id="city"
                className="h-9 text-[13px]"
                value={form.city}
                onChange={(e) => update("city", e.target.value)}
                placeholder="NCR"
                required
              />
            </CellField>
            <CellField id="state" label="State">
              <Input
                id="state"
                className="h-9 text-[13px]"
                value={form.state}
                onChange={(e) => update("state", e.target.value)}
                placeholder="Delhi"
                required
              />
            </CellField>
            <CellField id="pincode" label="Pincode">
              <Input
                id="pincode"
                className="spec-num h-9"
                value={form.pincode}
                onChange={(e) => update("pincode", e.target.value)}
                maxLength={6}
                placeholder="110019"
                required
              />
            </CellField>
          </div>
        </Section>

        <Section
          index={3}
          title="Coverage"
          meta="Decides what reaches you"
        >
          <CellField
            id="serviceAreas"
            label="Service Areas"
            hint="Comma-separated. Requisitions are matched on these plus your city. Include NCR — that is the area code most residential requests carry."
          >
            <Input
              id="serviceAreas"
              className="h-9 text-[13px]"
              placeholder="NCR, Delhi, Noida, Gurugram"
              value={form.serviceAreas}
              onChange={(e) => update("serviceAreas", e.target.value)}
              required
            />
          </CellField>

          <CellField
            id="brandsSold"
            label="Brands Stocked"
            hint="Shown to buyers alongside your bid."
          >
            <Input
              id="brandsSold"
              className="h-9 text-[13px]"
              placeholder="Polycab, Havells, Finolex, RR Kabel"
              value={form.brandsSold}
              onChange={(e) => update("brandsSold", e.target.value)}
              required
            />
          </CellField>
        </Section>

        <div className="flex items-center justify-end gap-3 border-t border-slate-300 pt-3">
          <p className="text-[11px] text-slate-500">
            Submitted for admin review.
          </p>
          <Button
            className="h-9 px-6"
            type="submit"
            disabled={isPending || success}
          >
            {isPending ? "Saving…" : "Save Profile"}
          </Button>
        </div>
      </form>
    </main>
  );
}
