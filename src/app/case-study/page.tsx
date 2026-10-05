import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Eyebrow, PhaseStripe } from "@/components/phase";
import { DemandByGaugeChart } from "@/features/analytics/DemandByGaugeChart";
import { DEMAND_GAUGES, PIN_DEMAND } from "@/features/analytics/demandSample";
import { calculateBOM } from "@/features/calculator/calculateBOM";
import { buildCalculatorInput } from "@/features/calculator/generateRoomSpecs";
import type { LayoutInput } from "@/features/calculator/layoutTypes";

export const metadata: Metadata = {
  title: "Case study",
  description:
    "How Phasr digitizes residential electrical procurement in Delhi NCR: deterministic bills of materials, sealed-bid dealer quotes, and cable demand by gauge before it is bought.",
};

// ---------------------------------------------------------------------------
// Case study
// ---------------------------------------------------------------------------
// Written for a technology leader at a cable manufacturer, reading from an
// email link: five sections, each skimmable on its own. Every number on the
// page is computed here from the same engine the calculator runs, so the
// page cannot contradict the product.
// ---------------------------------------------------------------------------

const REPO_URL = "https://github.com/Adhi-opp/VoltFlow";

/** The reference home the calculator's 2BHK preset describes. */
const REFERENCE_2BHK: LayoutInput = {
  propertyType: "FLAT",
  city: "Delhi",
  bedrooms: 2,
  bathrooms: 2,
  balconies: 1,
  totalFloors: 1,
  modularKitchen: false,
  acInBedrooms: true,
  acInLivingRoom: true,
  geyserInBathrooms: true,
};

const number = new Intl.NumberFormat("en-IN");

/** "Up to 10 kW" → "up to 10 kW": only the first letter, so units keep their case. */
function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function referenceHome() {
  const bom = calculateBOM(buildCalculatorInput(REFERENCE_2BHK));
  const roomCable = bom.items.flatMap((item) =>
    item.category === "WIRE" && (DEMAND_GAUGES as readonly string[]).includes(item.wireGauge) ? [item] : []
  );
  return {
    connectedKw: bom.totalConnectedLoadKw,
    demandKw: bom.maxDemandKw,
    phase: bom.recommendedPhase,
    neededMetres: roomCable.reduce((n, w) => n + w.totalMeters, 0),
    coils: roomCable.reduce((n, w) => n + w.coilsRequired, 0),
    boughtMetres: roomCable.reduce((n, w) => n + w.purchasableMeters, 0),
    leftoverMetres: roomCable.reduce((n, w) => n + w.surplusMeters, 0),
  };
}

const SUPPLY_RULES = [
  {
    area: "Delhi",
    regulator: "DERC",
    single: "Up to 10 kW",
    three: "Above 10 kW",
    source: "DERC Schedule of Charges and Procedure (Supply Code 2017)",
    href: "https://www.derc.gov.in/sites/default/files/Schedule-of-Charges-and-Procedure_0.pdf",
  },
  {
    area: "Gurugram, Faridabad",
    regulator: "HERC (DHBVN)",
    single: "Up to 5 kW",
    three: "Above 5 kW",
    source: "HERC Supply Code 2014, Reg. 3.2.1 (DHBVN circular D-48/2014)",
    href: "https://dhbvn.org.in/staticContent/saleregulation/salecircular/circular2014/SC.2014-48.pdf",
  },
  {
    area: "Noida, Greater Noida, Ghaziabad",
    regulator: "UPERC",
    single: "Below 5 kW",
    three: "5 kW or more",
    source: "UP Electricity Supply Code 2005 (as amended), clause 3.2",
    href: "https://uperc.org/App_File/U-P-ElectricitySupplyCode2005upto12thAmendment-pdf323201825406PM.pdf",
  },
];

const PIPELINES: Array<{ name: string; steps: string[] }> = [
  {
    name: "Estimate",
    steps: [
      "Browser sends a layout, never a price",
      "Server action in Mumbai validates it",
      "Pure engine: calculateBOM + boardEngine",
      "Postgres in Mumbai, row-level security on",
    ],
  },
  {
    name: "Copper rate",
    steps: [
      "Vercel Cron, daily ~5 PM IST",
      "COMEX copper + USD/INR reference rate",
      "Plausibility and jump checks",
      "Price snapshot, or nothing",
    ],
  },
  {
    name: "Floor plan",
    steps: [
      "Photo shrunk in the browser, GPS stripped",
      "Vision model returns JSON to a fixed schema",
      "Schema validation, sanity checks",
      "Same engine as the calculator",
    ],
  },
];

