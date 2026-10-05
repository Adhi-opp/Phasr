// src/features/quotes/queries.ts
// ============================================================================
// QUOTE READ MODEL
// ============================================================================
// This was inline in the quotes page. It lives here so the isHidden filter has
// exactly one home — a "Remove" that only hid the row in one of two places
// would be a bug the user discovers later, on a different screen, with no idea
// why the quote came back.
//
// server-only rather than "use server": these are data functions, not actions.
// Marking the file "use server" would publish every export as a callable RPC
// endpoint, which is the opposite of what a read model wants.
// ============================================================================

import "server-only";
import { prisma } from "@/lib/prisma";
import {
  QUOTE_EXPIRY_WARNING_HOURS,
  buyerRequestState,
  expiresWithinHours,
  isExpired,
  type BuyerRequestState,
} from "@/features/quotes/validity";

/**
 * How many quotes this dealer has submitted in the current calendar month.
 *
 * Replaces DealerProfile.quotesThisMonth, which was a stored tally that
 * nothing ever reset — it counted upward for the life of the account while
 * claiming to be a monthly figure.
 *
 * Derived instead. The Quote table already holds createdAt and is indexed on
 * dealerId, so this is a covered count, not a scan: correct by construction,
 * no background job, and it cannot drift out of sync with reality.
 *
 * Month boundaries are local-time, matching what a dealer sees on a calendar.
 */
export async function getDealerQuoteCountThisMonth(
  dealerId: string,
  now: Date = new Date()
): Promise<number> {
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  return prisma.quote.count({
    where: {
      dealerId,
      createdAt: { gte: startOfMonth, lt: startOfNextMonth },
    },
  });
}

export interface ProjectQuoteView {
  id: string;
  totalPrice: number;
  brandOffered: string;
  wireGrade: string | null;
  deliveryDays: number | null;
  details: string | null;
  status: string;
  createdAt: string;
  /** Null on quotes written before the field was defaulted. */
  validUntil: string | null;
  /**
   * Expiry is resolved here rather than in the client on purpose. Comparing
   * against `new Date()` inside a client component gives the server render and
   * the hydration render two different clocks, and a quote sitting on the
   * boundary would flip between "Lapsed" and a date — a hydration mismatch.
   * One clock, decided server-side, renders identically in both passes.
   */
  hasLapsed: boolean;
  expiresSoon: boolean;
  dealerName: string;
  dealerCity: string;
  /** Released only once a quote is accepted — this is the payoff, not a lead list. */
  dealerEmail: string | null;
  dealerPhone: string | null;
}

export type ProjectQuotesResult =
  | { ok: false; reason: "NOT_FOUND" | "NOT_OWNER" }
  | {
      ok: true;
      projectName: string;
      requestState: BuyerRequestState;
      projectEstimate: number | null;
      quotes: ProjectQuoteView[];
    };

/**
 * Every visible quote on a project, cheapest first.
 *
 * Hidden quotes are excluded at the database level, not filtered in the
 * component — a removed quote should never reach the client at all.
 * Ownership is checked here rather than by the caller so there is no way to
 * read someone else's quotes by forgetting a guard at a new call site.
 */
export async function getQuotesForProject(
  projectId: string,
  viewerId: string
): Promise<ProjectQuotesResult> {
  // One clock for the whole read, so two rows cannot disagree about "now".
  const now = new Date();

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      quoteRequest: {
        include: {
          quotes: {
            // The "Remove" feature. Hidden rows stay in the table for the
            // dealer, for quoteCount and for admin analytics — they just stop
            // being part of this buyer's comparison.
            where: { isHidden: false },
            include: {
              dealer: {
                select: {
                  name: true,
                  email: true,
                  phone: true,
                  dealerProfile: {
                    select: {
                      companyName: true,
                      city: true,
                      brandsSold: true,
                    },
                  },
                },
              },
            },
            orderBy: { totalPrice: "asc" as const },
          },
        },
      },
    },
  });

  if (!project) {
    return { ok: false, reason: "NOT_FOUND" };
  }

  if (project.ownerId !== viewerId) {
    return { ok: false, reason: "NOT_OWNER" };
  }

  const rfq = project.quoteRequest;

  return {
    ok: true,
    projectName: project.projectName,
    // Derived, not stored: nothing writes EXPIRED, and a full request stays
    // OPEN until its buyer accepts a quote. A project with no request at all
    // predates requests; it reads as one that ended with no quotes.
    requestState: rfq ? buyerRequestState(rfq, now) : "EXPIRED",
    projectEstimate: project.totalEstimate,
    quotes:
      rfq?.quotes.map((q) => ({
        id: q.id,
        totalPrice: q.totalPrice,
        brandOffered: q.brandOffered,
        wireGrade: q.wireGrade,
        deliveryDays: q.deliveryDays,
        details: q.details,
        status: q.status,
        createdAt: q.createdAt.toISOString(),
        validUntil: q.validUntil?.toISOString() ?? null,
        hasLapsed: isExpired(q.validUntil, now),
        expiresSoon: expiresWithinHours(
          q.validUntil,
          QUOTE_EXPIRY_WARNING_HOURS,
          now
        ),
        dealerName:
          q.dealer.dealerProfile?.companyName ?? q.dealer.name ?? "Dealer",
        dealerCity: q.dealer.dealerProfile?.city ?? "",
        dealerEmail: q.status === "ACCEPTED" ? q.dealer.email : null,
        dealerPhone: q.status === "ACCEPTED" ? (q.dealer.phone ?? null) : null,
      })) ?? [],
  };
}
