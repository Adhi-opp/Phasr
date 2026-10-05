"use client";

// src/features/analytics/DemandByGaugeChart.tsx
// ============================================================================
// PROJECTED CABLE DEMAND BY GAUGE — CHART
// ============================================================================
// Grouped columns: one group per pin code, one column per gauge. Plain HTML,
// no chart library: three groups of three bars do not need one, and every
// value is also in the table underneath, so nothing depends on hover.
//
// Gauge is an ordered scale (cross-section), so the series take one blue
// ramp, thin to thick = light to dark: steps 300 / 450 / 650 of the reference
// ramp, validated as an ordinal ramp against white (light end 2.50:1, so the
// labels under each bar and the table carry identity as well as colour).
// Light only, like the rest of the site.
// ============================================================================

import { useState } from "react";
import {
  DEMAND_COIL_METRES,
  DEMAND_GAUGES,
  GAUGE_INFO,
  type DemandGauge,
  type PinDemand,
} from "./demandSample";

const SERIES_COLOR: Record<DemandGauge, string> = {
  "1.5": "#6da7ec",
  "2.5": "#2a78d6",
  "4.0": "#104281",
};

const SHORT_LABEL: Record<DemandGauge, string> = { "1.5": "1.5", "2.5": "2.5", "4.0": "4" };

const PLOT_HEIGHT_PX = 220;

const number = new Intl.NumberFormat("en-IN");

