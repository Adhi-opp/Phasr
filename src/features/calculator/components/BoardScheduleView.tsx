// src/features/calculator/components/BoardScheduleView.tsx
// ============================================================================
// DISTRIBUTION BOARD SCHEDULE
// ============================================================================
// The document a homeowner holds up against the actual board to check their
// electrician's work, and the one a dealer reads to see what protection the
// job needs.
//
// Deliberately not a diagram. A drawn board looks impressive and is useless on
// site: it cannot be read on a phone, does not print, and hides the one thing
// that matters — which breaker protects which cable. A numbered schedule is
// what an electrician already works from.
//
// Server component: pure rendering off a pure engine, no interactivity.
// ============================================================================

import { Row, Section, SpecTable } from "@/components/spec-sheet";
import type {
  BoardWay,
  DistributionSchedule,
  RailSummary,
} from "../boardEngine";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const RAIL_LABEL: Record<string, string> = {
  R: "R — Red",
  Y: "Y — Yellow",
  B: "B — Blue",
};

/** Human label for a circuit type key. */
const CIRCUIT_LABEL: Record<string, string> = {
  LIGHTING: "Lighting",
  POWER_5A: "5 A sockets",
  POWER_15A: "15 A sockets",
  HEAVY_APPLIANCE: "Heavy appliance",
  COOKING_RANGE: "Cooking range",
};

function circuitLabel(key: string): string {
  return CIRCUIT_LABEL[key] ?? key.replace(/_/g, " ").toLowerCase();
}

function floorLabel(floor: number): string {
  if (floor === 0) return "GF";
  return `${floor}F`;
}

// ---------------------------------------------------------------------------
// Way rows
// ---------------------------------------------------------------------------

function WayRows({ ways }: { ways: BoardWay[] }) {
  return (
    <>
      {ways.map((way) => (
        <Row key={way.circuitId}>
          <td className="spec-num px-3 py-2 text-slate-400">
            {String(way.wayNumber).padStart(2, "0")}
          </td>
          <td className="px-3 py-2 text-right">
            <span className="spec-num font-semibold text-slate-900">
              {way.ratingAmps} A
            </span>
            <span
              className="ml-1.5 border border-slate-300 px-1 text-[10px] font-semibold text-slate-600"
              title={
                way.curve === "B"
                  ? "Type B — trips at 3–5× rated current, for resistive loads"
                  : "Type C — trips at 5–10× rated current, for inductive inrush"
              }
            >
              {way.curve}
            </span>
          </td>
          <td className="px-3 py-2 text-right text-slate-700">
            <span className="block leading-tight">
              {floorLabel(way.floor)} · {way.roomName}
            </span>
            <span className="block text-[11px] leading-tight text-slate-500">
              {circuitLabel(way.circuitType)} — {way.pointDescription}
            </span>
          </td>
          <td className="spec-num px-3 py-2 text-right text-slate-600">
            {way.sizeSqMm.toFixed(1)} mm²
          </td>
        </Row>
      ))}
    </>
  );
}

const WAY_HEAD = ["Way", "Breaker", "Circuit", "Cable"];

// ---------------------------------------------------------------------------
// Rail block (three-phase)
// ---------------------------------------------------------------------------

