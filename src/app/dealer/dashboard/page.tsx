import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getDealerQuoteCountThisMonth } from "@/features/quotes/queries";
import { wireGradeShort } from "@/features/quotes/wireGrade";
import { isExpired } from "@/features/quotes/validity";
import {
  Metric,
  Row,
  Section,
  SpecTable,
  StatusChip,
  statusTone,
} from "@/components/spec-sheet";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Dealer Dashboard — VoltFlow",
  description: "View and respond to open quote requests.",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(date);
}

/** "closes in 14 h" reads more usefully on a board than a timestamp. */
function closesIn(expiresAt: Date | null, now: Date): string {
  if (!expiresAt) return "—";
  const ms = expiresAt.getTime() - now.getTime();
  if (ms <= 0) return "closed";
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours < 1) return "< 1 h";
  if (hours < 48) return `${hours} h`;
  return `${Math.floor(hours / 24)} d`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractEstimate(bomData: unknown, fallback: number | null): number | null {
  if (!isRecord(bomData)) return fallback;
  const pricing = bomData.pricing;
  if (!isRecord(pricing)) return fallback;
  return typeof pricing.materialCost === "number" ? pricing.materialCost : fallback;
}

function extractNumber(bomData: unknown, key: string): number | null {
  if (!isRecord(bomData)) return null;
  const v = bomData[key];
  return typeof v === "number" ? v : null;
}