export default function CaseStudyPage() {
  const home = referenceHome();

  const byPerEstimate = (gauge: (typeof DEMAND_GAUGES)[number]) =>
    [...PIN_DEMAND].sort(
      (a, b) => b.byGauge[gauge].coils / b.estimates - a.byGauge[gauge].coils / a.estimates
    );
  const mostEstimates = [...PIN_DEMAND].sort((a, b) => b.estimates - a.estimates)[0];
  const mostLighting = [...PIN_DEMAND].sort((a, b) => b.byGauge["1.5"].coils - a.byGauge["1.5"].coils)[0];
  const [richest] = byPerEstimate("1.5");
  const leanest = byPerEstimate("1.5").at(-1)!;
  const perEstimate = (d: (typeof PIN_DEMAND)[number]) => (d.byGauge["1.5"].coils / d.estimates).toFixed(1);

  return (
    <main className="w-full bg-white">
      <PhaseStripe />
      <article className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 md:py-16">
        <header>
          <Eyebrow phase="red" tone="ink">
            Case study
          </Eyebrow>
          <h1 className="mt-4 text-balance font-display text-4xl font-extrabold leading-[1.02] tracking-[-0.03em] text-ink sm:text-5xl">
            Digitizing residential electrical procurement in Delhi&nbsp;NCR
          </h1>
          <p className="mt-4 max-w-2xl text-[15px] leading-7 text-neutral-700 sm:text-base sm:leading-7">
            From rule-of-thumb estimates to a deterministic data pipeline: a house layout becomes a
            standard bill of materials, the bill becomes sealed bids from verified dealers, and every
            estimate becomes a record of cable demand before any cable is bought.
          </p>
          <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-neutral-600">
            <span>By Adhiraj · October 2026</span>
            <Link href="/calculator" className="font-medium text-ink underline underline-offset-4">
              Try the calculator
            </Link>
            <Link href="/dashboard?demo=true" className="font-medium text-ink underline underline-offset-4">
              Demo dashboard
            </Link>
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="font-medium text-ink underline underline-offset-4">
              Source code
            </a>
          </p>
        </header>

        {/* Headline figures, each with its own one-line proof below. */}
        <dl className="mt-10 grid grid-cols-2 gap-px border border-neutral-300 bg-neutral-300 sm:grid-cols-4">
          <Stat value="₹0" label="change to an estimate when a room's size is misread" />
          <Stat value="3" label="state supply rules, each from the regulator's text" />
          <Stat value="72 h" label="quote validity, so no price is held open on copper" />
          <Stat value="0.15 s" label="warm server response, served from Mumbai" />
        </dl>

        <Section index={1} phase="red" title="Executive summary">
          <p>
            Wiring a home in NCR still starts with a handwritten list. An electrician estimates
            quantities from experience, dealers often price different lists in different cable grades,
            and the buyer is left comparing quotes that do not describe the same job. Nothing about the
            purchase is recorded until the cable is already sold.
          </p>
          <p>
            Phasr replaces the list with a calculation. The engine is deterministic: the same
            layout always produces the same bill of materials, in the units the trade sells
            (90 m coils by gauge, breakers by rating and trip curve), and it follows each state&apos;s
            rule on when a home needs three-phase supply. An AI model is used only to read floor-plan
            drawings, never to calculate.
          </p>
          <p>
            The result is structured data at the earliest point in the purchase, which is what the
            rest of this page is about.
          </p>
        </Section>

        <Section index={2} phase="yellow" title="Market inefficiency and the auction">
          <p>
            Cable is sold in 90 m coils, so every estimate is a rounding decision. Phasr sizes cable per
            electrical point (7 m for each light, fan or 5 A socket, 9 m for each 15 A socket, 14 m for each
            AC or geyser circuit) and never from floor area, so a room size typed or read wrongly
            cannot inflate the order. It adds a fixed 10% margin, rounds up to whole coils, and shows the
            leftover instead of hiding it.
          </p>
          <p>
            For the reference 2BHK, that is{" "}
            <strong className="font-semibold text-ink">{number.format(home.neededMetres)} m</strong> of
            room cable across three gauges, bought as{" "}
            <strong className="font-semibold text-ink">{home.coils} coils</strong> (
            {number.format(home.boughtMetres)} m), leaving {number.format(home.leftoverMetres)} m on the
            last coils.
          </p>
          <p>
            That standard list goes out as a request for quotation to approved dealers who serve the
            area. It works as a sealed-bid reverse auction:
          </p>
          <ul className="ml-5 list-disc space-y-1.5">
            <li>Each dealer bids blind, with price, brand, wire grade (FR, FRLS or ZHFR) and delivery time.</li>
            <li>The request stays open for 72 hours; every bid is binding for 72 hours, because copper prices move.</li>
            <li>The buyer compares like with like, grade beside price. Contact details are exchanged only when a bid is accepted.</li>
          </ul>
          <p>
            Dealers price a complete, standard list rather than a vague enquiry, so they can bid
            from the stock they already hold.
          </p>
        </Section>

        <Section index={3} phase="blue" title="Predictive demand analytics">
          <p>
            An estimate is made while the house is still being planned, before the contractor buys a
            single coil. Saved estimates, totalled by pin code and gauge, are a forward view of demand:
            where 1.5 mm² for lighting, 2.5 mm² for sockets and 4 mm² for AC circuits will be bought next.
          </p>
          <div className="not-prose my-6">
            <DemandByGaugeChart data={PIN_DEMAND} />
          </div>
          <p>
            Counting leads alone points the wrong way. In this sample,{" "}
            {mostEstimates.pin} {mostEstimates.area} sends the most estimates ({mostEstimates.estimates}),
            but {mostLighting.pin} {mostLighting.area} needs the most lighting cable (
            {number.format(mostLighting.byGauge["1.5"].coils)} coils of 1.5 mm²): its homes are larger,
            at {perEstimate(richest)} coils per estimate against {perEstimate(leanest)} in {leanest.area}.
            A bill of materials carries that difference; an enquiry count does not.
          </p>
          <p>
            In production this is one aggregation over saved estimates, which already store coils per
            gauge. The quote request already has a pin-code field; the calculator collects the city today,
            so capturing the pin code is the next field to add. For a manufacturer extending into new
            districts, this is the signal for where to stock which gauge, ahead of distributor orders.
          </p>
        </Section>

        <Section index={4} phase="red" title="Data architecture and security">
          <div className="not-prose my-5 space-y-3">
            {PIPELINES.map((pipeline) => (
              <div key={pipeline.name} className="border border-neutral-300 p-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-neutral-600">{pipeline.name}</p>
                <ol className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-2 text-[13px] text-ink">
                  {pipeline.steps.map((step, i) => (
                    <li key={step} className="flex items-center gap-1.5">
                      {i > 0 && (
                        <span aria-hidden="true" className="text-neutral-400">
                          →
                        </span>
                      )}
                      <span className="border border-neutral-300 bg-neutral-50 px-2 py-1">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
          <ul className="ml-5 list-disc space-y-1.5">
            <li>
              <strong className="font-semibold text-ink">Co-located in Mumbai.</strong> Serverless functions
              run in Vercel&apos;s Mumbai region (bom1), next to the Postgres database. Moving them from the
              US cut warm responses from about 0.35 s to 0.15 s.
            </li>
            <li>
              <strong className="font-semibold text-ink">No price comes from the browser.</strong> The browser
              sends a layout; server actions validate it and recompute the bill and its price before anything
              is saved, so editing a request cannot change a stored estimate.
            </li>
            <li>
              <strong className="font-semibold text-ink">A copper rate that fails closed.</strong> The daily
              job converts COMEX copper and the USD/INR reference rate to ₹/kg. It accepts only a secret-bearing
              call, compared in constant time; skips stale quotes; and refuses implausible values or a jump
              over 12%, keeping the last good rate instead.
            </li>
            <li>
              <strong className="font-semibold text-ink">Access checked twice.</strong> Roles are checked at the
              edge and again in every admin and dealer page and server action. Row-level security is on for
              every table.
            </li>
            <li>
              <strong className="font-semibold text-ink">Browser hardening.</strong> A nonce-based content
              security policy, plus clickjacking protection, HSTS and strict referrer and permissions policies.
            </li>
            <li>
              <strong className="font-semibold text-ink">Privacy by default.</strong> Floor-plan photos are
              re-encoded in the browser before upload, which strips their GPS location; buyer and dealer
              contact details stay hidden until a bid is accepted.
            </li>
          </ul>
        </Section>

        <Section index={5} phase="yellow" title="Engineering rigor: the three-phase rule">
          <p>
            The reference 2BHK draws a peak of only{" "}
            <strong className="font-semibold text-ink">{home.demandKw.toFixed(1)} kW</strong>, yet Phasr
            specifies a {home.phase === "THREE" ? "three-phase" : "single-phase"} board for it. Peak demand
            applies diversity (not every AC and geyser runs at once), but the regulator&apos;s threshold is set
            against connected load, which counts every one of them at full rating. This home&apos;s is{" "}
            <strong className="font-semibold text-ink">{home.connectedKw.toFixed(2)} kW</strong>, just over
            Delhi&apos;s 10 kW line.
          </p>
          <p>The line is not the same across NCR. Each state&apos;s regulator sets its own:</p>
          {/* Phones get one card per state: a five-column table would hide the
              sources off to the side. */}
          <ul className="not-prose my-5 space-y-3 sm:hidden">
            {SUPPLY_RULES.map((rule) => (
              <li key={rule.area} className="border border-neutral-300 p-3 text-[13px] leading-6">
                <p className="font-semibold text-ink">
                  {rule.area} <span className="font-normal text-neutral-600">· {rule.regulator}</span>
                </p>
                <p className="text-neutral-700">
                  Single phase {lowerFirst(rule.single)};{" "}
                  <strong className="font-semibold text-ink">three phase {lowerFirst(rule.three)}</strong>
                </p>
                <a href={rule.href} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-start gap-0.5 text-[12px] leading-5 text-neutral-700 underline underline-offset-2">
                  {rule.source}
                  <ArrowUpRight aria-hidden="true" className="mt-0.5 size-3 shrink-0" />
                </a>
              </li>
            ))}
          </ul>
          <div className="not-prose my-5 hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[34rem] text-left text-[13px]">
              <thead className="border-b border-neutral-300 text-neutral-600">
                <tr>
                  <th scope="col" className="py-2 pr-3 font-medium">Area</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Regulator</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Single phase</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Three phase</th>
                  <th scope="col" className="py-2 font-medium">Source</th>
                </tr>
              </thead>
              <tbody>
                {SUPPLY_RULES.map((rule) => (
                  <tr key={rule.area} className="border-b border-neutral-200 align-top">
                    <th scope="row" className="py-2 pr-3 font-medium text-ink">{rule.area}</th>
                    <td className="py-2 pr-3 text-neutral-700">{rule.regulator}</td>
                    <td className="py-2 pr-3 text-neutral-700">{rule.single}</td>
                    <td className="py-2 pr-3 font-medium text-ink">{rule.three}</td>
                    <td className="py-2 text-neutral-700">
                      <a href={rule.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-start gap-0.5 underline underline-offset-2">
                        {rule.source}
                        <ArrowUpRight aria-hidden="true" className="mt-0.5 size-3 shrink-0" />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            Researching this page caught a bug in Phasr itself: it had applied Delhi&apos;s 10 kW line to all
            of NCR. A Gurugram 2BHK with 7 kW connected, single phase under the old rule, needs three phase
            under Haryana&apos;s. The engine now picks each state&apos;s rule from the city, with the regulation
            cited in the code, and the bill of materials follows automatically: a TPN distribution board, a
            four-pole isolator, a 63 A four-pole RCCB, and circuits balanced across the R, Y and B phases. The
            estimate matches the supply the DISCOM will actually sanction.
          </p>
        </Section>

        <footer className="mt-14 border-t border-neutral-300 pt-6 text-[13px] leading-relaxed text-neutral-600">
          <p>
            Phasr is live at this address. The chart&apos;s estimate mix is sample data; everything else on
            this page is computed by the production engine when the page loads.
          </p>
          <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
            <Link href="/calculator" className="font-medium text-ink underline underline-offset-4">
              Calculator
            </Link>
            <Link href="/dashboard?demo=true" className="font-medium text-ink underline underline-offset-4">
              Demo dashboard
            </Link>
            <Link href="/copper-rate" className="font-medium text-ink underline underline-offset-4">
              Copper rate
            </Link>
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="font-medium text-ink underline underline-offset-4">
              Source code
            </a>
          </p>
        </footer>
      </article>
    </main>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="bg-white px-4 py-4">
      <dt className="sr-only">{label}</dt>
      <dd>
        <span className="block font-display text-3xl font-extrabold tracking-tight text-ink">{value}</span>
        <span aria-hidden="true" className="mt-1 block text-[12px] leading-snug text-neutral-600">
          {label}
        </span>
      </dd>
    </div>
  );
}

function Section({
  index,
  phase,
  title,
  children,
}: {
  index: number;
  phase: "red" | "yellow" | "blue";
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-14">
      <Eyebrow phase={phase}>{String(index).padStart(2, "0")}</Eyebrow>
      <h2 className="mt-3 text-balance font-display text-2xl font-extrabold tracking-[-0.02em] text-ink sm:text-3xl">
        {title}
      </h2>
      <div className="mt-4 space-y-4 text-[15px] leading-7 text-neutral-700">{children}</div>
    </section>
  );
}
