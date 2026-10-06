"use server";

import { Prisma, QuoteRequestStatus } from "@prisma/client";
import { z } from "zod";
import type { EnrichedBOMResult } from "@/features/calculator/costEngine";
import { isNcrCityKey } from "@/features/calculator/regulatoryPolicy";
import { runEstimate } from "@/features/calculator/runEstimate";
import { WIRE_GRADES } from "@/features/quotes/wireGrade";
import {
  isExpired,
  isQuoteHideable,
  quoteValidUntilFrom,
  rfqExpiryFrom,
} from "@/features/quotes/validity";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { recordIdSchema, requireRole } from "@/lib/authz";
import {
  sendNewRfqNotification,
  sendQuoteReceivedNotification,
  sendQuoteAcceptedNotification,
  sendQuoteRejectedNotification,
  sendAdminProjectSavedNotification,
} from "@/lib/email";

/** Far above any residential BOQ this engine produces (a 4BHK duplex is
    ~₹2.2 lakh), so only a typo or a crafted payload reaches it. */
const MAX_QUOTE_RUPEES = 1_00_00_000;

// .strict(): an unknown key is an error, not silently dropped. validUntil used
// to be accepted here, and no form ever sent it — the only caller who could
// was one crafting the payload to hold a price for ten years, or to backdate
// it. The validity window is platform policy, set in submitQuoteTransaction.
const submitQuoteSchema = z
  .object({
    quoteRequestId: recordIdSchema,
    clientRequestId: z.string().uuid(),
    totalPrice: z.number().positive().max(MAX_QUOTE_RUPEES),
    brandOffered: z.string().trim().min(1).max(120),
    // Stored as a plain String? column so a future grade needs no migration,
    // but constrained here — the comparison matrix relies on a closed set.
    wireGrade: z.enum(WIRE_GRADES).optional(),
    deliveryDays: z.number().int().min(1).max(365).optional(),
    details: z.string().trim().max(5000).optional(),
  })
  .strict();
const createQuoteRequestStatusSchema = z.enum(["DRAFT", "OPEN"]);

export type SubmitQuoteInput = z.infer<typeof submitQuoteSchema>;

export type SubmitQuoteErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "RFQ_CLOSED"
  | "RFQ_EXPIRED"
  | "MAX_QUOTES_REACHED"
  | "DUPLICATE_DEALER_QUOTE"
  | "DEALER_PROFILE_MISSING"
  | "CONCURRENCY_RETRY_EXHAUSTED"
  | "INTERNAL_ERROR";

export type SubmitQuoteResult =
  | {
      success: true;
      quoteId: string;
      idempotent: boolean;
    }
  | {
      success: false;
      errorCode: SubmitQuoteErrorCode;
      error: string;
    };

export type CreateQuoteRequestResult =
  | {
      success: true;
      quoteRequestId: string;
    }
  | {
      success: false;
      errorCode:
        | "UNAUTHENTICATED"
        | "FORBIDDEN"
        | "VALIDATION_ERROR"
        | "PRICING_DATA_MISSING"
        | "INTERNAL_ERROR";
      error: string;
    };

interface LockedQuoteRequestRow {
  id: string;
  status: QuoteRequestStatus;
  expiresAt: Date | null;
  quoteCount: number;
  maxQuotes: number;
}

type TransactionOutcome =
  | { kind: "CREATED"; quoteId: string }
  | { kind: "IDEMPOTENT"; quoteId: string }
  | { kind: "IDEMPOTENCY_CONFLICT" }
  | { kind: "NOT_FOUND" }
  | { kind: "RFQ_CLOSED" }
  | { kind: "RFQ_EXPIRED" }
  | { kind: "MAX_QUOTES_REACHED" }
  | { kind: "DUPLICATE_DEALER_QUOTE" }
  | { kind: "DEALER_PROFILE_MISSING" };

const RETRY_WINDOWS_MS: ReadonlyArray<{ min: number; max: number }> = [
  { min: 80, max: 160 },
  { min: 160, max: 320 },
  { min: 320, max: 640 },
];
const MAX_SERIALIZATION_RETRIES = 3;

function randomIntInclusive(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableSerializationError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // P2002 (unique constraint) here means a concurrent submission — a
    // double-click, a replayed request — committed first. Re-running the
    // transaction sees that row and answers IDEMPOTENT or
    // DUPLICATE_DEALER_QUOTE through the normal checks, instead of leaking
    // the raw constraint error.
    return error.code === "P2034" || error.code === "P2002";
  }
  if (error instanceof Error) {
    return /serialize|serialization|deadlock|40001/i.test(error.message);
  }
  return false;
}

/**
 * Which dealers see the request. Every NCR city routes to "NCR": dealers
 * serve the region, not one city, and the calculator's city choice exists to
 * pick the state's three-phase rule, not to narrow the dealer pool.
 */
