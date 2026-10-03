"use client";

// src/features/calculator/components/BOMResultView.tsx
// ============================================================================
// BOM SPEC SHEET
// ============================================================================
// Read by homeowners checking a quote and by dealers pricing one, so density
// beats decoration: tabular figures, 1px rules, tight padding, no card
// shadows. Quantities are shown the way they are actually bought — coils, not
// loose metres — because "450 m of 2.5 sq mm" is not something anyone can
// order over a counter.
//
// In the order a job is specified:
//   1. Power load & service   — what the supply has to carry
//   ·  Market audit           — the only cost summary: reference price and
//                               the fair ceiling a quote is checked against
//   2. Cable schedule         — what gets pulled
//   3. Conduit & distribution — what it runs through and terminates in
//   4. Board schedule         — which breaker protects what
//
// Materials only throughout. VoltFlow does not price labour.
//
// Circuit schedule and per-room load sit below, collapsed by default.
// ============================================================================

import type { Role } from "@prisma/client";
import { AlertTriangle, ChevronDown, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BusyLabel } from "@/components/busy-label";
import { CountUp } from "@/components/count-up";
import { Metric, Row, Section, SpecTable } from "@/components/spec-sheet";
import { buildDistributionSchedule } from "../boardEngine";
import { BOQ_DISCLAIMER } from "../constants";
import { BoardScheduleView } from "./BoardScheduleView";
import { MarketAuditPane } from "./MarketAuditPane";
import type { EnrichedBOMResult } from "../costEngine";
import type { BOMItem } from "../type";

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function formatKw(kw: number): string {
  return `${kw.toFixed(2)} kW`;
}

function gaugeLabel(sizeSqMm: number): string {
  return `${sizeSqMm.toFixed(1)} mm²`;
}

// ---------------------------------------------------------------------------
// Section 1 — Power load & service
// ---------------------------------------------------------------------------

