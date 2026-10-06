"use client";

// src/features/calculator/components/SiteFields.tsx
// ============================================================================
// SITE — WHERE THE HOME IS
// ============================================================================
// City and pin code, asked once above the presets so a preset and the custom
// form are estimated for the same site. Presets used to skip the city
// altogether and always got Delhi's rule.
//
// The city picks the state's three-phase rule. The pin code is recorded with
// a saved estimate and must lie in the city's state (pincode.ts).
// CalculatorShell owns both values and merges them into every layout it runs.
// ============================================================================

import type { Ref } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { NCR_CITY_OPTIONS } from "../regulatoryPolicy";

export interface Site {
  city: string;
  pincode: string;
}

interface SiteFieldsProps {
  value: Site;
  onChange: (site: Site) => void;
  /** Shown under the pin code; null when there is nothing to fix. */
  issue: string | null;
  pincodeRef?: Ref<HTMLInputElement>;
  disabled?: boolean;
}

export function SiteFields({ value, onChange, issue, pincodeRef, disabled }: SiteFieldsProps) {
  return (
    <div className="rounded-lg border p-4 sm:p-5">
      <h2 className="text-lg font-semibold">Site</h2>
      <p className="text-sm text-muted-foreground">Where the home is. Every estimate below uses it.</p>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="site-city">City</Label>
          <Select
            value={value.city}
            onValueChange={(city) => onChange({ ...value, city })}
            disabled={disabled}
          >
            <SelectTrigger id="site-city" className="w-full">
              <SelectValue placeholder="Select city" />
            </SelectTrigger>
            <SelectContent>
              {NCR_CITY_OPTIONS.map((city) => (
                <SelectItem key={city} value={city}>
                  {city}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">Sets your DISCOM&apos;s three-phase rule</p>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="site-pincode">Pin code</Label>
          <Input
            ref={pincodeRef}
            id="site-pincode"
            name="pincode"
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={6}
            placeholder="e.g. 110020"
            value={value.pincode}
            onChange={(e) => onChange({ ...value, pincode: e.target.value.replace(/\D/g, "").slice(0, 6) })}
            aria-invalid={issue ? true : undefined}
            aria-describedby="site-pincode-note"
            disabled={disabled}
          />
          <p
            id="site-pincode-note"
            className={issue ? "text-sm text-destructive" : "text-sm text-muted-foreground"}
            aria-live="polite"
          >
            {issue ?? "Saved with the estimate"}
          </p>
        </div>
      </div>
    </div>
  );
}
