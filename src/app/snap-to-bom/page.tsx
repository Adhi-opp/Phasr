import type { Metadata } from "next";
import { ComingSoonBadge, Eyebrow } from "@/components/phase";
import { NotifyForm } from "./NotifyForm";

export const metadata: Metadata = {
  title: "Snap-to-BOM",
  description:
    "Coming soon: upload a floor plan and VoltFlow builds the wiring estimate for you.",
};

// ---------------------------------------------------------------------------
// Snap-to-BOM (roadmap)
// ---------------------------------------------------------------------------
// The vision step, marked Coming soon everywhere it appears. It reads a
// floor plan (features/vision), not a video. The pitch it carries is the
// defensible one: the engineering engine already exists, and the drawing
// only replaces typing room sizes. Step 3 says so.
// ---------------------------------------------------------------------------

const STEPS = [
  { title: "Upload", body: "Upload a floor plan, blueprint, or site sketch photo." },
  { title: "Extract", body: "VoltFlow detects room boundaries, doors, and heavy appliance zones." },
  {
    title: "Estimate",
    body: "The IS 732-aligned engine computes cable lengths and circuit breakers.",
  },
];

/**
 * A room as the extractor reads it off a plan: photo-frame corners, the wall
 * outline with a door gap and a window, labelled sides in feet as Indian
 * plans give them, and appliance zones in the three phase colours.
 * Positions are percentages so it scales with the column. Decorative: the
 * steps below say everything it shows.
 */
function ScanIllustration() {
  return (
    <figure aria-hidden="true" className="relative aspect-[16/10] w-full overflow-hidden border-2 border-ink bg-white">
      <span className="absolute left-[4%] top-[6%] size-6 border-l-2 border-t-2 border-phase-blue" />
      <span className="absolute right-[4%] top-[6%] size-6 border-r-2 border-t-2 border-phase-blue" />
      <span className="absolute bottom-[6%] left-[4%] size-6 border-b-2 border-l-2 border-phase-blue" />
      <span className="absolute bottom-[6%] right-[4%] size-6 border-b-2 border-r-2 border-phase-blue" />

      <span className="absolute left-[11%] top-[8%] font-mono text-[10px] uppercase tracking-[0.08em] text-neutral-600">
        Reading plan · Bedroom 1
      </span>

      {/* walls */}
      <span className="absolute left-[18%] top-[26%] h-[50%] w-[58%] border-[3px] border-ink" />
      {/* door gap on the bottom wall, window on the right wall */}
      <span className="absolute left-[26%] top-[74%] h-[4%] w-[11%] bg-white" />
      <span className="absolute left-[74.5%] top-[38%] h-[18%] w-[3%] border-y-2 border-neutral-500 bg-white" />

      <span className="absolute left-[18%] top-[16%] w-[58%] text-center font-mono text-[11px] font-semibold text-ink">
        14&apos;0&quot;
      </span>
      <span className="absolute left-[80%] top-[47%] font-mono text-[11px] font-semibold text-ink">12&apos;0&quot;</span>

      {/* appliance zones */}
      <span className="absolute left-[40%] top-[24%] size-2.5 bg-phase-red" />
      <span className="absolute left-[16.8%] top-[50%] size-2.5 bg-phase-yellow ring-1 ring-ink" />
      <span className="absolute left-[60%] top-[74%] size-2.5 bg-phase-blue" />

      {/* read line */}
      <span className="absolute left-[8%] right-[8%] top-[58%] h-px bg-phase-blue/70" />

      <span className="absolute bottom-[8%] left-[11%] font-mono text-[10px] text-neutral-600">
        1 door · 1 window · AC zone
      </span>
    </figure>
  );
}

export default function SnapToBomPage() {
  return (
    <main className="w-full bg-white">
      <div className="landing-enter mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 md:py-16">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <Eyebrow phase="blue">Snap-to-BOM</Eyebrow>
            <ComingSoonBadge />
          </div>
          <h1 className="mt-4 text-balance font-display text-4xl font-extrabold leading-[1.02] tracking-[-0.03em] text-ink sm:text-5xl">
            Snap a floor plan. The estimate fills itself in.
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-neutral-700">
            Upload your plan. VoltFlow reads the rooms off it and hands them to the same engine
            that powers the calculator today.
          </p>
        </div>

        <div className="mt-8">
          <ScanIllustration />
        </div>

        <ol className="mt-8 border-t border-neutral-300">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex gap-4 border-b border-neutral-300 py-4">
              <span className="w-6 shrink-0 pt-0.5 font-mono text-[13px] font-semibold text-phase-blue">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span>
                <span className="block text-[15px] font-semibold text-ink">{step.title}</span>
                <span className="mt-0.5 block text-[14px] leading-relaxed text-neutral-600">
                  {step.body}
                </span>
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-[13px] text-neutral-600">
          A licensed electrician still checks the final design.
        </p>

        <div className="mt-10">
          <NotifyForm />
        </div>
      </div>
    </main>
  );
}
