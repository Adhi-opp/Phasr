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
import { PRESETS, type Preset } from "../presets";

// ---------------------------------------------------------------------------
// Presets: data in ../presets.ts (checked against the engine by its spec);
// only the icons live here.
// ---------------------------------------------------------------------------

const ICONS: Record<Preset["id"], React.ElementType> = {
  "2BHK": Home,
  "3BHK": Building2,
  DUPLEX: Layers,
};

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
        const Icon = ICONS[preset.id];
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
                  <Icon className="h-5 w-5 text-ink" />
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
