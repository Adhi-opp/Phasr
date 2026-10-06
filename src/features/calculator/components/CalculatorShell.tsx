"use client";

// src/features/calculator/components/CalculatorShell.tsx
// ============================================================================
// CALCULATOR SHELL — Client-side state owner
// ============================================================================
// This is the single "use client" boundary for the entire calculator flow.
// It owns all state and coordinates between PresetCards, CalculatorForm,
// and BOMResultView. The RSC page.tsx renders this and nothing else.
//
// State:
//   site            — city and pin code, merged into every layout run
//   result          — the last BOMResult, null until first calculation
//   lastLayout      — the inputs behind `result`; what we save and re-run from
//   showForm        — toggles between preset view and custom form
//   formDefaults    — pre-populates form when user clicks "Customize"
//   activePresetId  — highlights the active preset card
//   error           — server action error message, null on success
//
// Engine call:
//   runEngine(layout) — calls generateEstimateAction (Server Action).
//   The BOM engine (calculateBOM, generateRoomSpecsFromLayout) executes
//   exclusively on the server. No engine code is sent to the browser.
//   Wrapped in useTransition for React 19 async transition support.
//
// Anonymous visitors:
//   The calculator is public. A logged-out visitor gets the full BOM, and
//   their layout is stashed in localStorage. Clicking a save button records
//   the intent and sends them to /login; on return the estimate is re-run and
//   the save resumes automatically. See @/lib/pending-estimate.
// ============================================================================

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Role } from "@prisma/client";
import { AlertCircle, ChevronDown, ChevronUp, Loader2, SlidersHorizontal, X } from "lucide-react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { createQuoteRequestAction } from "@/features/quotes/actions";
import {
  clearPendingEstimate,
  clearPendingIntent,
  readPendingEstimate,
  writePendingIntent,
  writePendingLayout,
  type SaveIntent,
} from "@/lib/pending-estimate";
import { PresetCards } from "./PresetCards";
import { CalculatorForm } from "./CalculatorForm";
import { BOMResultView } from "./BOMResultView";
import { SiteFields, type Site } from "./SiteFields";
import { generateEstimateAction } from "../actions";
import { pincodeIssue } from "../pincode";
import { NCR_CITY_OPTIONS } from "../regulatoryPolicy";
import { formatBomForWhatsApp, whatsappShareUrl } from "../whatsappExport";
import type { EnrichedBOMResult } from "../costEngine";
import type { EstimateActionErrorCode } from "../actions";
import type { LayoutInput } from "../layoutTypes";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/** A stored city the site select can show; anything else, "NCR" included, reads as Delhi. */
function siteCity(city: string | undefined): string {
  return city && (NCR_CITY_OPTIONS as readonly string[]).includes(city) ? city : "Delhi";
}

function coerceSessionRole(role: unknown): Role | undefined {
  switch (role) {
    case Role.HOMEOWNER:
    case Role.DEALER:
    case Role.ADMIN:
      return role;
    default:
      return undefined;
  }
}