function deriveVisibilityCity(policyKey: string | undefined): string {
  const normalized = policyKey?.trim();
  if (!normalized || normalized.toUpperCase() === "DEFAULT" || isNcrCityKey(normalized)) {
    return "NCR";
  }
  return normalized;
}

function mapOutcomeToResult(outcome: TransactionOutcome): SubmitQuoteResult {
  switch (outcome.kind) {
    case "CREATED":
      return { success: true, quoteId: outcome.quoteId, idempotent: false };
    case "IDEMPOTENT":
      return { success: true, quoteId: outcome.quoteId, idempotent: true };
    case "IDEMPOTENCY_CONFLICT":
      return {
        success: false,
        errorCode: "VALIDATION_ERROR",
        error:
          "This clientRequestId is already associated with another quote context. Generate a new id and retry.",
      };
    case "NOT_FOUND":
      return { success: false, errorCode: "NOT_FOUND", error: "Quote request not found." };
    case "RFQ_CLOSED":
      return {
        success: false,
        errorCode: "RFQ_CLOSED",
        error: "Quote request is not open for new submissions.",
      };
    case "RFQ_EXPIRED":
      return {
        success: false,
        errorCode: "RFQ_EXPIRED",
        error: "Quote request has expired and can no longer accept submissions.",
      };
    case "MAX_QUOTES_REACHED":
      return {
        success: false,
        errorCode: "MAX_QUOTES_REACHED",
        error: "This quote request has already reached its quote limit.",
      };
    case "DUPLICATE_DEALER_QUOTE":
      return {
        success: false,
        errorCode: "DUPLICATE_DEALER_QUOTE",
        error: "This dealer has already submitted a quote for this request.",
      };
    case "DEALER_PROFILE_MISSING":
      return {
        success: false,
        errorCode: "DEALER_PROFILE_MISSING",
        error: "Dealer profile is missing or inactive for quote submission.",
      };
  }
}

async function submitQuoteTransaction(
  input: SubmitQuoteInput,
  dealerId: string
): Promise<TransactionOutcome> {
  const now = new Date();

  return prisma.$transaction(
    async (tx) => {
      const existingByRequestId = await tx.quote.findUnique({
        where: { clientRequestId: input.clientRequestId },
        select: { id: true, quoteRequestId: true, dealerId: true },
      });

      if (existingByRequestId) {
        if (
          existingByRequestId.quoteRequestId === input.quoteRequestId &&
          existingByRequestId.dealerId === dealerId
        ) {
          return { kind: "IDEMPOTENT", quoteId: existingByRequestId.id } as const;
        }
        return { kind: "IDEMPOTENCY_CONFLICT" } as const;
      }

      const lockedRows = await tx.$queryRaw<LockedQuoteRequestRow[]>(Prisma.sql`
        SELECT "id", "status", "expiresAt", "quoteCount", "maxQuotes"
        FROM "QuoteRequest"
        WHERE "id" = ${input.quoteRequestId}
        FOR UPDATE
      `);

      if (lockedRows.length === 0) {
        return { kind: "NOT_FOUND" } as const;
      }

      const quoteRequest = lockedRows[0];

      if (quoteRequest.status !== "OPEN") {
        return { kind: "RFQ_CLOSED" } as const;
      }

      if (quoteRequest.expiresAt && quoteRequest.expiresAt.getTime() <= now.getTime()) {
        return { kind: "RFQ_EXPIRED" } as const;
      }

      if (quoteRequest.quoteCount >= quoteRequest.maxQuotes) {
        return { kind: "MAX_QUOTES_REACHED" } as const;
      }

      const existingDealerQuote = await tx.quote.findFirst({
        where: {
          quoteRequestId: input.quoteRequestId,
          dealerId,
        },
        select: { id: true },
      });

      if (existingDealerQuote) {
        return { kind: "DUPLICATE_DEALER_QUOTE" } as const;
      }

      const dealerProfile = await tx.dealerProfile.findUnique({
        where: { userId: dealerId },
        select: { id: true, approvalStatus: true },
      });

      if (!dealerProfile || dealerProfile.approvalStatus !== "APPROVED") {
        return { kind: "DEALER_PROFILE_MISSING" } as const;
      }

      const createdQuote = await tx.quote.create({
        data: {
          quoteRequestId: input.quoteRequestId,
          dealerId,
          clientRequestId: input.clientRequestId,
          totalPrice: input.totalPrice,
          brandOffered: input.brandOffered,
          wireGrade: input.wireGrade ?? null,
          deliveryDays: input.deliveryDays ?? null,
          details: input.details ?? null,
          // Always the platform's window, never the caller's. An open-ended
          // quote asks the dealer to hold a copper-linked price indefinitely,
          // a risk they cannot hedge; a caller-chosen date could stretch or
          // backdate it.
          validUntil: quoteValidUntilFrom(now),
        },
        select: { id: true },
      });

      // The request stays OPEN when this bid fills its last slot. It used to
      // be set to CLOSED here, and acceptQuoteAction refuses anything that is
      // not OPEN, so the buyer could accept none of the bids that had just
      // filled it: the most contested requests were the ones nobody could
      // award. The quoteCount check above is what stops a further bid, and
      // dealer screens read fullness from the count (isTakingBids).
      await tx.quoteRequest.update({
        where: { id: input.quoteRequestId },
        data: { quoteCount: { increment: 1 } },
      });

      // No counter increment here any more. quotesThisMonth was a stored tally
      // with nothing to reset it; the count is now derived on demand by
      // getDealerQuoteCountThisMonth().

      return { kind: "CREATED", quoteId: createdQuote.id } as const;
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    }
  );
}