function RailBlock({
  rail,
  isHeaviest,
}: {
  rail: RailSummary;
  isHeaviest: boolean;
}) {
  return (
    <div className="border-t border-slate-200 first:border-t-0">
      <div
        className={`flex items-baseline justify-between gap-3 px-3 py-1.5 ${
          isHeaviest ? "bg-amber-50" : "bg-slate-50"
        }`}
      >
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-700">
          {RAIL_LABEL[rail.rail] ?? rail.rail}
        </span>
        <span className="spec-num text-[11px] text-slate-600">
          {rail.ways.length} way{rail.ways.length === 1 ? "" : "s"} ·{" "}
          <span className="font-semibold text-slate-900">
            {rail.connectedAmps} A
          </span>
          {isHeaviest && (
            <span className="ml-1.5 text-amber-700">heaviest</span>
          )}
        </span>
      </div>

      {rail.ways.length === 0 ? (
        <p className="px-3 py-3 text-[13px] text-slate-400">
          No circuits on this rail.
        </p>
      ) : (
        <SpecTable minWidth={520} head={WAY_HEAD}>
          <WayRows ways={rail.ways} />
        </SpecTable>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export function BoardScheduleView({
  schedule,
  sectionIndex = 4,
}: {
  schedule: DistributionSchedule;
  /** Lets the host document keep its section numbering continuous. */
  sectionIndex?: number;
}) {
  const { incomer, supply, rails, ways, balance } = schedule;
  const isThreePhase = supply === "THREE";

  if (ways.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <Section
        index={sectionIndex}
        title="Distribution Board Schedule"
        meta={`${schedule.waysUsed} ways · ${schedule.recommendedDbWays}-way board`}
      >
        {/* ── Incomer ────────────────────────────────────────────────────
            Stated first because it is physically first: everything below
            hangs off it, and it is the one device a homeowner can identify
            without opening anything. */}
        <div className="border-b border-slate-200 bg-white px-3 py-2.5">
          <p className="spec-label">Incomer</p>
          <div className="mt-1.5 space-y-1 text-[13px] leading-snug text-slate-900">
            <p>
              <span className="spec-num font-semibold">
                1 × {incomer.ratingAmps} A {incomer.polesLabel}
              </span>{" "}
              main isolator
              {incomer.upgradedFromStandard && (
                <span className="ml-1.5 text-[11px] text-amber-700">
                  uprated for {incomer.designCurrentAmps} A demand
                </span>
              )}
            </p>
            <p>
              <span className="spec-num font-semibold">
                1 × {incomer.rccb.ratingAmps} A {incomer.rccb.polesLabel} RCCB
              </span>{" "}
              @ {incomer.rccb.sensitivityMa} mA
              <span className="ml-1.5 text-[11px] text-slate-500">
                earth-leakage protection for the whole board
              </span>
            </p>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
            Design current {incomer.designCurrentAmps} A at{" "}
            {isThreePhase ? "415 V three-phase" : "230 V single-phase"}.
            Downstream: {schedule.waysUsed} circuit breakers totalling{" "}
            <span className="spec-num">{schedule.totalConnectedAmps} A</span>{" "}
            connected.
          </p>
        </div>

        {/* ── Ways ───────────────────────────────────────────────────────── */}
        {isThreePhase ? (
          <div>
            <div className="border-b border-slate-200 bg-white px-3 py-2">
              <p className="spec-label">Phase Distribution</p>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                Circuits are assigned heaviest-first to whichever rail is
                lightest at the time, so the three phases draw as evenly as
                possible.
                {balance && balance.spreadAmps > 0 && (
                  <>
                    {" "}
                    Spread is{" "}
                    <span className="spec-num">{balance.spreadAmps} A</span> (
                    {balance.spreadPct}%) between the heaviest and lightest
                    rail.
                  </>
                )}
                {balance && balance.spreadAmps === 0 && (
                  <> All three rails carry an identical connected load.</>
                )}
              </p>
            </div>
            {rails.map((rail) => (
              <RailBlock
                key={rail.rail}
                rail={rail}
                isHeaviest={
                  balance != null &&
                  balance.spreadAmps > 0 &&
                  rail.connectedAmps === balance.maxRailAmps
                }
              />
            ))}
          </div>
        ) : (
          <SpecTable minWidth={520} head={WAY_HEAD}>
            <WayRows ways={ways} />
          </SpecTable>
        )}

        {/* ── Corrections ────────────────────────────────────────────────
            The reason this feature exists. An over-specified breaker will
            not open before the cable is damaged, so every reduction is
            spelled out rather than silently applied. */}
        {schedule.corrections.length > 0 && (
          <div className="border-t border-amber-300 bg-amber-50 px-3 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-amber-800">
              Breaker Ratings Reduced
            </p>
            <ul className="mt-1.5 space-y-1">
              {schedule.corrections.map((c) => (
                <li
                  key={c.circuitId}
                  className="text-[13px] leading-snug text-amber-900"
                >
                  <span className="spec-num">{c.circuitId}</span> — {c.reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        {schedule.warnings.length > 0 && (
          <ul className="divide-y divide-slate-100 border-t border-slate-200">
            {schedule.warnings.map((w, i) => (
              <li
                key={i}
                className="px-3 py-2 text-[13px] leading-relaxed text-slate-600"
              >
                {w}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* ── Disclaimer ───────────────────────────────────────────────────
          Kept as its own boxed note: everything else on this page is a
          procurement estimate, and this is the only section describing how
          the electricity in someone's home is protected, so it must not be
          mistaken for a signed-off design. A 1px rule like the rest of the
          sheet — the old 2px black frame cost a phone screen of space. */}
      <div className="border border-slate-300 bg-white px-3 py-2">
        <p className="text-xs leading-snug text-slate-600">
          <span className="font-semibold text-slate-900">
            Generated board schedule for procurement.
          </span>{" "}
          Must be verified and load-balanced by a CEA-licensed electrical
          contractor prior to installation.
        </p>
      </div>
    </div>
  );
}