function extractPhase(bomData: unknown): string | null {
  if (!isRecord(bomData)) return null;
  const pd = bomData.phaseDecision;
  if (!isRecord(pd) || typeof pd.finalRecommendation !== "string") return null;
  return pd.finalRecommendation === "THREE" ? "3-Ph" : "1-Ph";
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function DealerDashboardPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.role !== "DEALER" && session.user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  const dealerProfile = await prisma.dealerProfile.findUnique({
    where: { userId: session.user.id },
    select: {
      id: true,
      companyName: true,
      city: true,
      serviceAreas: true,
      approvalStatus: true,
      subscriptionTier: true,
    },
  });

  if (!dealerProfile) {
    redirect("/dealer/profile/setup");
  }

  const now = new Date();

  const serviceFilter = [dealerProfile.city, ...dealerProfile.serviceAreas].map(
    (s) => s.trim().toUpperCase()
  );

  const openRfqs = await prisma.quoteRequest.findMany({
    where: {
      status: "OPEN",
      visibilityCity: { in: serviceFilter, mode: "insensitive" },
      // Exclude RFQs this dealer has already quoted on
      quotes: { none: { dealerId: session.user.id } },
      // And ones whose 72h window has closed. Nothing flips status to EXPIRED
      // (no cron in this project), so the deadline is applied at read time.
      // Legacy rows have no expiresAt and stay visible.
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    include: {
      project: {
        select: {
          id: true,
          projectName: true,
          totalEstimate: true,
          bomData: true,
          createdAt: true,
        },
      },
      _count: { select: { quotes: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // Derived on demand, replacing the old DealerProfile.quotesThisMonth tally.
  const quotesThisMonth = await getDealerQuoteCountThisMonth(session.user.id);

  const myQuotes = await prisma.quote.findMany({
    where: { dealerId: session.user.id },
    include: {
      quoteRequest: {
        include: {
          project: {
            select: {
              projectName: true,
              totalEstimate: true,
              owner: { select: { name: true, email: true, phone: true } },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const wonCount = myQuotes.filter((q) => q.status === "ACCEPTED").length;
  const isApproved = dealerProfile.approvalStatus === "APPROVED";

  return (
    // sheet-enter staggers the direct children — masthead, notice, sections —
    // so they must stay flat under <main>, not wrapped in another div.
    <main className="sheet-enter mx-auto min-h-screen w-full max-w-5xl space-y-4 px-4 py-10 sm:px-6">
      {/* Masthead — who you are and what the account is cleared to do. */}
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-300 pb-3">
        <div>
          <p className="spec-label">Dealer Account</p>
          <h1 className="mt-1 text-xl font-bold tracking-tight text-slate-950">
            {dealerProfile.companyName}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <StatusChip
            status={dealerProfile.approvalStatus}
            tone={statusTone(dealerProfile.approvalStatus)}
          />
          <StatusChip status={dealerProfile.subscriptionTier} tone="neutral" />
          <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs" asChild>
            <Link href="/dealer/profile/setup">Edit Profile</Link>
          </Button>
        </div>
      </div>

      {!isApproved && (
        <p className="border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
          Your profile is awaiting approval. You can review incoming
          requisitions, but quote submission stays locked until an admin clears
          the account.
        </p>
      )}

      <Section
        index={1}
        title="Position"
        meta={serviceFilter.join(" · ")}
      >
        <div className="grid grid-cols-2 divide-y divide-slate-200 sm:grid-cols-4 sm:divide-y-0">
          <Metric label="Open to You" value={String(openRfqs.length)} />
          <Metric label="Quoted (Month)" value={String(quotesThisMonth)} />
          <Metric label="Quotes on File" value={String(myQuotes.length)} />
          <Metric label="Won" value={String(wonCount)} accent={wonCount > 0} />
        </div>
      </Section>

      {/* ── Open requisitions ──────────────────────────────────────────── */}
      <Section
        index={2}
        title="Open Requisitions"
        meta={`${openRfqs.length} in your areas`}
      >
        {openRfqs.length === 0 ? (
          <p className="px-3 py-8 text-center text-[13px] text-slate-500">
            No open requisitions in your service areas right now.
          </p>
        ) : (
          <SpecTable
            minWidth={760}
            head={[
              "Project",
              "Load",
              "Demand",
              "Supply",
              "Est. Value",
              "Bids",
              "Closes",
              "",
            ]}
          >
            {openRfqs.map((rfq) => {
              const bom = rfq.project.bomData;
              const estimate = extractEstimate(bom, rfq.project.totalEstimate);
              const loadKw = extractNumber(bom, "totalConnectedLoadKw");
              const demandKw = extractNumber(bom, "maxDemandKw");
              const phase = extractPhase(bom);
              const spotsLeft = rfq.maxQuotes - rfq._count.quotes;
              const closing =
                rfq.expiresAt != null &&
                rfq.expiresAt.getTime() - now.getTime() < 24 * 60 * 60 * 1000;

              return (
                <Row key={rfq.id}>
                  <td className="px-3 py-2.5">
                    <span className="font-medium text-slate-900">
                      {rfq.project.projectName}
                    </span>
                    <span className="block text-[11px] text-slate-500">
                      {rfq.visibilityCity} · posted {formatDate(rfq.createdAt)}
                    </span>
                  </td>
                  <td className="spec-num px-3 py-2.5 text-right text-slate-600">
                    {loadKw != null ? `${loadKw.toFixed(2)} kW` : "—"}
                  </td>
                  <td className="spec-num px-3 py-2.5 text-right text-slate-600">
                    {demandKw != null ? `${demandKw.toFixed(2)} kW` : "—"}
                  </td>
                  <td className="spec-num px-3 py-2.5 text-right text-slate-600">
                    {phase ?? "—"}
                  </td>
                  <td className="spec-num px-3 py-2.5 text-right font-semibold text-slate-900">
                    {estimate != null ? formatCurrency(estimate) : "—"}
                  </td>
                  <td className="spec-num px-3 py-2.5 text-right text-slate-600">
                    {rfq._count.quotes}/{rfq.maxQuotes}
                    {spotsLeft <= 1 && (
                      <span className="ml-1 text-amber-700">!</span>
                    )}
                  </td>
                  <td
                    className={`spec-num px-3 py-2.5 text-right ${
                      closing ? "font-medium text-amber-700" : "text-slate-600"
                    }`}
                  >
                    {closesIn(rfq.expiresAt, now)}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <Button size="sm" className="h-7 px-2.5 text-xs" asChild>
                      <Link href={`/dealer/rfq/${rfq.id}`}>Open</Link>
                    </Button>
                  </td>
                </Row>
              );
            })}
          </SpecTable>
        )}
      </Section>

      {/* ── Submitted quotes ───────────────────────────────────────────── */}
      {myQuotes.length > 0 && (
        <Section
          index={3}
          title="Your Quotes"
          meta={`${myQuotes.length} submitted`}
        >
          <SpecTable
            minWidth={760}
            head={[
              "Project",
              "Brand",
              "Grade",
              "Your Price",
              "Delivery",
              "Valid Until",
              "Status",
            ]}
          >
            {myQuotes.map((quote) => {
              const grade = wireGradeShort(quote.wireGrade);
              const lapsed =
                quote.status === "SUBMITTED" && isExpired(quote.validUntil, now);

              return (
                <Row key={quote.id}>
                  <td className="px-3 py-2.5">
                    <span className="font-medium text-slate-900">
                      {quote.quoteRequest.project.projectName}
                    </span>
                    <span className="block text-[11px] text-slate-500">
                      quoted {formatDate(quote.createdAt)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-700">
                    {quote.brandOffered}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {grade ? (
                      <span className="spec-num border border-slate-300 px-1.5 py-0.5 text-[11px]">
                        {grade}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="spec-num px-3 py-2.5 text-right font-semibold text-slate-900">
                    {formatCurrency(quote.totalPrice)}
                  </td>
                  <td className="spec-num px-3 py-2.5 text-right text-slate-600">
                    {quote.deliveryDays != null ? `${quote.deliveryDays} d` : "—"}
                  </td>
                  <td
                    className={`spec-num px-3 py-2.5 text-right ${
                      lapsed ? "text-destructive" : "text-slate-600"
                    }`}
                  >
                    {quote.validUntil
                      ? lapsed
                        ? "Lapsed"
                        : formatDate(quote.validUntil)
                      : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <StatusChip
                      status={quote.status}
                      tone={statusTone(quote.status)}
                    />
                  </td>
                </Row>
              );
            })}
          </SpecTable>

          {/* Contact details for won jobs. Off the table on purpose — this
              is the payoff, and it should not be a cell you scroll past. */}
          {myQuotes
            .filter((q) => q.status === "ACCEPTED")
            .map((q) => (
              <div
                key={q.id}
                className="border-t border-emerald-300 bg-emerald-50 px-3 py-2.5"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-emerald-800">
                  Awarded — {q.quoteRequest.project.projectName}
                </p>
                <div className="mt-1 flex flex-wrap gap-x-5 gap-y-0.5 text-[13px] text-emerald-900">
                  <span>{q.quoteRequest.project.owner.name ?? "Homeowner"}</span>
                  <span className="spec-num">
                    {q.quoteRequest.project.owner.email}
                  </span>
                  {q.quoteRequest.project.owner.phone && (
                    <span className="spec-num">
                      {q.quoteRequest.project.owner.phone}
                    </span>
                  )}
                </div>
              </div>
            ))}
        </Section>
      )}
    </main>
  );
}