/**
 * Persists a calculator estimate as a Project (+ QuoteRequest).
 *
 * Takes the *layout*, not a finished BOM. The calculator is public, so a
 * client-supplied BOM and price cannot be trusted — the estimate is
 * recomputed here from validated inputs at current rates, and only that
 * server-derived result is ever written to the database or emailed to
 * dealers. This also means a saved project always reflects live pricing,
 * not whatever the browser tab was holding.
 */
export async function createQuoteRequestAction(
  layout: unknown,
  requestedStatus: "DRAFT" | "OPEN"
): Promise<CreateQuoteRequestResult> {
  // An allowlist, not "anyone but a dealer": a role added later gets no
  // access here until someone decides it should.
  const authz = await requireRole(BUYER_ROLES);
  if (!authz.ok) {
    return {
      success: false,
      errorCode: authz.code,
      error:
        authz.code === "FORBIDDEN" ? "Dealer accounts cannot create quote requests." : authz.error,
    };
  }

  const ownerId = authz.userId;
  const parsedStatus = createQuoteRequestStatusSchema.safeParse(requestedStatus);
  if (!parsedStatus.success) {
    return {
      success: false,
      errorCode: "VALIDATION_ERROR",
      error: "Invalid quote request status.",
    };
  }

  // Recompute from the layout — never trust a price that came from the client.
  const estimate = await runEstimate(layout);
  if (!estimate.ok) {
    logger.warn("Project save rejected by estimate pipeline", {
      ownerId,
      errorCode: estimate.errorCode,
    });
    return {
      success: false,
      errorCode:
        estimate.errorCode === "PRICING_DATA_MISSING"
          ? "PRICING_DATA_MISSING"
          : estimate.errorCode === "VALIDATION_ERROR"
          ? "VALIDATION_ERROR"
          : "INTERNAL_ERROR",
      error: estimate.error,
    };
  }

  const projectData = estimate.result;
  const layoutData = estimate.layout;

  // Every saved estimate records where the home is. The preview does not
  // need it, so runEstimate leaves it optional; a saved project must have it.
  // Its match with the city was checked by layoutSchema.
  const pincode = layoutData.pincode;
  if (!pincode) {
    return {
      success: false,
      errorCode: "VALIDATION_ERROR",
      error: "Enter the site's 6-digit pin code before saving.",
    };
  }

  const quoteRequestStatus = parsedStatus.data;
  const visibilityCity = deriveVisibilityCity(projectData.phaseDecision?.regulatoryPolicyKey);
  const now = new Date();
  const savedAt = now.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  try {
    const created = await prisma.$transaction(async (tx) => {
      // The copper reading in force when this estimate was saved. Looked up
      // here, never taken from the payload: a caller able to name the
      // snapshot could pin their project to an older, cheaper copper rate.
      // Null until an admin has recorded one.
      const snapshot = await tx.priceSnapshot.findFirst({
        where: { effectiveDate: { lte: now } },
        orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
        select: { id: true },
      });

      const project = await tx.project.create({
        data: {
          ownerId,
          priceSnapshotId: snapshot?.id ?? null,
          projectName: `Estimate — ${savedAt}`,
          projectType: "RESIDENTIAL",
          status: quoteRequestStatus === "OPEN" ? "RFQ_SUBMITTED" : "ESTIMATED",
          // Persist the validated layout, not just provenance — this is what
          // lets a project be re-estimated later at updated rates.
          inputData: {
            source: "CALCULATOR",
            generatedAt: projectData.generatedAt,
            algorithmVersion: projectData.algorithmVersion,
            layout: JSON.parse(JSON.stringify(layoutData)) as Prisma.InputJsonValue,
          },
          bomData: JSON.parse(JSON.stringify(projectData)) as Prisma.InputJsonValue,
          totalEstimate: projectData.pricing.materialCost,
          pincode,
        },
        select: {
          id: true,
        },
      });

      const quoteRequest = await tx.quoteRequest.create({
        data: {
          projectId: project.id,
          status: quoteRequestStatus,
          visibilityCity,
          visibilityPincode: pincode,
          // submitQuoteTransaction has always refused quotes past this date;
          // until now nothing ever set it, so the check was dead code and
          // requests stayed open forever. A DRAFT has no dealer visibility,
          // so it gets no clock until it is opened.
          expiresAt: quoteRequestStatus === "OPEN" ? rfqExpiryFrom(now) : null,
        },
        select: {
          id: true,
        },
      });

      return {
        projectId: project.id,
        quoteRequestId: quoteRequest.id,
      };
    });

    await notifyRequestSaved({
      saveMode: quoteRequestStatus,
      projectId: created.projectId,
      quoteRequestId: created.quoteRequestId,
      projectName: `Estimate — ${savedAt}`,
      visibilityCity,
      estimate: projectData,
    });

    return {
      success: true,
      quoteRequestId: created.quoteRequestId,
    };
  } catch (err) {
    logger.error("Failed to create quote request", {
      error: err instanceof Error ? err.message : "Unknown error",
      ownerId,
    });
    return {
      success: false,
      errorCode: "INTERNAL_ERROR",
      error: "Failed to save project. Please try again.",
    };
  }
}