export function CalculatorShell() {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const normalizedSessionRole = coerceSessionRole(session?.user?.role);

  const [result, setResult] = useState<EnrichedBOMResult | null>(null);
  const [lastLayout, setLastLayout] = useState<LayoutInput | null>(null);
  const [error, setError] = useState<{
    message: string;
    code: EstimateActionErrorCode;
    missingCodes?: string[];
  } | null>(null);
  const [isSavingProject, setIsSavingProject] = useState(false);
  const [activeSaveMode, setActiveSaveMode] = useState<"DRAFT" | "OPEN" | null>(null);
  const [saveFeedback, setSaveFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formDefaults, setFormDefaults] = useState<Partial<LayoutInput> | undefined>(undefined);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [site, setSite] = useState<Site>({ city: "Delhi", pincode: "" });
  // Set when an estimate is first asked for, so an empty pin code is flagged
  // then rather than the moment the page opens.
  const [siteAttempted, setSiteAttempted] = useState(false);
  const pincodeRef = useRef<HTMLInputElement>(null);

  const siteIssue = pincodeIssue(site.pincode, site.city);
  // A half-typed pin code is not an error yet. A complete one, or one an
  // estimate was asked for, is checked.
  const shownSiteIssue = siteIssue && (siteAttempted || site.pincode.length === 6) ? siteIssue : null;

  const resultRef = useRef<HTMLDivElement>(null);

  // One-shot guards: restore the stash once, resume a pending save once.
  const hydratedRef = useRef(false);
  const resumedRef = useRef(false);

  // -------------------------------------------------------------------------
  // Engine runner — delegates to Server Action; engine never runs in browser
  // -------------------------------------------------------------------------

  const runEngine = useCallback(
    (layout: LayoutInput, options?: { scroll?: boolean }) => {
      const shouldScroll = options?.scroll ?? true;
      setError(null);
      setSaveFeedback(null);
      startTransition(async () => {
        const res = await generateEstimateAction(layout);
        if (res.success) {
          setResult(res.data);
          setLastLayout(layout);
          // Survive a trip through /login, and a closed tab.
          writePendingLayout(layout);
          if (shouldScroll) {
            requestAnimationFrame(() => {
              resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
            });
          }
        } else {
          setError({
            message: res.error,
            code: res.errorCode,
            missingCodes: res.missingCodes,
          });
        }
      });
    },
    []
  );

  const handleSaveProject = useCallback(
    async (status: SaveIntent, layoutOverride?: LayoutInput) => {
      const layout = layoutOverride ?? lastLayout;
      if (!layout || isSavingProject) return false;

      setSaveFeedback(null);
      setIsSavingProject(true);
      setActiveSaveMode(status);
      try {
        // The server re-runs the engine from this layout and derives the
        // price itself — we deliberately do not send the computed BOM.
        const saved = await createQuoteRequestAction(layout, status);
        if (saved.success) {
          clearPendingEstimate();
          toast.success(
            status === "DRAFT"
              ? "Project saved to your dashboard."
              : "Quote request published to verified dealers."
          );
          return true;
        }

        setSaveFeedback({ type: "error", message: saved.error });
        return false;
      } catch {
        setSaveFeedback({
          type: "error",
          message: "Failed to save project. Please try again.",
        });
        return false;
      } finally {
        setIsSavingProject(false);
        setActiveSaveMode(null);
      }
    },
    [isSavingProject, lastLayout]
  );

  // -------------------------------------------------------------------------
  // Anonymous → authenticated handover
  // -------------------------------------------------------------------------

  /**
   * Logged-out visitor clicked a save button: remember what they wanted,
   * then send them to login. The effect below finishes the job on return.
   */
  function handleRequestAuth(intent: SaveIntent) {
    if (lastLayout) writePendingIntent(lastLayout, intent);
    router.push(`/login?callbackUrl=${encodeURIComponent("/calculator")}`);
  }

  // Restore a stashed layout once on mount and re-run it at current rates.
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;

    const pending = readPendingEstimate();
    if (!pending) return;

    setFormDefaults(pending.layout);
    setSite({ city: siteCity(pending.layout.city), pincode: pending.layout.pincode ?? "" });
    runEngine(pending.layout, { scroll: false });
  }, [runEngine]);

  // Resume the save the visitor started before logging in.
  useEffect(() => {
    if (resumedRef.current) return;
    if (sessionStatus !== "authenticated") return;
    // Wait for the restored estimate to come back before saving.
    if (!result || !lastLayout) return;

    const pending = readPendingEstimate();
    if (!pending?.intent) return;

    resumedRef.current = true;

    // Dealers cannot own projects — drop the intent rather than erroring.
    if (normalizedSessionRole === Role.DEALER) {
      clearPendingIntent();
      return;
    }

    const intent = pending.intent;
    clearPendingIntent();

    void handleSaveProject(intent, lastLayout).then((ok) => {
      if (ok) router.push("/dashboard");
    });
  }, [
    sessionStatus,
    result,
    lastLayout,
    normalizedSessionRole,
    handleSaveProject,
    router,
  ]);

  // -------------------------------------------------------------------------
  // Site
  // -------------------------------------------------------------------------

  /** Runs a layout for the current site, or sends the visitor to the pin code first. */
  function runForSite(layout: LayoutInput): boolean {
    setSiteAttempted(true);
    if (siteIssue) {
      pincodeRef.current?.focus();
      return false;
    }
    runEngine({ ...layout, city: site.city, pincode: site.pincode });
    return true;
  }

  function handleSiteChange(next: Site) {
    setSite(next);
    // Keep a result on screen true to the site: run it again once the new
    // site is complete. A new city can change the supply rule, and the board.
    if (
      lastLayout &&
      pincodeIssue(next.pincode, next.city) === null &&
      (next.city !== lastLayout.city || next.pincode !== lastLayout.pincode)
    ) {
      runEngine({ ...lastLayout, city: next.city, pincode: next.pincode }, { scroll: false });
    }
  }

  // -------------------------------------------------------------------------
  // Preset handlers
  // -------------------------------------------------------------------------

  function handlePresetSelect(layout: LayoutInput) {
    if (!runForSite(layout)) return;
    // Determine preset ID from layout for ring highlight
    const id =
      layout.propertyType === "DUPLEX"
        ? "DUPLEX"
        : layout.bedrooms === 2
        ? "2BHK"
        : "3BHK";
    setActivePresetId(id);
    setShowForm(false);
  }

  function handlePresetCustomize(layout: LayoutInput) {
    setFormDefaults(layout);
    setActivePresetId(null);
    setShowForm(true);
  }

  // -------------------------------------------------------------------------
  // Form handlers
  // -------------------------------------------------------------------------

  function handleFormSubmit(layout: LayoutInput) {
    if (!runForSite(layout)) return;
    setActivePresetId(null);
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-8">
      {/* ------------------------------------------------------------------ */}
      {/* Site: city and pin code, for presets and the form alike             */}
      {/* ------------------------------------------------------------------ */}
      <section>
        <SiteFields
          value={site}
          onChange={handleSiteChange}
          issue={shownSiteIssue}
          pincodeRef={pincodeRef}
        />
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Section 1: Presets                                                  */}
      {/* ------------------------------------------------------------------ */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Quick Presets</h2>
            <p className="text-sm text-muted-foreground">
              Pick a common property type to get an instant BOM estimate.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setShowForm((prev) => !prev);
              if (!showForm) setFormDefaults(undefined);
            }}
          >
            <SlidersHorizontal className="h-4 w-4" />
            {showForm ? "Hide Form" : "Custom"}
            {showForm ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </Button>
        </div>

        <PresetCards
          onSelect={handlePresetSelect}
          onCustomize={handlePresetCustomize}
          activePresetId={activePresetId}
          disabled={isPending}
        />
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Section 2: Custom form (collapsible)                                */}
      {/* ------------------------------------------------------------------ */}
      {showForm && (
        <section>
          <Separator className="mb-6" />
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Custom Configuration</h2>
              <p className="text-sm text-muted-foreground">
                Fine-tune the property details for a precise estimate.
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowForm(false)}
              aria-label="Close form"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="rounded-lg border p-6">
            <CalculatorForm
              defaultValues={formDefaults}
              onSubmit={handleFormSubmit}
              isPending={isPending}
            />
          </div>
        </section>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Error banner                                                        */}
      {/* ------------------------------------------------------------------ */}
      {error && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="space-y-1">
            <p>{error.message}</p>
            {error.code === "PRICING_DATA_MISSING" && error.missingCodes && error.missingCodes.length > 0 && (
              <p className="text-xs">
                Missing price codes: {error.missingCodes.join(", ")}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Section 3: Result                                                   */}
      {/* ------------------------------------------------------------------ */}
      {(isPending || result) && (
        <section ref={resultRef}>
          <Separator className="mb-6" />

          {/* First calculation — no prior result, show full-area spinner */}
          {isPending && !result && (
            <div className="flex items-center justify-center gap-3 py-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Calculating estimate…</span>
            </div>
          )}

          {/* Result — dimmed + spinner badge while recalculating, full when idle */}
          {result && (
            <div className={isPending ? "pointer-events-none opacity-50 transition-opacity" : "transition-opacity"}>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Bill of Materials</h2>
                  <p className="text-sm text-muted-foreground">
                    {lastLayout?.pincode ? `${siteCity(lastLayout.city)} ${lastLayout.pincode} · ` : ""}
                    {result.circuits.length > 0
                      ? `${result.totalCircuits} circuits · aligned with IS 732 practice · estimate only`
                      : "No circuits generated"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                  {/* The material list as a WhatsApp chit — for sending to a
                      dealer directly, with or without an account. */}
                  <Button variant="outline" size="sm" className="h-8 text-xs" asChild>
                    <a
                      href={whatsappShareUrl(
                        formatBomForWhatsApp(result, process.env.NEXT_PUBLIC_APP_URL)
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Export WhatsApp Spec
                    </a>
                  </Button>
                </div>
              </div>
              <BOMResultView
                result={result}
                sessionStatus={sessionStatus}
                sessionRole={normalizedSessionRole}
                onSaveProject={handleSaveProject}
                onRequestAuth={handleRequestAuth}
                isSavingProject={isSavingProject}
                activeSaveMode={activeSaveMode}
                saveFeedback={saveFeedback}
              />
            </div>
          )}
        </section>
      )}
    </div>
  );
}
