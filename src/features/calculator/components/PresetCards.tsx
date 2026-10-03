"use client";

// src/features/calculator/components/PresetCards.tsx
// ============================================================================
// PRESET CARDS — Quick-start estimation for common property types
// ============================================================================
// Three cards representing the most common NCR residential configurations.
// Each card constructs a valid LayoutInput and passes it to the parent shell.
// Preset values match the validated scenarios from layoutTestScenarios.ts.
// ============================================================================

import { Home, Building2, Layers, Zap, Settings2 } from "lucide-react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { LayoutInput } from "../layoutTypes";

// ---------------------------------------------------------------------------
// Preset definitions — mirroring validated layout scenarios
// Do NOT import from layoutTestScenarios.ts (it has module-level side effects)
// ---------------------------------------------------------------------------

interface Preset {
  id: string;
  label: string;
  subtitle: string;
  specs: string[];
  phase: "Single" | "Three";
  Icon: React.ElementType;
  layout: LayoutInput;
}

const PRESETS: Preset[] = [
  {
    id: "2BHK",
    label: "2 BHK Flat",
    subtitle: "Standard NCR flat",
    specs: ["2 bed · 2 bath · 1 balcony", "~900 sq ft"],
    phase: "Single",
    Icon: Home,
    layout: {
      propertyType: "FLAT",
      city: "NCR",
      bedrooms: 2,
      bathrooms: 2,
      balconies: 1,
      totalFloors: 1,
      approxSqFt: 900,
      modularKitchen: false,
      acInBedrooms: true,
      acInLivingRoom: true,
      geyserInBathrooms: true,
    },
  },
  {
    id: "3BHK",
    label: "3 BHK Flat",
    subtitle: "Mid-range NCR flat",
    specs: ["3 bed · 2 bath · 2 balconies", "~1200 sq ft · Modular kitchen"],
    phase: "Single",
    Icon: Building2,
    layout: {
      propertyType: "FLAT",
      city: "NCR",
      bedrooms: 3,
      bathrooms: 2,
      balconies: 2,
      totalFloors: 1,
      approxSqFt: 1200,
      modularKitchen: true,
      acInBedrooms: true,
      acInLivingRoom: true,
      geyserInBathrooms: true,
    },
  },
  {
    id: "DUPLEX",
    label: "3 BHK Duplex",
    subtitle: "Independent duplex",
    specs: ["3 bed · 3 bath · 2 floors", "~1800 sq ft · Modular kitchen"],
    phase: "Three",
    Icon: Layers,
    layout: {
      propertyType: "DUPLEX",
      city: "NCR",
      bedrooms: 3,
      bathrooms: 3,
      balconies: 1,
      totalFloors: 2,
      approxSqFt: 1800,
      modularKitchen: true,
      acInBedrooms: true,
      acInLivingRoom: true,
      geyserInBathrooms: true,
    },
  },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PresetCardsProps {
  onSelect: (layout: LayoutInput) => void;
  onCustomize: (layout: LayoutInput) => void;
  activePresetId: string | null;
  disabled?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PresetCards({ onSelect, onCustomize, activePresetId, disabled }: PresetCardsProps) {
  return (
    <div className={cn("grid grid-cols-1 gap-4 sm:grid-cols-3", disabled && "pointer-events-none opacity-60")}>
      {PRESETS.map((preset) => {
        const isActive = activePresetId === preset.id;
        return (
          <Card
            key={preset.id}
            className={cn(
              "flex cursor-pointer flex-col transition-all duration-150 hover:shadow-md",
              isActive && "ring-2 ring-ink"
            )}
            onClick={() => onSelect(preset.layout)}
          >
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <div className="rounded-md bg-phase-yellow p-2">
                  <preset.Icon className="h-5 w-5 text-ink" />
                </div>
                <Badge variant={preset.phase === "Three" ? "default" : "secondary"}>
                  {preset.phase} phase
                </Badge>
              </div>
              <CardTitle className="mt-3 text-base">{preset.label}</CardTitle>
              <p className="text-xs text-muted-foreground">{preset.subtitle}</p>
            </CardHeader>

            <CardContent className="flex-1 pb-3">
              <ul className="space-y-1">
                {preset.specs.map((spec) => (
                  <li key={spec} className="text-xs text-muted-foreground">
                    {spec}
                  </li>
                ))}
              </ul>
            </CardContent>

            <CardFooter className="flex gap-2 pt-0">
              <Button
                size="sm"
                className="flex-1"
                disabled={disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(preset.layout);
                }}
              >
                <Zap className="h-3 w-3" />
                Calculate
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  onCustomize(preset.layout);
                }}
              >
                <Settings2 className="h-3 w-3" />
              </Button>
            </CardFooter>
          </Card>
        );
      })}
    </div>
  );
}