/**
 * The emails that follow a request being saved or opened: the admin's copy of
 * the BOM, and for an open request, every approved dealer serving its area.
 *
 * Awaited, not fire-and-forget: a serverless runtime may freeze the invocation
 * the moment the response is returned, dropping any promise still in flight.
 * The admin BOM email is how quotes get sourced manually, so losing it
 * silently would break the whole early loop. Failures are logged and
 * swallowed: a failed notification must not fail the save.
 */
async function notifyRequestSaved(args: {
  saveMode: "DRAFT" | "OPEN";
  projectId: string;
  quoteRequestId: string;
  projectName: string;
  visibilityCity: string;
  estimate: EnrichedBOMResult;
}): Promise<void> {
  const { saveMode, visibilityCity, estimate } = args;

  await sendAdminProjectSavedNotification({
    saveMode,
    projectId: args.projectId,
    quoteRequestId: args.quoteRequestId,
    projectName: args.projectName,
    estimateValue: estimate.pricing.materialCost,
    city: visibilityCity,
    totalConnectedLoadKw: estimate.totalConnectedLoadKw,
    maxDemandKw: estimate.maxDemandKw,
    phase:
      estimate.phaseDecision.finalRecommendation === "THREE"
        ? "3-Phase"
        : "Single Phase",
    itemCount: estimate.items.length,
    bomDataJson: JSON.stringify(estimate, null, 2),
  }).catch((e) =>
    logger.error("Email: admin project notification failed", {
      error: String(e),
    })
  );

  if (saveMode !== "OPEN") return;

  // allSettled so one bad address cannot reject the batch.
  try {
    const dealers = await prisma.dealerProfile.findMany({
      where: {
        approvalStatus: "APPROVED",
        OR: [
          { city: { equals: visibilityCity, mode: "insensitive" } },
          { serviceAreas: { has: visibilityCity } },
        ],
      },
      include: { user: { select: { email: true, name: true } } },
    });

    const results = await Promise.allSettled(
      dealers.map((d) =>
        sendNewRfqNotification(d.user.email, {
          dealerName: d.user.name ?? d.companyName,
          projectName: args.projectName,
          estimateValue: estimate.pricing.materialCost,
          rfqCity: visibilityCity,
        })
      )
    );

    results.forEach((r, i) => {
      if (r.status === "rejected") {
        logger.error("Email: new RFQ notification failed", {
          error: String(r.reason),
          dealer: dealers[i]?.user.email,
        });
      }
    });
  } catch (e) {
    logger.error("Email: dealer lookup failed", { error: String(e) });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export type RequestQuotesResult =
  | { success: true; quoteRequestId: string }
  | {
      success: false;
      errorCode:
        | "UNAUTHENTICATED"
        | "FORBIDDEN"
        | "VALIDATION_ERROR"
        | "NOT_FOUND"
        | "ALREADY_SENT"
        | "ESTIMATE_OUTDATED"
        | "PRICING_DATA_MISSING"
        | "INTERNAL_ERROR";
      error: string;
    };

/**
 * Sends a saved estimate to dealers: its DRAFT request opens for 72 hours.
 *
 * Before this, a draft could never be sent. The buyer had to run the
 * calculator again, which saved a second project for the same home: extra
 * work for them, and the same home counted twice by anything that totals
 * estimates. Opening the draft's own request keeps one home as one record.
 *
 * The estimate is recomputed from the saved layout first, as
 * createQuoteRequestAction does, at today's rates and copper snapshot. A
 * draft can sit for weeks, and dealers should price the bill of materials the
 * engine produces today, not the one it produced the day the draft was saved.
 */
export async function requestQuotesAction(rawProjectId: unknown): Promise<RequestQuotesResult> {
  const authz = await requireRole(BUYER_ROLES);
  if (!authz.ok) {
    return {
      success: false,
      errorCode: authz.code,
      error:
        authz.code === "FORBIDDEN" ? "Dealer accounts cannot request quotes." : authz.error,
    };
  }

  const parsedId = recordIdSchema.safeParse(rawProjectId);
  if (!parsedId.success) {
    return { success: false, errorCode: "VALIDATION_ERROR", error: "Invalid project id." };
  }
  const projectId = parsedId.data;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      ownerId: true,
      projectName: true,
      inputData: true,
      quoteRequest: { select: { id: true, status: true } },
    },
  });

  if (!project?.quoteRequest) {
    return { success: false, errorCode: "NOT_FOUND", error: "Project not found." };
  }
  if (project.ownerId !== authz.userId) {
    return { success: false, errorCode: "FORBIDDEN", error: "You do not own this project." };
  }
  if (project.quoteRequest.status !== "DRAFT") {
    return {
      success: false,
      errorCode: "ALREADY_SENT",
      error: "This estimate has already been sent to dealers.",
    };
  }
  const quoteRequestId = project.quoteRequest.id;

  const savedInput: Prisma.JsonObject = isRecord(project.inputData)
    ? (project.inputData as Prisma.JsonObject)
    : {};
  const estimate = await runEstimate(savedInput.layout);
  if (!estimate.ok) {
    logger.warn("Draft could not be re-priced for quotes", {
      projectId,
      errorCode: estimate.errorCode,
    });
    if (estimate.errorCode === "VALIDATION_ERROR") {
      // Saved by an older calculator whose layout the current schema no
      // longer accepts. Opening it anyway would send dealers a stale bill.
      return {
        success: false,
        errorCode: "ESTIMATE_OUTDATED",
        error:
          "This estimate was saved by an older version of the calculator. Enter the home in the calculator again and request quotes from there.",
      };
    }
    return {
      success: false,
      errorCode: estimate.errorCode === "PRICING_DATA_MISSING" ? "PRICING_DATA_MISSING" : "INTERNAL_ERROR",
      error: estimate.error,
    };
  }

  const result = estimate.result;
  const visibilityCity = deriveVisibilityCity(result.phaseDecision?.regulatoryPolicyKey);
  // Null for a draft saved before the calculator asked for a pin code. It is
  // still sent: dealers are matched on visibilityCity, not the pin code.
  const pincode = estimate.layout.pincode ?? null;
  const now = new Date();

  try {
    await prisma.$transaction(async (tx) => {
      // The copper reading in force now, as at creation: the bill is
      // re-priced today, so it is stamped with today's snapshot.
      const snapshot = await tx.priceSnapshot.findFirst({
        where: { effectiveDate: { lte: now } },
        orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
        select: { id: true },
      });

      // Conditional on DRAFT, so a double click or a second tab cannot open
      // it twice: the loser matches no row and is told it was already sent.
      const opened = await tx.quoteRequest.updateMany({
        where: { id: quoteRequestId, status: "DRAFT" },
        data: {
          status: "OPEN",
          visibilityCity,
          visibilityPincode: pincode,
          expiresAt: rfqExpiryFrom(now),
          // Dealers read createdAt as the date the request was issued, and
          // their board is sorted by it. A draft's is the day it was saved,
          // so it is reset to the moment dealers can first see it.
          createdAt: now,
        },
      });
      if (opened.count === 0) throw new Error("ALREADY_SENT");

      await tx.project.update({
        where: { id: projectId },
        data: {
          status: "RFQ_SUBMITTED",
          priceSnapshotId: snapshot?.id ?? null,
          inputData: {
            ...savedInput,
            generatedAt: result.generatedAt,
            algorithmVersion: result.algorithmVersion,
            layout: JSON.parse(JSON.stringify(estimate.layout)) as Prisma.InputJsonValue,
          },
          bomData: JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue,
          totalEstimate: result.pricing.materialCost,
          pincode,
        },
      });
    });
  } catch (err) {
    if (err instanceof Error && err.message === "ALREADY_SENT") {
      return {
        success: false,
        errorCode: "ALREADY_SENT",
        error: "This estimate has already been sent to dealers.",
      };
    }
    logger.error("Failed to open a draft for quotes", {
      error: err instanceof Error ? err.message : "Unknown error",
      projectId,
    });
    return {
      success: false,
      errorCode: "INTERNAL_ERROR",
      error: "Could not send this estimate to dealers. Please try again.",
    };
  }

  await notifyRequestSaved({
    saveMode: "OPEN",
    projectId,
    quoteRequestId,
    projectName: project.projectName,
    visibilityCity,
    estimate: result,
  });

  return { success: true, quoteRequestId };
}

