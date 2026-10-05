"use client";

// src/features/calculator/components/CalculatorForm.tsx
// ============================================================================
// CALCULATOR FORM — react-hook-form + Zod validation for LayoutInput
// ============================================================================
// Controlled form for custom property configurations. Pre-populated when
// the user clicks "Customize" on a preset card.
//
// Rules:
//   - Number selects use onValueChange={(v) => field.onChange(Number(v))}
//     to avoid Zod string-vs-number coercion failures.
//   - Switch uses checked/onCheckedChange (not value/onChange).
//   - DUPLEX propertyType auto-sets totalFloors to 2 via useEffect.
//   - Errors shown inline under each field using FormMessage.
// ============================================================================

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Zap } from "lucide-react";
import { NCR_CITY_OPTIONS } from "../regulatoryPolicy";
import { layoutSchema, type LayoutFormValues } from "../schemas";
import type { LayoutInput } from "../layoutTypes";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CalculatorFormProps {
  defaultValues?: Partial<LayoutInput>;
  onSubmit: (layout: LayoutInput) => void;
  isPending?: boolean;
}

// ---------------------------------------------------------------------------
// Default form state
// ---------------------------------------------------------------------------

const FORM_DEFAULTS: LayoutFormValues = {
  propertyType: "FLAT",
  city: "Delhi",
  bedrooms: 2,
  bathrooms: 2,
  balconies: 1,
  totalFloors: 1,
  approxSqFt: undefined,
  modularKitchen: false,
  acInBedrooms: true,
  acInLivingRoom: true,
  geyserInBathrooms: true,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CalculatorForm({ defaultValues, onSubmit, isPending }: CalculatorFormProps) {
  const form = useForm<LayoutFormValues>({
    resolver: zodResolver(layoutSchema),
    defaultValues: defaultValues
      ? { ...FORM_DEFAULTS, ...defaultValues }
      : FORM_DEFAULTS,
  });

  const propertyType = form.watch("propertyType");

  // Auto-set totalFloors when propertyType changes
  useEffect(() => {
    if (propertyType === "DUPLEX") {
      form.setValue("totalFloors", 2, { shouldValidate: true });
    } else {
      form.setValue("totalFloors", 1, { shouldValidate: true });
    }
  }, [propertyType, form]);

  function handleSubmit(values: LayoutFormValues) {
    onSubmit(values as LayoutInput);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">

        {/* ---------------------------------------------------------------- */}
        {/* Property basics                                                   */}
        {/* ---------------------------------------------------------------- */}
        <div>
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            Property
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Property type */}
            <FormField
              control={form.control}
              name="propertyType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Property Type</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="FLAT">Flat / Apartment</SelectItem>
                      <SelectItem value="BUILDER_FLOOR">Builder Floor</SelectItem>
                      <SelectItem value="DUPLEX">Duplex</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* City: picks the state's three-phase rule (regulatoryPolicy.ts).
                "NCR" from older estimates and presets shows as Delhi, whose
                rule the engine applies to it. */}
            <FormField
              control={form.control}
              name="city"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>City</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={!field.value || field.value === "NCR" ? "Delhi" : field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select city" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {NCR_CITY_OPTIONS.map((city) => (
                        <SelectItem key={city} value={city}>
                          {city}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>Sets your DISCOM&apos;s three-phase rule</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Approximate sq ft */}
            <FormField
              control={form.control}
              name="approxSqFt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Approx. Area (sq ft)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder="e.g. 1200"
                      {...field}
                      value={field.value ?? ""}
                      onChange={(e) =>
                        field.onChange(
                          e.target.value === "" ? undefined : Number(e.target.value)
                        )
                      }
                    />
                  </FormControl>
                  <FormDescription>Optional — for reference only</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <Separator />

        {/* ---------------------------------------------------------------- */}
        {/* Rooms                                                             */}
        {/* ---------------------------------------------------------------- */}
        <div>
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            Rooms
          </h3>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {/* Bedrooms */}
            <FormField
              control={form.control}
              name="bedrooms"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Bedrooms</FormLabel>
                  <Select
                    onValueChange={(v) => field.onChange(Number(v))}
                    value={String(field.value)}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Bathrooms */}
            <FormField
              control={form.control}
              name="bathrooms"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Bathrooms</FormLabel>
                  <Select
                    onValueChange={(v) => field.onChange(Number(v))}
                    value={String(field.value)}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {[1, 2, 3, 4].map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Balconies */}
            <FormField
              control={form.control}
              name="balconies"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Balconies</FormLabel>
                  <Select
                    onValueChange={(v) => field.onChange(Number(v))}
                    value={String(field.value)}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {[0, 1, 2, 3].map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Floors */}
            <FormField
              control={form.control}
              name="totalFloors"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Floors</FormLabel>
                  <Select
                    onValueChange={(v) => field.onChange(Number(v))}
                    value={String(field.value)}
                    disabled={propertyType === "DUPLEX"}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="1">1</SelectItem>
                      <SelectItem value="2">2</SelectItem>
                    </SelectContent>
                  </Select>
                  {propertyType === "DUPLEX" && (
                    <FormDescription>Fixed at 2 for duplex</FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <Separator />

        {/* ---------------------------------------------------------------- */}
        {/* Appliance toggles                                                 */}
        {/* ---------------------------------------------------------------- */}
        <div>
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            Appliances
          </h3>
          <div className="space-y-4">
            <FormField
              control={form.control}
              name="modularKitchen"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-4">
                  <div>
                    <FormLabel className="text-base">Modular Kitchen</FormLabel>
                    <FormDescription>
                      Chimney, hob, and additional countertop points
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="acInBedrooms"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-4">
                  <div>
                    <FormLabel className="text-base">AC in Bedrooms</FormLabel>
                    <FormDescription>
                      Dedicated 15A heavy-load provision per bedroom
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="acInLivingRoom"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-4">
                  <div>
                    <FormLabel className="text-base">AC in Living Room</FormLabel>
                    <FormDescription>
                      Dedicated 15A heavy-load provision in living area
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="geyserInBathrooms"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-4">
                  <div>
                    <FormLabel className="text-base">Geyser in Bathrooms</FormLabel>
                    <FormDescription>
                      Heavy-load provision for geysers in attached bathrooms
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* Submit */}
        <Button type="submit" className="w-full" disabled={isPending}>
          <Zap className="h-4 w-4" />
          {isPending ? "Calculating…" : "Calculate BOM"}
        </Button>
      </form>
    </Form>
  );
}