function PowerLoad({ result }: { result: EnrichedBOMResult }) {
  const isThreePhase = result.phaseDecision.finalRecommendation === "THREE";

  return (
    <Section index={1} title="Power Load & Service" meta="Diversified per IS 732">
      {/* The two loads count up; supply and circuit count are facts, not
          magnitudes, and animating them would be decoration. Cost lives in
          the market audit below — this section carries none. */}
      <div className="grid grid-cols-2 divide-y divide-slate-200 sm:grid-cols-4 sm:divide-y-0">
        <Metric
          label="Connected Load"
          value={<CountUp value={result.totalConnectedLoadKw} format={formatKw} />}
        />
        <Metric
          label="Max Demand"
          value={<CountUp value={result.maxDemandKw} format={formatKw} />}
        />
        <Metric
          label="Supply"
          value={isThreePhase ? "3-Phase" : "1-Phase"}
          accent={isThreePhase}
        />
        <Metric label="Circuits" value={String(result.totalCircuits)} />
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Section 2 — Cable schedule
// ---------------------------------------------------------------------------

function CableSchedule({ items }: { items: BOMItem[] }) {
  const cables = items.filter(
    (i) => i.category === "WIRE" || i.category === "EARTH_WIRE"
  );

  if (cables.length === 0) {
    return (
      <Section index={2} title="Cable Schedule">
        <p className="px-3 py-6 text-center text-sm text-slate-500">
          No cable lines generated.
        </p>
      </Section>
    );
  }

  const totalCoils = cables.reduce((sum, c) => sum + c.coilsRequired, 0);

  return (
    <Section index={2} title="Cable Schedule" meta={`${totalCoils} coils total`}>
      {/* No purpose column: the engine merges every run of one gauge into a
          single line, so a gauge has no one purpose to show. */}
      <SpecTable head={["Gauge", "Required", "Purchase", "Surplus"]} minWidth={420}>
        {cables.map((cable, idx) => (
          <Row key={idx}>
            <td className="px-3 py-2">
              <span className="spec-num font-semibold text-slate-900">
                {gaugeLabel(cable.sizeSqMm)}
              </span>
              {cable.category === "EARTH_WIRE" && (
                <span className="ml-1.5 text-[11px] uppercase tracking-wide text-emerald-700">
                  Earth
                </span>
              )}
            </td>
            <td className="spec-num px-3 py-2 text-right text-slate-600">
              {cable.totalMeters.toFixed(0)} m
            </td>
            <td className="px-3 py-2 text-right">
              <span className="spec-num font-semibold text-slate-900">
                {cable.coilsRequired} × {cable.coilLengthMeters} m
              </span>
              <span className="ml-1 text-slate-400">coil</span>
            </td>
            <td className="spec-num px-3 py-2 text-right text-slate-500">
              {cable.surplusMeters.toFixed(0)} m
            </td>
          </Row>
        ))}
      </SpecTable>
      <p className="border-t border-slate-200 px-3 py-2 text-xs text-slate-500">
        Cable is sold in full coils. &ldquo;Purchase&rdquo; is what you actually buy;
        surplus is the offcut you keep.
      </p>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Section 3 — Conduit & distribution
// ---------------------------------------------------------------------------

function ConduitAndDistribution({ items }: { items: BOMItem[] }) {
  const conduit = items.filter((i) => i.category === "CONDUIT");
  const protection = items.filter(
    (i) =>
      i.category === "MCB" ||
      i.category === "RCCB" ||
      i.category === "MAIN_SWITCH" ||
      i.category === "DB"
  );
  const accessories = items.filter((i) => i.category === "SWITCHGEAR");

  const conduitMeters = conduit.reduce((s, c) => s + c.totalMeters, 0);

  return (
    <Section
      index={3}
      title="Conduit & Distribution"
      meta={`${conduitMeters.toFixed(0)} m conduit`}
    >
      <SpecTable head={["Item", "Spec", "Qty"]}>
        {conduit.map((c, idx) => (
          <Row key={`c-${idx}`}>
            <td className="px-3 py-2 text-slate-900">PVC Conduit</td>
            <td className="px-3 py-2 text-right text-slate-600">{c.sizeMm}</td>
            <td className="spec-num px-3 py-2 text-right font-semibold text-slate-900">
              {c.totalMeters.toFixed(0)} m
            </td>
          </Row>
        ))}
        {protection.map((p, idx) => (
          <Row key={`p-${idx}`}>
            <td className="px-3 py-2 text-slate-900">
              {p.category === "MAIN_SWITCH"
                ? "Main Switch"
                : p.category === "DB"
                  ? "Distribution Board"
                  : p.category}
            </td>
            <td className="px-3 py-2 text-right text-slate-600">
              {p.category === "MCB"
                ? `${p.ratingAmps}A Type ${p.type}`
                : p.category === "RCCB"
                  ? `${p.ratingAmps}A / ${p.sensitivityMa} mA / ${p.poles}P`
                  : p.category === "MAIN_SWITCH"
                    ? `${p.ratingAmps}A / ${p.poles}P`
                    : `${p.ways}-way`}
            </td>
            <td className="spec-num px-3 py-2 text-right font-semibold text-slate-900">
              {p.quantity}
            </td>
          </Row>
        ))}
        {accessories.map((a, idx) => (
          <Row key={`a-${idx}`}>
            <td className="px-3 py-2 text-slate-900">{a.description}</td>
            <td className="px-3 py-2 text-right text-slate-600">Modular</td>
            <td className="spec-num px-3 py-2 text-right font-semibold text-slate-900">
              {a.quantity}
            </td>
          </Row>
        ))}
      </SpecTable>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Save / auth actions
// ---------------------------------------------------------------------------

type SessionStatus = "loading" | "authenticated" | "unauthenticated";

interface SaveFeedback {
  type: "success" | "error";
  message: string;
}

function ActionBar({
  sessionStatus,
  sessionRole,
  onSaveProject,
  onRequestAuth,
  isSavingProject,
  activeSaveMode,
  saveFeedback,
}: {
  sessionStatus: SessionStatus;
  sessionRole: Role | undefined;
  onSaveProject: (status: "DRAFT" | "OPEN") => void;
  onRequestAuth: (intent: "DRAFT" | "OPEN") => void;
  isSavingProject: boolean;
  activeSaveMode: "DRAFT" | "OPEN" | null;
  saveFeedback: SaveFeedback | null;
}) {
  const isDealer = sessionStatus === "authenticated" && sessionRole === "DEALER";
  const canSave = sessionStatus === "authenticated" && !isDealer;

  return (
    <div className="border border-slate-200 bg-slate-50 px-3 py-3">
      {sessionStatus === "loading" && (
        <Button disabled className="w-full">
          Checking account…
        </Button>
      )}

      {sessionStatus === "unauthenticated" && (
        <div className="space-y-2">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => onRequestAuth("DRAFT")}
              className="flex-1 bg-white"
            >
              Save as Draft
            </Button>
            <Button onClick={() => onRequestAuth("OPEN")} className="flex-1">
              Request Dealer Quotes
            </Button>
          </div>
          <p className="text-xs text-slate-500">
            Sign in to continue — this spec is kept and picks up where you left off.
          </p>
        </div>
      )}

      {isDealer && (
        <div className="space-y-1.5">
          <Button disabled className="w-full">
            Request Dealer Quotes
          </Button>
          <p className="text-xs text-slate-500">
            Dealer accounts quote on requests rather than creating them.
          </p>
        </div>
      )}

      {canSave && (
        <div className="flex flex-col gap-2 sm:flex-row">
          {/* Both disabled while either save runs: a second click would
              create a second project. */}
          <Button
            variant="outline"
            onClick={() => onSaveProject("DRAFT")}
            disabled={isSavingProject}
            aria-busy={isSavingProject && activeSaveMode === "DRAFT"}
            className="flex-1 bg-white"
          >
            <BusyLabel busy={isSavingProject && activeSaveMode === "DRAFT"} busyText="Saving…">
              Save as Draft
            </BusyLabel>
          </Button>
          <Button
            onClick={() => onSaveProject("OPEN")}
            disabled={isSavingProject}
            aria-busy={isSavingProject && activeSaveMode === "OPEN"}
            className="flex-1"
          >
            <BusyLabel busy={isSavingProject && activeSaveMode === "OPEN"} busyText="Publishing…">
              Request Dealer Quotes
            </BusyLabel>
          </Button>
        </div>
      )}

      {saveFeedback && (
        <p
          className={`mt-2 border px-3 py-2 text-sm ${
            saveFeedback.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-destructive/40 bg-destructive/10 text-destructive"
          }`}
        >
          {saveFeedback.message}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Notices
// ---------------------------------------------------------------------------

function PhaseNotice({ result }: { result: EnrichedBOMResult }) {
  const isOverride =
    result.phaseDecision.regulatoryRecommendation === "THREE" &&
    result.phaseDecision.engineeringRecommendation === "SINGLE";

  if (!isOverride) return null;

  return (
    <div className="flex gap-2.5 border border-slate-200 bg-white px-3 py-2.5 text-xs leading-relaxed text-slate-600">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
      <p>
        <span className="font-medium text-slate-900">3-Phase recommended.</span>{" "}
        Engineering demand is within single-phase limits (
        <span className="spec-num">{formatKw(result.maxDemandKw)}</span>), but{" "}
        {result.phaseDecision.regulatoryPolicyKey} DISCOM policy typically requires
        3-phase above{" "}
        <span className="spec-num">
          {result.phaseDecision.connectedLoadThresholdKw.toFixed(1)} kW
        </span>{" "}
        connected load. Yours is{" "}
        <span className="spec-num">{formatKw(result.totalConnectedLoadKw)}</span>.
      </p>
    </div>
  );
}

function isPhaseWarning(warning: string): boolean {
  const n = warning.toLowerCase();
  return (
    n.startsWith("3-phase recommended:") ||
    n.includes("three-phase supply recommended") ||
    n.includes("single-phase supply is sufficient")
  );
}

function Notices({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;

  return (
    <Collapsible defaultOpen={false}>
      <div className="border border-amber-200 bg-amber-50">
        <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2">
          <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-amber-800">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
            {warnings.length} notice{warnings.length !== 1 ? "s" : ""}
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-amber-600 transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ul className="space-y-1 border-t border-amber-200 px-3 pb-2.5 pt-2">
            {warnings.map((w, i) => (
              <li key={i} className="text-xs leading-relaxed text-amber-900">
                {w}
              </li>
            ))}
          </ul>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

// ---------------------------------------------------------------------------
// Engineering detail (collapsed)
// ---------------------------------------------------------------------------

function CircuitSchedule({ result }: { result: EnrichedBOMResult }) {
  return (
    <SpecTable head={["Circuit", "Room", "Gauge", "MCB", "Points", "Cable"]}>
      {result.circuits.map((c) => (
        <Row key={c.circuitId}>
          <td className="spec-num px-3 py-2 text-[11px] text-slate-500">
            {c.circuitId}
          </td>
          <td className="px-3 py-2 text-right text-slate-900">{c.roomName}</td>
          <td className="spec-num px-3 py-2 text-right text-slate-600">
            {c.wireGauge.replace("SQ_MM_", "").replace("_", ".")} mm²
          </td>
          <td className="spec-num px-3 py-2 text-right text-slate-600">
            {c.mcbRatingAmps}A
          </td>
          <td className="spec-num px-3 py-2 text-right text-slate-600">
            {c.pointCount}
          </td>
          <td className="spec-num px-3 py-2 text-right text-slate-900">
            {c.wireLengthMeters.toFixed(1)} m
          </td>
        </Row>
      ))}
    </SpecTable>
  );
}

function RoomLoad({ result }: { result: EnrichedBOMResult }) {
  return (
    <SpecTable head={["Room", "Lighting", "Power", "Heavy", "Connected", "Demand"]}>
      {result.loadBreakdown.map((r) => (
        <Row key={r.roomId}>
          <td className="px-3 py-2 font-medium text-slate-900">{r.roomName}</td>
          <td className="spec-num px-3 py-2 text-right text-slate-600">
            {r.lightingLoadWatts} W
          </td>
          <td className="spec-num px-3 py-2 text-right text-slate-600">
            {r.powerLoadWatts} W
          </td>
          <td className="spec-num px-3 py-2 text-right text-slate-600">
            {r.heavyLoadWatts} W
          </td>
          <td className="spec-num px-3 py-2 text-right text-slate-900">
            {(r.totalConnectedLoadWatts / 1000).toFixed(2)} kW
          </td>
          <td className="spec-num px-3 py-2 text-right font-semibold text-emerald-700">
            {(r.diversifiedDemandWatts / 1000).toFixed(2)} kW
          </td>
        </Row>
      ))}
    </SpecTable>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

interface BOMResultViewProps {
  result: EnrichedBOMResult;
  sessionStatus: SessionStatus;
  sessionRole: Role | undefined;
  onSaveProject: (status: "DRAFT" | "OPEN") => void;
  onRequestAuth: (intent: "DRAFT" | "OPEN") => void;
  isSavingProject: boolean;
  activeSaveMode: "DRAFT" | "OPEN" | null;
  saveFeedback: SaveFeedback | null;
}

export function BOMResultView({
  result,
  sessionStatus,
  sessionRole,
  onSaveProject,
  onRequestAuth,
  isSavingProject,
  activeSaveMode,
  saveFeedback,
}: BOMResultViewProps) {
  const isOverride =
    result.phaseDecision.regulatoryRecommendation === "THREE" &&
    result.phaseDecision.engineeringRecommendation === "SINGLE";
  const notices = isOverride
    ? result.warnings.filter((w) => !isPhaseWarning(w))
    : result.warnings;

  // Section 4. Sits after the parts schedules because it is the design that
  // those parts realise — you buy the breakers above, then this says which
  // one protects what.
  const schedule = buildDistributionSchedule({
    circuits: result.circuits,
    supply: result.phaseDecision.finalRecommendation,
    maxDemandKw: result.maxDemandKw,
  });

  return (
    <div className="sheet-enter space-y-3">
      <PowerLoad result={result} />
      {/* The only cost summary on the sheet, directly above the parts tables
          whose prices it adds up. */}
      <MarketAuditPane pricing={result.pricing} />
      <CableSchedule items={result.items} />
      <ConduitAndDistribution items={result.items} />
      <BoardScheduleView schedule={schedule} sectionIndex={4} />

      <ActionBar
        sessionStatus={sessionStatus}
        sessionRole={sessionRole}
        onSaveProject={onSaveProject}
        onRequestAuth={onRequestAuth}
        isSavingProject={isSavingProject}
        activeSaveMode={activeSaveMode}
        saveFeedback={saveFeedback}
      />

      <PhaseNotice result={result} />
      <Notices warnings={notices} />

      <Collapsible defaultOpen={false}>
        <div className="border border-slate-200 bg-white">
          <CollapsibleTrigger className="flex w-full items-center justify-between border-b border-transparent px-3 py-2 data-[state=open]:border-slate-200">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Engineering Detail
            </span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <Tabs defaultValue="circuits" className="px-3 py-3">
              <TabsList className="w-full sm:w-auto">
                <TabsTrigger value="circuits" className="flex-1 sm:flex-none">
                  Circuit Schedule
                </TabsTrigger>
                <TabsTrigger value="load" className="flex-1 sm:flex-none">
                  Room Load
                </TabsTrigger>
              </TabsList>
              <TabsContent value="circuits" className="mt-3 border border-slate-200">
                <CircuitSchedule result={result} />
              </TabsContent>
              <TabsContent value="load" className="mt-3 border border-slate-200">
                <RoomLoad result={result} />
              </TabsContent>
            </Tabs>
          </CollapsibleContent>
        </div>
      </Collapsible>

      {/* Fine print: proportional type, no box. Monospace ran the same
          sentence to five lines on a phone. */}
      <footer className="pt-1 text-xs leading-snug text-slate-500">
        {/* The constant, not result.disclaimer: a saved estimate carries the
            wording it was generated with, and the page must show today's. */}
        <p>{BOQ_DISCLAIMER}</p>
      </footer>
    </div>
  );
}