export async function submitQuoteAction(raw: SubmitQuoteInput): Promise<SubmitQuoteResult> {
  const authz = await requireRole(["DEALER"]);
  if (!authz.ok) {
    return {
      success: false,
      errorCode: authz.code,
      error: authz.code === "FORBIDDEN" ? "Only dealer accounts can submit quotes." : authz.error,
    };
  }

  const dealerId = authz.userId;
  const parsed = submitQuoteSchema.safeParse(raw);

  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    return {
      success: false,
      errorCode: "VALIDATION_ERROR",
      error: `Validation failed: ${message}`,
    };
  }

  for (let retry = 0; retry <= MAX_SERIALIZATION_RETRIES; retry += 1) {
    try {
      const outcome = await submitQuoteTransaction(parsed.data, dealerId);
      const result = mapOutcomeToResult(outcome);

      // Awaited so the send is not cut off when the response returns.
      if (result.success && !result.idempotent) {
        try {
          const [qr, dp] = await Promise.all([
            prisma.quoteRequest.findUnique({
              where: { id: parsed.data.quoteRequestId },
              include: {
                project: { include: { owner: { select: { email: true, name: true } } } },
              },
            }),
            prisma.dealerProfile.findUnique({
              where: { userId: dealerId },
              select: { companyName: true },
            }),
          ]);

          if (qr) {
            await sendQuoteReceivedNotification(qr.project.owner.email, {
              homeownerName: qr.project.owner.name ?? "Homeowner",
              projectName: qr.project.projectName,
              dealerCompany: dp?.companyName ?? "A dealer",
              quotePrice: parsed.data.totalPrice,
            }).catch((e) =>
              logger.error("Email: quote received notification failed", {
                error: String(e),
              })
            );
          }
        } catch (e) {
          logger.error("Email: owner lookup failed", { error: String(e) });
        }
      }

      return result;
    } catch (error) {
      if (isRetryableSerializationError(error)) {
        logger.warn("Quote submission serialization conflict", {
          retry,
          dealerId,
          quoteRequestId: parsed.data.quoteRequestId,
        });
        if (retry === MAX_SERIALIZATION_RETRIES) {
          logger.error("Quote submission retries exhausted", { dealerId });
          return {
            success: false,
            errorCode: "CONCURRENCY_RETRY_EXHAUSTED",
            error: "Quote submission conflicted repeatedly. Please retry in a moment.",
          };
        }

        const window = RETRY_WINDOWS_MS[retry];
        await sleep(randomIntInclusive(window.min, window.max));
        continue;
      }

      // Logged, not returned: a Prisma error message can carry table,
      // column and constraint names, which a caller has no business seeing.
      logger.error("Quote submission failed", {
        error: error instanceof Error ? error.message : "Unknown",
        dealerId,
        quoteRequestId: parsed.data.quoteRequestId,
      });
      return {
        success: false,
        errorCode: "INTERNAL_ERROR",
        error: "Quote submission failed. Please try again.",
      };
    }
  }

  return {
    success: false,
    errorCode: "CONCURRENCY_RETRY_EXHAUSTED",
    error: "Quote submission conflicted repeatedly. Please retry in a moment.",
  };
}