/** Round tick step: 1, 2, 2.5 or 5 × a power of ten, about four ticks. */
function niceStep(max: number): number {
  const rough = max / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

function km(coils: number): string {
  return `${((coils * DEMAND_COIL_METRES) / 1000).toFixed(1)} km`;
}

type Active = { pin: string; gauge: DemandGauge } | null;

export function DemandByGaugeChart({ data }: { data: PinDemand[] }) {
  const [active, setActive] = useState<Active>(null);

  const max = Math.max(...data.flatMap((d) => DEMAND_GAUGES.map((g) => d.byGauge[g].coils)));
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step);

  return (
    <figure className="border border-neutral-300 bg-white p-4 sm:p-5">
      <figcaption>
        <span className="block text-[15px] font-semibold text-ink">Projected cable demand by gauge</span>
        <span className="mt-0.5 block text-[13px] leading-relaxed text-neutral-600">
          90 m coils, from one illustrative month of estimates in three NCR pin codes. The estimate
          mix is sample data; the coil counts are the engine&apos;s real output for it.
        </span>
      </figcaption>

      {/* Legend: the dependable identity channel for three series. */}
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[12px] text-neutral-700">
        {DEMAND_GAUGES.map((g) => (
          <li key={g} className="flex items-center gap-1.5">
            <span aria-hidden="true" className="size-2.5 rounded-[2px]" style={{ backgroundColor: SERIES_COLOR[g] }} />
            <span>
              <span className="font-medium text-ink">{GAUGE_INFO[g].label}</span> · {GAUGE_INFO[g].use}
            </span>
          </li>
        ))}
      </ul>

      {/* Plot */}
      <div className="mt-5 flex gap-2">
        {/* Y axis */}
        <div aria-hidden="true" className="relative w-9 shrink-0 text-right" style={{ height: PLOT_HEIGHT_PX }}>
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute right-0 -translate-y-1/2 text-[11px] tabular-nums leading-none text-neutral-500"
              style={{ bottom: `${(t / top) * 100}%` }}
            >
              {number.format(t)}
            </span>
          ))}
        </div>

        <div className="relative min-w-0 flex-1">
          {/* Gridlines: solid hairlines, the baseline one step darker. */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0" style={{ height: PLOT_HEIGHT_PX }}>
            {ticks.map((t) => (
              <span
                key={t}
                className="absolute inset-x-0 h-px"
                style={{ bottom: `${(t / top) * 100}%`, backgroundColor: t === 0 ? "#c3c2b7" : "#e1e0d9" }}
              />
            ))}
          </div>

          <div className="relative flex justify-around">
            {data.map((d) => (
              <div key={d.pin} className="flex flex-col items-center">
                <div className="relative flex items-end gap-[2px]" style={{ height: PLOT_HEIGHT_PX }}>
                  {DEMAND_GAUGES.map((g, i) => {
                    const value = d.byGauge[g].coils;
                    const isActive = active?.pin === d.pin && active.gauge === g;
                    const label = `${d.pin} ${d.area}, ${GAUGE_INFO[g].label}: ${number.format(value)} coils`;
                    return (
                      // The whole column is the hit target, not just the painted bar.
                      <div
                        key={g}
                        role="img"
                        aria-label={label}
                        tabIndex={0}
                        onPointerEnter={() => setActive({ pin: d.pin, gauge: g })}
                        onPointerLeave={() => setActive(null)}
                        onFocus={() => setActive({ pin: d.pin, gauge: g })}
                        onBlur={() => setActive(null)}
                        className="relative flex h-full w-5 items-end outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                      >
                        <span
                          className={`block w-full rounded-t-[4px] transition-[filter] duration-100 ${isActive ? "brightness-125" : ""}`}
                          style={{ height: `${(value / top) * 100}%`, backgroundColor: SERIES_COLOR[g] }}
                        />
                        {isActive && <Tooltip demand={d} gauge={g} bottomPct={(value / top) * 100} index={i} />}
                      </div>
                    );
                  })}
                </div>

                {/* Gauge under each bar: identity never rests on colour alone. */}
                <div aria-hidden="true" className="mt-1 flex gap-[2px]">
                  {DEMAND_GAUGES.map((g) => (
                    <span key={g} className="w-5 text-center text-[10px] leading-none text-neutral-500">
                      {SHORT_LABEL[g]}
                    </span>
                  ))}
                </div>
                <span className="mt-2 text-[12px] font-semibold tabular-nums text-ink">{d.pin}</span>
                <span className="text-[11px] text-neutral-600">{d.area}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* The table twin: every value, no hover needed. Sized to fit a 390 px
          phone without scrolling sideways. */}
      <div className="mt-5 overflow-x-auto">
        <table className="w-full text-left text-[11px] sm:text-[12px]">
          <caption className="sr-only">Projected cable demand by gauge, in 90 m coils, per pin code</caption>
          <thead className="border-b border-neutral-300 align-bottom text-neutral-600">
            <tr>
              <th scope="col" className="py-1.5 pr-2 font-medium">Pin code</th>
              <th scope="col" className="py-1.5 pr-2 text-right font-medium">Estimates</th>
              {DEMAND_GAUGES.map((g) => (
                <th key={g} scope="col" className="py-1.5 pr-2 text-right font-medium">
                  {GAUGE_INFO[g].label}
                </th>
              ))}
              <th scope="col" className="py-1.5 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {data.map((d) => {
              const total = DEMAND_GAUGES.reduce((n, g) => n + d.byGauge[g].coils, 0);
              return (
                <tr key={d.pin} className="border-b border-neutral-200 align-top">
                  <th scope="row" className="py-1.5 pr-2 font-medium text-ink">
                    {d.pin}
                    <span className="block font-normal text-neutral-600">{d.area}</span>
                  </th>
                  <td className="py-1.5 pr-2 text-right text-neutral-700">{d.estimates}</td>
                  {DEMAND_GAUGES.map((g) => (
                    <td key={g} className="py-1.5 pr-2 text-right text-ink">
                      {number.format(d.byGauge[g].coils)}
                    </td>
                  ))}
                  <td className="py-1.5 text-right text-ink">
                    {number.format(total)}
                    <span className="block text-neutral-500">{km(total)}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

function Tooltip({
  demand,
  gauge,
  bottomPct,
  index,
}: {
  demand: PinDemand;
  gauge: DemandGauge;
  bottomPct: number;
  index: number;
}) {
  const coils = demand.byGauge[gauge].coils;
  // Anchored to its bar, nudged inward at the edges so it stays inside the plot.
  const align = index === 0 ? "left-0" : index === DEMAND_GAUGES.length - 1 ? "right-0" : "left-1/2 -translate-x-1/2";
  return (
    <div
      role="presentation"
      className={`pointer-events-none absolute z-10 w-max max-w-[13rem] border border-neutral-300 bg-white px-2.5 py-2 shadow-sm ${align}`}
      style={{ bottom: `calc(${bottomPct}% + 8px)` }}
    >
      <p className="text-[14px] font-semibold tabular-nums text-ink">
        {number.format(coils)} coils <span className="font-normal text-neutral-500">· {km(coils)}</span>
      </p>
      <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-neutral-700">
        <span aria-hidden="true" className="h-0.5 w-3 rounded-full" style={{ backgroundColor: SERIES_COLOR[gauge] }} />
        {GAUGE_INFO[gauge].label} · {GAUGE_INFO[gauge].use}
      </p>
      <p className="mt-0.5 text-[11px] text-neutral-500">
        {demand.pin} {demand.area} · {demand.estimates} estimates
      </p>
    </div>
  );
}