// ---------------------------------------------------------------------------
// Accept / Reject quote actions
// ---------------------------------------------------------------------------

export type QuoteDecisionResult =
  | { success: true }
  | { success: false; error: string };

/** Who may act on quotes as a buyer. Ownership of the project is checked
    again per quote; the role check only stops a dealer (or any future role)
    from reaching that far. */
const BUYER_ROLES = ["HOMEOWNER", "ADMIN"] as const;

/** Role guard, then id validation — both before any query runs. */
async function authorizeBuyerDecision(
  rawQuoteId: unknown
): Promise<{ ok: true; userId: string; quoteId: string } | { ok: false; error: string }> {
  const authz = await requireRole(BUYER_ROLES);
  if (!authz.ok) return { ok: false, error: authz.error };

  const parsedId = recordIdSchema.safeParse(rawQuoteId);
  if (!parsedId.success) return { ok: false, error: "Invalid quote id." };

  return { ok: true, userId: authz.userId, quoteId: parsedId.data };
}

export async function acceptQuoteAction(rawQuoteId: string): Promise<QuoteDecisionResult> {
  const guard = await authorizeBuyerDecision(rawQuoteId);
  if (!guard.ok) return { success: false, error: guard.error };
  const { userId, quoteId } = guard;

  for (let attempt = 0; attempt <= MAX_SERIALIZATION_RETRIES; attempt++) {
    try {
      await prisma.$transaction(
        async (tx) => {
          // All verification inside the serializable transaction — no
          // check-then-act gap between pre-fetch and mutation.
          const quote = await tx.quote.findUnique({
            where: { id: quoteId },
            include: {
              quoteRequest: {
                include: {
                  project: { select: { ownerId: true, id: true } },
                },
              },
            },
          });

          if (!quote) throw new Error("QUOTE_NOT_FOUND");
          if (quote.quoteRequest.project.ownerId !== userId)
            throw new Error("NOT_OWNER");
          if (quote.status !== "SUBMITTED")
            throw new Error("ALREADY_PROCESSED");
          // Not OPEN means a quote on this request was already accepted
          // (CLOSED); nothing else ever moves an OPEN request on.
          if (quote.quoteRequest.status !== "OPEN")
            throw new Error("RFQ_NOT_OPEN");
          // A validity window the platform will not enforce is decoration.
          // Accepting a lapsed price binds the dealer to a copper rate that
          // may have moved under them, which is exactly what the field exists
          // to prevent.
          //
          // It is also the only deadline. The request's own expiresAt and
          // its quote limit stop new bids; they do not end the buyer's
          // choice. Refusing once bidding closed meant a buyer who waited
          // for every bid, as a sealed-bid auction invites, could accept
          // none of them. The rule is isQuoteAcceptable in validity.ts.
          if (isExpired(quote.validUntil)) throw new Error("QUOTE_EXPIRED");

          // 1. Accept this quote
          await tx.quote.update({
            where: { id: quoteId },
            data: { status: "ACCEPTED" },
          });

          // 2. Reject all competing quotes
          await tx.quote.updateMany({
            where: {
              quoteRequestId: quote.quoteRequestId,
              id: { not: quoteId },
              status: "SUBMITTED",
            },
            data: { status: "REJECTED" },
          });

          // 3. Close the QuoteRequest
          await tx.quoteRequest.update({
            where: { id: quote.quoteRequestId },
            data: { status: "CLOSED" },
          });

          // 4. Lock the Project
          await tx.project.update({
            where: { id: quote.quoteRequest.project.id },
            data: { status: "CLOSED" },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );

      // Awaited: the winning dealer's email carries the homeowner's contact
      // details, which is the entire payoff of accepting a quote. Dropping
      // it would strand both sides.
      try {
        const q = await prisma.quote.findUnique({
          where: { id: quoteId },
          include: {
            dealer: { select: { email: true, name: true, dealerProfile: { select: { companyName: true } } } },
            quoteRequest: {
              include: {
                project: { include: { owner: { select: { name: true, email: true, phone: true } } } },
                quotes: { where: { id: { not: quoteId }, status: "REJECTED" }, include: { dealer: { select: { email: true, name: true } } } },
              },
            },
          },
        });

        if (q) {
          const owner = q.quoteRequest.project.owner;
          const sends: Promise<unknown>[] = [
            // Winning dealer, with homeowner contact
            sendQuoteAcceptedNotification(q.dealer.email, {
              dealerName: q.dealer.name ?? q.dealer.dealerProfile?.companyName ?? "Dealer",
              projectName: q.quoteRequest.project.projectName,
              homeownerName: owner.name ?? "Homeowner",
              homeownerEmail: owner.email,
              homeownerPhone: owner.phone,
            }),
            // Everyone who lost
            ...q.quoteRequest.quotes.map((rq) =>
              sendQuoteRejectedNotification(rq.dealer.email, {
                dealerName: rq.dealer.name ?? "Dealer",
                projectName: q.quoteRequest.project.projectName,
              })
            ),
          ];

          const results = await Promise.allSettled(sends);
          for (const r of results) {
            if (r.status === "rejected") {
              logger.error("Email: post-accept notification failed", {
                error: String(r.reason),
              });
            }
          }
        }
      } catch (e) {
        logger.error("Email: post-accept lookup failed", { error: String(e) });
      }

      return { success: true };
    } catch (err) {
      // Business logic errors — return immediately, don't retry
      if (err instanceof Error) {
        switch (err.message) {
          case "QUOTE_NOT_FOUND":
            return { success: false, error: "Quote not found." };
          case "NOT_OWNER":
            return { success: false, error: "You do not own this project." };
          case "ALREADY_PROCESSED":
            return { success: false, error: "This quote has already been processed." };
          case "RFQ_NOT_OPEN":
            return { success: false, error: "A quote on this request has already been accepted." };
          case "QUOTE_EXPIRED":
            return {
              success: false,
              error:
                "This quote has passed its validity date. Ask the dealer to requote at current rates.",
            };
        }
      }

      // Serialization conflicts — retry with jittered backoff
      if (isRetryableSerializationError(err) && attempt < MAX_SERIALIZATION_RETRIES) {
        const delay = RETRY_WINDOWS_MS[attempt];
        await sleep(randomIntInclusive(delay.min, delay.max));
        continue;
      }

      logger.error("Failed to accept quote", {
        error: err instanceof Error ? err.message : "Unknown",
        quoteId,
        attempt,
      });
      return { success: false, error: "Failed to accept quote. Please try again." };
    }
  }

  return { success: false, error: "Failed to accept quote after retries. Please try again." };
}

export async function rejectQuoteAction(rawQuoteId: string): Promise<QuoteDecisionResult> {
  const guard = await authorizeBuyerDecision(rawQuoteId);
  if (!guard.ok) return { success: false, error: guard.error };
  const { userId, quoteId } = guard;

  for (let attempt = 0; attempt <= MAX_SERIALIZATION_RETRIES; attempt++) {
    try {
      await prisma.$transaction(
        async (tx) => {
          const quote = await tx.quote.findUnique({
            where: { id: quoteId },
            include: {
              quoteRequest: {
                include: {
                  project: { select: { ownerId: true } },
                },
              },
            },
          });

          if (!quote) throw new Error("QUOTE_NOT_FOUND");
          if (quote.quoteRequest.project.ownerId !== userId)
            throw new Error("NOT_OWNER");
          if (quote.status !== "SUBMITTED")
            throw new Error("ALREADY_PROCESSED");

          await tx.quote.update({
            where: { id: quoteId },
            data: { status: "REJECTED" },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );

      // Awaited so the send survives the response returning.
      try {
        const q = await prisma.quote.findUnique({
          where: { id: quoteId },
          include: {
            dealer: { select: { email: true, name: true } },
            quoteRequest: { include: { project: { select: { projectName: true } } } },
          },
        });

        if (q) {
          await sendQuoteRejectedNotification(q.dealer.email, {
            dealerName: q.dealer.name ?? "Dealer",
            projectName: q.quoteRequest.project.projectName,
          }).catch((e) =>
            logger.error("Email: reject notification failed", { error: String(e) })
          );
        }
      } catch (e) {
        logger.error("Email: post-reject lookup failed", { error: String(e) });
      }

      return { success: true };
    } catch (err) {
      if (err instanceof Error) {
        switch (err.message) {
          case "QUOTE_NOT_FOUND":
            return { success: false, error: "Quote not found." };
          case "NOT_OWNER":
            return { success: false, error: "You do not own this project." };
          case "ALREADY_PROCESSED":
            return { success: false, error: "This quote has already been processed." };
        }
      }

      if (isRetryableSerializationError(err) && attempt < MAX_SERIALIZATION_RETRIES) {
        const delay = RETRY_WINDOWS_MS[attempt];
        await sleep(randomIntInclusive(delay.min, delay.max));
        continue;
      }

      logger.error("Failed to reject quote", {
        error: err instanceof Error ? err.message : "Unknown",
        quoteId,
        attempt,
      });
      return { success: false, error: "Failed to reject quote. Please try again." };
    }
  }

  return { success: false, error: "Failed to reject quote after retries. Please try again." };
}

// ---------------------------------------------------------------------------
// Hide quote ("Remove" in the UI)
// ---------------------------------------------------------------------------

/**
 * Drops a quote out of the buyer's comparison matrix.
 *
 * This is a view preference, not a deletion. The row is untouched: the dealer
 * still sees it in their history, it still counts toward the RFQ's quoteCount,
 * and it still feeds admin analytics. Only `getQuotesForProject` filters on it.
 *
 * Two kinds of quote are refused, and both for the same reason — hiding would
 * leave someone stranded:
 *
 *   SUBMITTED, still acceptable    the dealer is actively waiting on an answer.
 *                                  Making their quote silently vanish from the
 *                                  buyer's screen means it is never accepted
 *                                  and never rejected. Reject it first; that
 *                                  sends the dealer their notification, and the
 *                                  row can then be removed. Bidding having
 *                                  closed does not change this: the buyer can
 *                                  still accept the quote until it lapses.
 *
 *   ACCEPTED                       this is the deal in progress. The dealer's
 *                                  phone and email are only rendered on that
 *                                  row, so hiding it destroys the buyer's only
 *                                  route to the person they just hired.
 *
 * A SUBMITTED quote whose price has lapsed, or whose request already has an
 * accepted quote, *can* be hidden: nobody is waiting on it any more, and stale
 * rows are exactly what needs clearing. The rule is isQuoteHideable in
 * validity.ts, which the quote matrix reads too.
 */
export async function hideQuoteAction(rawQuoteId: string): Promise<QuoteDecisionResult> {
  const guard = await authorizeBuyerDecision(rawQuoteId);
  if (!guard.ok) return { success: false, error: guard.error };
  const { userId, quoteId } = guard;

  try {
    const quote = await prisma.quote.findUnique({
      where: { id: quoteId },
      select: {
        status: true,
        isHidden: true,
        validUntil: true,
        quoteRequest: {
          select: {
            status: true,
            project: { select: { ownerId: true } },
          },
        },
      },
    });

    if (!quote) {
      return { success: false, error: "Quote not found." };
    }

    if (quote.quoteRequest.project.ownerId !== userId) {
      return { success: false, error: "You do not own this project." };
    }

    if (quote.status === "ACCEPTED") {
      return {
        success: false,
        error: "You cannot remove the quote you accepted — it holds the dealer's contact details.",
      };
    }

    const hideable = isQuoteHideable(
      { status: quote.status, lapsed: isExpired(quote.validUntil) },
      quote.quoteRequest.status === "CLOSED"
    );
    if (!hideable) {
      return {
        success: false,
        error: "Reject this quote first. The dealer is still waiting on a decision.",
      };
    }

    // Idempotent: hiding an already-hidden quote is a no-op success, so a
    // double click or a stale tab cannot produce a spurious error.
    if (!quote.isHidden) {
      await prisma.quote.update({
        where: { id: quoteId },
        data: { isHidden: true },
      });
    }

    return { success: true };
  } catch (err) {
    logger.error("Failed to hide quote", {
      error: err instanceof Error ? err.message : "Unknown",
      quoteId,
    });
    return { success: false, error: "Failed to remove quote. Please try again." };
  }
}

