import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { jar, login, action, get, check, summary } from "./lib.mjs";

const prisma = new PrismaClient();

// Server action IDs change from build to build, so they are looked up by
// export name in the manifest of the build under test rather than pasted in.
const manifest = JSON.parse(
  readFileSync(new URL("../.next/server/server-reference-manifest.json", import.meta.url), "utf8")
);
const idByExport = Object.fromEntries(
  Object.entries(manifest.node).map(([id, entry]) => [entry.exportedName, id])
);
function actionId(exportName) {
  const id = idByExport[exportName];
  if (!id) throw new Error(`No server action "${exportName}" in this build. Was it renamed? Rebuild first.`);
  return id;
}

const A = {
  accept: actionId("acceptQuoteAction"),
  reject: actionId("rejectQuoteAction"),
  hide: actionId("hideQuoteAction"),
  submitQuote: actionId("submitQuoteAction"),
  saveProfile: actionId("saveDealerProfileAction"),
  createQuoteRequest: actionId("createQuoteRequestAction"),
  createPriceSnapshot: actionId("createPriceSnapshotAction"),
  requestQuotes: actionId("requestQuotesAction"),
  estimate: actionId("generateEstimateAction"),
};

const home = await prisma.user.findUnique({ where: { email: "homeowner@example.com" } });
const dealer = await prisma.user.findUnique({ where: { email: "dealer@example.com" } });
const dealer2 = await prisma.user.findUnique({ where: { email: "dealer2@example.com" } });

const PID = "e2e-flow";

async function reset() {
  await prisma.project.deleteMany({ where: { id: PID } });
  const p = await prisma.project.create({
    data: {
      id: PID, ownerId: home.id, projectName: "E2E flow", projectType: "RESIDENTIAL",
      status: "RFQ_SUBMITTED", inputData: {},
      bomData: { pricing: { materialCost: 50000 }, totalConnectedLoadKw: 6, maxDemandKw: 4 },
      totalEstimate: 50000,
    },
  });
  const rfq = await prisma.quoteRequest.create({
    data: {
      projectId: p.id, status: "OPEN", visibilityCity: "NCR", maxQuotes: 5, quoteCount: 2,
      expiresAt: new Date(Date.now() + 72 * 3600e3),
    },
  });
  const q1 = await prisma.quote.create({
    data: {
      quoteRequestId: rfq.id, dealerId: dealer.id, clientRequestId: "e2e-q1",
      totalPrice: 48000, brandOffered: "Polycab", wireGrade: "FR", deliveryDays: 3,
      status: "SUBMITTED", validUntil: new Date(Date.now() + 72 * 3600e3),
    },
  });
  const q2 = await prisma.quote.create({
    data: {
      quoteRequestId: rfq.id, dealerId: dealer2.id, clientRequestId: "e2e-q2",
      totalPrice: 52000, brandOffered: "Finolex", wireGrade: "ZHFR", deliveryDays: 5,
      status: "SUBMITTED", validUntil: new Date(Date.now() + 72 * 3600e3),
    },
  });
  return { p, rfq, q1, q2 };
}

console.log("\n=== 1. AUTH ===");
const buyer = jar();
const u1 = await login(buyer, "homeowner@example.com", "password123");
check("homeowner signs in", u1.role === "HOMEOWNER", u1.role);
const dlr = jar();
const u2 = await login(dlr, "dealer@example.com", "password123");
check("dealer signs in", u2.role === "DEALER", u2.role);
const adm = jar();
const u3 = await login(adm, "admin@example.com", "password123");
check("admin signs in", u3.role === "ADMIN", u3.role);

console.log("\n=== 2. ROLE ROUTING ===");
check("dealer bounced off the buyer dashboard", (await get(dlr, "/dashboard")).status === 307);
check("homeowner bounced off /admin", (await get(buyer, "/admin")).status === 307);
check("admin reaches /admin", (await get(adm, "/admin")).status === 200);
check("homeowner reaches their dashboard", (await get(buyer, "/dashboard")).status === 200);

console.log("\n=== 3. BUYER SEES SEEDED PROJECTS ===");
{
  const r = await get(buyer, "/dashboard");
  check(
    "all three seeded projects listed",
    r.body.includes("2BHK Noida Sector 62") &&
      r.body.includes("4BHK Duplex") &&
      r.body.includes("1BHK Dwarka")
  );
}

console.log("\n=== 4. REJECT ===");
{
  const { p, q2 } = await reset();
  const r = await action(buyer, `/dashboard/project/${p.id}/quotes`, A.reject, [q2.id]);
  check("reject succeeds", r.result?.success === true, JSON.stringify(r.result));
  const after = await prisma.quote.findUnique({ where: { id: q2.id } });
  check("quote is REJECTED in the database", after.status === "REJECTED", after.status);
  const page = await get(buyer, `/dashboard/project/${p.id}/quotes`);
  check("rejected quote still visible: hidden is not rejected", page.body.includes("Finolex"));
}

console.log("\n=== 5. HIDE, THE REMOVE BUTTON ===");
{
  const q2 = await prisma.quote.findUnique({ where: { clientRequestId: "e2e-q2" } });
  const r = await action(buyer, `/dashboard/project/${PID}/quotes`, A.hide, [q2.id]);
  check("hide succeeds on a rejected quote", r.result?.success === true, JSON.stringify(r.result));
  const row = await prisma.quote.findUnique({ where: { id: q2.id } });
  check("row still exists, hidden not deleted", row !== null);
  check("isHidden is set", row.isHidden === true);
  const page = await get(buyer, `/dashboard/project/${PID}/quotes`);
  check("hidden quote gone from the matrix", !page.body.includes("Finolex"));
  check("the other quote is still there", page.body.includes("Polycab"));
  const again = await action(buyer, `/dashboard/project/${PID}/quotes`, A.hide, [q2.id]);
  check("hiding twice is idempotent", again.result?.success === true);
}

console.log("\n=== 6. HIDE GUARDS ===");
{
  const { p, q1 } = await reset();
  const r = await action(buyer, `/dashboard/project/${p.id}/quotes`, A.hide, [q1.id]);
  check(
    "cannot hide a live quote on an open RFQ",
    r.result?.success === false && /Reject this quote first/.test(r.result?.error ?? ""),
    JSON.stringify(r.result)
  );
}

console.log("\n=== 7. CROSS-TENANT ===");
{
  const q1 = await prisma.quote.findUnique({ where: { clientRequestId: "e2e-q1" } });
  const other = jar();
  await login(other, "dealer@example.com", "password123");

  // The dealer owns this QUOTE but not the PROJECT. Assert the security
  // property (the row is untouched) rather than a particular error payload:
  // routing answers 307 before the action can return one, so checking for an
  // error object would be testing the redirect, not the guard.
  const before = await prisma.quote.findUnique({ where: { id: q1.id } });
  const viaQuotes = await action(other, `/dashboard/project/${PID}/quotes`, A.hide, [q1.id]);
  const viaOwnPage = await action(other, "/dealer/dashboard", A.hide, [q1.id]);
  const after = await prisma.quote.findUnique({ where: { id: q1.id } });

  check("cross-tenant hide is refused at the routing layer", viaQuotes.status === 307, String(viaQuotes.status));
  check(
    "cross-tenant hide leaves the row untouched, by either route",
    before.isHidden === false && after.isHidden === false,
    `before=${before.isHidden} after=${after.isHidden} (status ${viaOwnPage.status})`
  );

  const page = await get(other, `/dashboard/project/${PID}/quotes`);
  check("a non-owner is redirected away from the quotes page", page.status === 307, String(page.status));
}

console.log("\n=== 8. ACCEPT ===");
{
  const { p, q1, q2 } = await reset();
  const r = await action(buyer, `/dashboard/project/${p.id}/quotes`, A.accept, [q1.id]);
  check("accept succeeds", r.result?.success === true, JSON.stringify(r.result));
  const [a, b, rfq, proj] = await Promise.all([
    prisma.quote.findUnique({ where: { id: q1.id } }),
    prisma.quote.findUnique({ where: { id: q2.id } }),
    prisma.quoteRequest.findUnique({ where: { projectId: p.id } }),
    prisma.project.findUnique({ where: { id: p.id } }),
  ]);
  check("winner is ACCEPTED", a.status === "ACCEPTED", a.status);
  check("competing quote auto-REJECTED", b.status === "REJECTED", b.status);
  check("RFQ closed", rfq.status === "CLOSED", rfq.status);
  check("project locked", proj.status === "CLOSED", proj.status);
  const page = await get(buyer, `/dashboard/project/${p.id}/quotes`);
  check("dealer contact released only after acceptance", page.body.includes("dealer@example.com"));
}

console.log("\n=== 9. LAPSED QUOTE CANNOT BE ACCEPTED ===");
{
  const { p, q1 } = await reset();
  await prisma.quote.update({
    where: { id: q1.id },
    data: { validUntil: new Date(Date.now() - 864e5) },
  });
  const r = await action(buyer, `/dashboard/project/${p.id}/quotes`, A.accept, [q1.id]);
  check(
    "lapsed price is refused",
    r.result?.success === false && /validity date/.test(r.result?.error ?? ""),
    JSON.stringify(r.result)
  );
  const page = await get(buyer, `/dashboard/project/${p.id}/quotes`);
  check("matrix shows it as Lapsed", page.body.includes("Lapsed"));
}

console.log("\n=== 10. DEALER SUBMITS A BID ===");
{
  const target = await prisma.quoteRequest.findFirst({ where: { project: { id: "seed-project-002" } } });
  await prisma.quote.deleteMany({ where: { quoteRequestId: target.id } });
  await prisma.quoteRequest.update({
    where: { id: target.id },
    data: { status: "OPEN", quoteCount: 0, expiresAt: new Date(Date.now() + 72 * 3600e3) },
  });

  const r = await action(dlr, `/dealer/rfq/${target.id}`, A.submitQuote, [
    {
      quoteRequestId: target.id,
      clientRequestId: crypto.randomUUID(),
      totalPrice: 165000,
      brandOffered: "Havells",
      wireGrade: "FRLS",
      deliveryDays: 4,
    },
  ]);
  check("bid accepted", r.result?.success === true, JSON.stringify(r.result));

  const saved = await prisma.quote.findFirst({
    where: { quoteRequestId: target.id, dealerId: dealer.id },
  });
  check("wireGrade persisted", saved?.wireGrade === "FRLS", String(saved?.wireGrade));
  check(
    "validUntil defaulted to about 72 hours",
    saved?.validUntil != null &&
      Math.abs(saved.validUntil.getTime() - Date.now() - 72 * 3600e3) < 3600e3,
    String(saved?.validUntil)
  );
  check("brand and price persisted", saved?.brandOffered === "Havells" && saved?.totalPrice === 165000);

  const dup = await action(dlr, `/dealer/rfq/${target.id}`, A.submitQuote, [
    {
      quoteRequestId: target.id,
      clientRequestId: crypto.randomUUID(),
      totalPrice: 1,
      brandOffered: "Dup",
      wireGrade: "FR",
    },
  ]);
  check(
    "a dealer cannot bid twice on one RFQ",
    dup.result?.success === false && dup.result?.errorCode === "DUPLICATE_DEALER_QUOTE",
    JSON.stringify(dup.result)
  );
}

console.log("\n=== 11. UNAPPROVED DEALER CANNOT BID ===");
{
  const pending = jar();
  await login(pending, "dealer2@example.com", "password123");
  const target = await prisma.quoteRequest.findFirst({ where: { project: { id: "seed-project-002" } } });
  await prisma.quote.deleteMany({ where: { quoteRequestId: target.id, dealerId: dealer2.id } });
  const r = await action(pending, `/dealer/rfq/${target.id}`, A.submitQuote, [
    {
      quoteRequestId: target.id,
      clientRequestId: crypto.randomUUID(),
      totalPrice: 1000,
      brandOffered: "X",
      wireGrade: "FR",
    },
  ]);
  check(
    "pending dealer is refused",
    r.result?.success === false && r.result?.errorCode === "DEALER_PROFILE_MISSING",
    JSON.stringify(r.result)
  );
}

console.log("\n=== 12. BOARD SCHEDULE ON THE REQUISITION ===");
{
  const target = await prisma.quoteRequest.findFirst({ where: { project: { id: "seed-project-002" } } });
  const page = await get(dlr, `/dealer/rfq/${target.id}`);
  check("requisition renders the board schedule", page.body.includes("Distribution Board Schedule"));
  check(
    "three-phase rails rendered",
    page.body.includes("R — Red") && page.body.includes("Y — Yellow") && page.body.includes("B — Blue")
  );
  check("CEA disclaimer present", page.body.includes("CEA-licensed electrical contractor"));
  check("coil counts stated", /\d+ × \d+ m/.test(page.body));
}

console.log("\n=== 13. EXPIRED RFQ DROPS OFF THE DEALER BOARD ===");
{
  const target = await prisma.quoteRequest.findFirst({ where: { project: { id: "seed-project-002" } } });
  await prisma.quote.deleteMany({ where: { quoteRequestId: target.id } });
  await prisma.quoteRequest.update({
    where: { id: target.id },
    data: { status: "OPEN", quoteCount: 0, expiresAt: new Date(Date.now() - 3600e3) },
  });
  const board = await get(dlr, "/dealer/dashboard");
  check("expired RFQ is not offered to the dealer", !board.body.includes("4BHK Duplex"));
  const detail = await get(dlr, `/dealer/rfq/${target.id}`);
  check("its detail page reads EXPIRED", detail.body.includes("EXPIRED"));
  check("bidding is closed on it", detail.body.includes("not accepting bids"));
  await prisma.quoteRequest.update({
    where: { id: target.id },
    data: { expiresAt: new Date(Date.now() + 72 * 3600e3) },
  });
}

console.log("\n=== 14. PAYLOAD AND ROLE GUARDS ===");
{
  // Every action is a public endpoint; these send what the UI never would.
  const target = await prisma.quoteRequest.findFirst({ where: { project: { id: "seed-project-002" } } });
  await prisma.quote.deleteMany({ where: { quoteRequestId: target.id } });
  await prisma.quoteRequest.update({
    where: { id: target.id },
    data: { status: "OPEN", quoteCount: 0, expiresAt: new Date(Date.now() + 72 * 3600e3) },
  });
  const bid = (extra) => ({
    quoteRequestId: target.id,
    clientRequestId: crypto.randomUUID(),
    totalPrice: 90000,
    brandOffered: "Polycab",
    wireGrade: "FR",
    ...extra,
  });

  const smuggled = await action(dlr, `/dealer/rfq/${target.id}`, A.submitQuote, [
    bid({ validUntil: "2036-01-01T00:00:00.000Z" }),
  ]);
  check(
    "a caller-supplied validUntil is refused, not honoured",
    smuggled.result?.errorCode === "VALIDATION_ERROR",
    JSON.stringify(smuggled.result)
  );
  const huge = await action(dlr, `/dealer/rfq/${target.id}`, A.submitQuote, [bid({ totalPrice: 1e12 })]);
  check("an absurd total is refused", huge.result?.errorCode === "VALIDATION_ERROR", JSON.stringify(huge.result));
  check(
    "neither reached the database",
    (await prisma.quote.count({ where: { quoteRequestId: target.id } })) === 0
  );

  const { q1 } = await reset();
  const objectId = await action(buyer, `/dashboard/project/${PID}/quotes`, A.hide, [{ not: "x" }]);
  check(
    "an object in place of an id is refused before any query",
    objectId.result?.success === false && /Invalid quote id/.test(objectId.result?.error ?? ""),
    JSON.stringify(objectId.result)
  );

  const dealerAccept = await action(dlr, "/dealer/dashboard", A.accept, [q1.id]);
  const afterDealer = await prisma.quote.findUnique({ where: { id: q1.id } });
  check(
    "a dealer cannot call the buyer's accept action",
    dealerAccept.result?.success !== true && afterDealer.status === "SUBMITTED",
    `${JSON.stringify(dealerAccept.result)} status=${afterDealer.status}`
  );

  // The session token still says DEALER and active; the database says not.
  await prisma.user.update({ where: { id: dealer.id }, data: { isActive: false } });
  try {
    const stale = await action(dlr, `/dealer/rfq/${target.id}`, A.submitQuote, [bid({})]);
    check(
      "a deactivated account is refused despite a still-valid session",
      stale.result?.errorCode === "UNAUTHENTICATED",
      JSON.stringify(stale.result)
    );
  } finally {
    await prisma.user.update({ where: { id: dealer.id }, data: { isActive: true } });
  }
}

console.log("\n=== 15. DEALER RE-VERIFICATION ===");
{
  const original = await prisma.dealerProfile.findUnique({ where: { userId: dealer.id } });
  const form = (over) => ({
    companyName: original.companyName,
    gstin: original.gstin ?? "",
    address: original.address,
    city: original.city,
    state: original.state,
    pincode: original.pincode,
    serviceAreas: original.serviceAreas.join(", "),
    brandsSold: original.brandsSold.join(", "),
    ...over,
  });
  const status = async () =>
    (await prisma.dealerProfile.findUnique({ where: { userId: dealer.id } })).approvalStatus;

  try {
    const moved = await action(dlr, "/dealer/profile/setup", A.saveProfile, [
      form({ address: "M-15, Palika Bhawan, Nehru Place" }),
    ]);
    check(
      "an address change keeps approval",
      moved.result?.success === true && moved.result?.reverification === false && (await status()) === "APPROVED",
      JSON.stringify(moved.result)
    );

    const renamed = await action(dlr, "/dealer/profile/setup", A.saveProfile, [
      form({ companyName: "Singh Traders Pvt Ltd" }),
    ]);
    check(
      "a new company name sends the profile back to PENDING",
      renamed.result?.reverification === true && (await status()) === "PENDING",
      JSON.stringify(renamed.result)
    );

    const target = await prisma.quoteRequest.findFirst({ where: { project: { id: "seed-project-002" } } });
    await prisma.quote.deleteMany({ where: { quoteRequestId: target.id } });
    await prisma.quoteRequest.update({
      where: { id: target.id },
      data: { status: "OPEN", quoteCount: 0, expiresAt: new Date(Date.now() + 72 * 3600e3) },
    });
    const bidWhilePending = await action(dlr, `/dealer/rfq/${target.id}`, A.submitQuote, [
      {
        quoteRequestId: target.id,
        clientRequestId: crypto.randomUUID(),
        totalPrice: 90000,
        brandOffered: "Polycab",
        wireGrade: "FR",
      },
    ]);
    check(
      "and bidding stops until an admin re-verifies",
      bidWhilePending.result?.errorCode === "DEALER_PROFILE_MISSING",
      JSON.stringify(bidWhilePending.result)
    );

    await prisma.dealerProfile.update({
      where: { userId: dealer.id },
      data: { companyName: original.companyName, approvalStatus: "APPROVED" },
    });
    const regst = await action(dlr, "/dealer/profile/setup", A.saveProfile, [
      form({ gstin: "07AAACH7409R2ZZ" }),
    ]);
    check(
      "a new GSTIN does the same",
      regst.result?.reverification === true && (await status()) === "PENDING",
      JSON.stringify(regst.result)
    );
  } finally {
    await prisma.dealerProfile.update({
      where: { userId: dealer.id },
      data: {
        companyName: original.companyName,
        gstin: original.gstin,
        address: original.address,
        approvalStatus: original.approvalStatus,
      },
    });
  }
}

console.log("\n=== 16. COPPER PRICE SNAPSHOTS ===");
{
  const made = [];
  let projectId = null;
  try {
    const before = await prisma.priceSnapshot.count();
    await action(buyer, "/admin", A.createPriceSnapshot, [1400, "MCX"]);
    check(
      "a homeowner cannot record a copper rate",
      (await prisma.priceSnapshot.count()) === before
    );

    const slip = await action(adm, "/admin", A.createPriceSnapshot, [14600, "LME"]);
    check(
      "an LME $/tonne figure is refused as a unit slip",
      slip.result?.success === false && /tonne/.test(slip.result?.error ?? ""),
      JSON.stringify(slip.result)
    );

    const created = await action(adm, "/admin", A.createPriceSnapshot, [1415.5, "MCX"]);
    if (created.result?.snapshotId) made.push(created.result.snapshotId);
    const row = created.result?.snapshotId
      ? await prisma.priceSnapshot.findUnique({ where: { id: created.result.snapshotId } })
      : null;
    check(
      "an admin records today's rate, dated by the server",
      row?.baseCopperRate === 1415.5 &&
        row?.source === "MCX" &&
        Math.abs(row.effectiveDate.getTime() - Date.now()) < 60e3,
      JSON.stringify(created.result)
    );

    const layout = {
      propertyType: "FLAT", city: "NCR", pincode: "110001", bedrooms: 2, bathrooms: 2, balconies: 1,
      totalFloors: 1, approxSqFt: 1050, modularKitchen: true, acInBedrooms: true,
      acInLivingRoom: false, geyserInBathrooms: true,
    };
    const saved = await action(buyer, "/calculator", A.createQuoteRequest, [
      { ...layout, priceSnapshotId: "attacker-picked" },
      "DRAFT",
    ]);
    const qr = saved.result?.quoteRequestId
      ? await prisma.quoteRequest.findUnique({
          where: { id: saved.result.quoteRequestId },
          include: { project: true },
        })
      : null;
    projectId = qr?.project.id ?? null;
    check(
      "a saved project is stamped with the latest snapshot, not one named in the payload",
      saved.result?.success === true && qr?.project.priceSnapshotId === created.result?.snapshotId,
      `${JSON.stringify(saved.result)} stamped=${qr?.project.priceSnapshotId}`
    );

    let restricted = false;
    try {
      await prisma.priceSnapshot.delete({ where: { id: created.result.snapshotId } });
      made.length = 0; // deleted after all, so nothing to clean up
    } catch {
      restricted = true;
    }
    check("a snapshot a project points at cannot be deleted", restricted);
  } finally {
    if (projectId) await prisma.project.delete({ where: { id: projectId } });
    if (made.length) await prisma.priceSnapshot.deleteMany({ where: { id: { in: made } } });
  }
}

console.log("\n=== 17. A FULL REQUEST CAN STILL BE AWARDED ===");
{
  // Filling the last slot used to set the request to CLOSED, after which its
  // buyer could accept none of the bids on it.
  const FID = "e2e-full";
  await prisma.project.deleteMany({ where: { id: FID } });
  try {
    const p = await prisma.project.create({
      data: {
        id: FID, ownerId: home.id, projectName: "E2E full request", projectType: "RESIDENTIAL",
        status: "RFQ_SUBMITTED", inputData: {},
        bomData: { pricing: { materialCost: 50000 }, totalConnectedLoadKw: 6, maxDemandKw: 4 },
        totalEstimate: 50000,
      },
    });
    const rfq = await prisma.quoteRequest.create({
      data: {
        projectId: p.id, status: "OPEN", visibilityCity: "NCR", maxQuotes: 2, quoteCount: 1,
        expiresAt: new Date(Date.now() + 72 * 3600e3),
      },
    });
    const first = await prisma.quote.create({
      data: {
        quoteRequestId: rfq.id, dealerId: dealer2.id, clientRequestId: "e2e-full-q1",
        totalPrice: 51000, brandOffered: "Standard range", wireGrade: "FRLS", deliveryDays: 4,
        status: "SUBMITTED", validUntil: new Date(Date.now() + 72 * 3600e3),
      },
    });
    const listed = (body) => body.includes(`/dealer/rfq/${rfq.id}`);

    check("a request with a free slot is on the dealer board", listed((await get(dlr, "/dealer/dashboard")).body));

    // Full of other dealers' bids: off the board, and the form is withheld.
    await prisma.quoteRequest.update({ where: { id: rfq.id }, data: { maxQuotes: 1 } });
    check("a full request leaves the dealer board", !listed((await get(dlr, "/dealer/dashboard")).body));
    const fullDetail = await get(dlr, `/dealer/rfq/${rfq.id}`);
    check(
      "its requisition reads FULL and takes no bid",
      fullDetail.body.includes("FULL") && fullDetail.body.includes("not accepting bids")
    );
    const refused = await action(dlr, `/dealer/rfq/${rfq.id}`, A.submitQuote, [
      { quoteRequestId: rfq.id, clientRequestId: crypto.randomUUID(), totalPrice: 49000, brandOffered: "Value range", wireGrade: "FR" },
    ]);
    check("a bid on it is refused", refused.result?.errorCode === "MAX_QUOTES_REACHED", JSON.stringify(refused.result));
    await prisma.quoteRequest.update({ where: { id: rfq.id }, data: { maxQuotes: 2 } });

    // Now fill the last slot through the action itself.
    const bid = await action(dlr, `/dealer/rfq/${rfq.id}`, A.submitQuote, [
      { quoteRequestId: rfq.id, clientRequestId: crypto.randomUUID(), totalPrice: 49000, brandOffered: "Value range", wireGrade: "FR", deliveryDays: 3 },
    ]);
    check("the last slot is filled", bid.result?.success === true, JSON.stringify(bid.result));
    const full = await prisma.quoteRequest.findUnique({ where: { id: rfq.id } });
    check(
      "a full request stays OPEN for its buyer",
      full.status === "OPEN" && full.quoteCount === 2,
      `${full.status} ${full.quoteCount}`
    );
    check(
      "the buyer is told bidding has closed",
      (await get(buyer, `/dashboard/project/${FID}/quotes`)).body.includes("Bidding has closed")
    );

    const accept = await action(buyer, `/dashboard/project/${FID}/quotes`, A.accept, [first.id]);
    check("the buyer accepts a bid on a full request", accept.result?.success === true, JSON.stringify(accept.result));
    const [won, after] = await Promise.all([
      prisma.quote.findUnique({ where: { id: first.id } }),
      prisma.quoteRequest.findUnique({ where: { id: rfq.id } }),
    ]);
    check("and only that closes it", won.status === "ACCEPTED" && after.status === "CLOSED", `${won.status} ${after.status}`);
  } finally {
    await prisma.project.deleteMany({ where: { id: FID } });
  }
}

console.log("\n=== 18. AFTER THE 72 HOURS, A VALID BID CAN STILL BE ACCEPTED ===");
{
  const { p, q1, q2 } = await reset();
  await prisma.quoteRequest.update({
    where: { projectId: p.id },
    data: { expiresAt: new Date(Date.now() - 3600e3) },
  });
  // Bidding is over. q1's price still holds; q2's has lapsed.
  await prisma.quote.update({ where: { id: q2.id }, data: { validUntil: new Date(Date.now() - 60e3) } });

  const page = await get(buyer, `/dashboard/project/${p.id}/quotes`);
  check("the buyer is told bidding has closed", page.body.includes("Bidding has closed"));

  const hideLive = await action(buyer, `/dashboard/project/${p.id}/quotes`, A.hide, [q1.id]);
  check(
    "a bid that can still be accepted cannot be hidden",
    hideLive.result?.success === false && /Reject this quote first/.test(hideLive.result?.error ?? ""),
    JSON.stringify(hideLive.result)
  );
  const hideLapsed = await action(buyer, `/dashboard/project/${p.id}/quotes`, A.hide, [q2.id]);
  check("a lapsed bid can be hidden", hideLapsed.result?.success === true, JSON.stringify(hideLapsed.result));

  const accept = await action(buyer, `/dashboard/project/${p.id}/quotes`, A.accept, [q1.id]);
  check(
    "a bid inside its validity is accepted after bidding closed",
    accept.result?.success === true,
    JSON.stringify(accept.result)
  );
}

console.log("\n=== 19. A SAVED DRAFT CAN BE SENT FOR QUOTES ===");
{
  let projectId = null;
  const STALE = "e2e-stale-draft";
  try {
    const layout = {
      propertyType: "FLAT", city: "Gurugram", pincode: "122002", bedrooms: 2, bathrooms: 2, balconies: 1,
      totalFloors: 1, modularKitchen: false, acInBedrooms: true, acInLivingRoom: true,
      geyserInBathrooms: true,
    };
    const saved = await action(buyer, "/calculator", A.createQuoteRequest, [layout, "DRAFT"]);
    const qrId = saved.result?.quoteRequestId;
    const draft = qrId
      ? await prisma.quoteRequest.findUnique({ where: { id: qrId }, include: { project: true } })
      : null;
    projectId = draft?.project.id ?? null;
    check(
      "a draft is saved on an ESTIMATED project",
      draft?.status === "DRAFT" && draft.project.status === "ESTIMATED",
      JSON.stringify(saved.result)
    );

    check("the dashboard offers to send it", (await get(buyer, "/dashboard")).body.includes("Request Dealer Quotes"));
    const onBoard = async () => (await get(dlr, "/dealer/dashboard")).body.includes(`/dealer/rfq/${qrId}`);
    check("dealers cannot see a draft", !(await onBoard()));

    // A dealer and a different buyer account. Assert the outcome, not a
    // payload: a dealer is redirected away from /dashboard before the action
    // runs, while the admin, a buyer role, reaches its ownership check.
    const byDealer = await action(dlr, "/dealer/dashboard", A.requestQuotes, [projectId]);
    const byAdmin = await action(adm, "/dashboard", A.requestQuotes, [projectId]);
    const untouched = await prisma.quoteRequest.findUnique({ where: { id: qrId } });
    check(
      "neither a dealer nor another account can send it",
      byDealer.result?.success !== true &&
        byAdmin.result?.errorCode === "FORBIDDEN" &&
        untouched.status === "DRAFT",
      `dealer=${JSON.stringify(byDealer.result)} admin=${JSON.stringify(byAdmin.result)} status=${untouched.status}`
    );

    // Age the draft and stale its stored price, so that resetting the issue
    // date and re-pricing from the saved layout are both visible.
    await prisma.quoteRequest.update({
      where: { id: qrId },
      data: { createdAt: new Date(Date.now() - 20 * 864e5) },
    });
    await prisma.project.update({
      where: { id: projectId },
      data: { totalEstimate: 1, bomData: { pricing: { materialCost: 1 } } },
    });

    const sent = await action(buyer, `/dashboard/project/${projectId}/quotes`, A.requestQuotes, [projectId]);
    check(
      "the owner sends it, as the same request",
      sent.result?.success === true && sent.result?.quoteRequestId === qrId,
      JSON.stringify(sent.result)
    );
    const open = await prisma.quoteRequest.findUnique({ where: { id: qrId }, include: { project: true } });
    check(
      "it is OPEN for 72 hours from now",
      open.status === "OPEN" &&
        open.expiresAt != null &&
        Math.abs(open.expiresAt.getTime() - Date.now() - 72 * 3600e3) < 3600e3,
      `${open.status} ${open.expiresAt}`
    );
    check("issued today, so dealers see it as new", Math.abs(open.createdAt.getTime() - Date.now()) < 3600e3, String(open.createdAt));
    check("the project reads RFQ_SUBMITTED", open.project.status === "RFQ_SUBMITTED", open.project.status);
    check(
      "re-priced from the saved layout when sent",
      open.project.totalEstimate > 10000 &&
        open.project.bomData?.pricing?.materialCost === open.project.totalEstimate &&
        Array.isArray(open.project.bomData?.items),
      String(open.project.totalEstimate)
    );
    check("dealers can now see it", await onBoard());
    check(
      "the request carries the site's pin code",
      open.visibilityPincode === "122002" && open.project.pincode === "122002",
      `${open.visibilityPincode} ${open.project.pincode}`
    );
    check(
      "the buyer's page now waits for dealers",
      (await get(buyer, `/dashboard/project/${projectId}/quotes`)).body.includes("Awaiting dealer responses")
    );

    const again = await action(buyer, `/dashboard/project/${projectId}/quotes`, A.requestQuotes, [projectId]);
    check(
      "sending it twice is refused",
      again.result?.errorCode === "ALREADY_SENT",
      JSON.stringify(again.result)
    );
    const objectId = await action(buyer, "/dashboard", A.requestQuotes, [{ not: "an id" }]);
    check(
      "an object in place of an id is refused",
      objectId.result?.errorCode === "VALIDATION_ERROR",
      JSON.stringify(objectId.result)
    );

    // A draft whose saved layout today's calculator rejects is not sent.
    await prisma.project.deleteMany({ where: { id: STALE } });
    await prisma.project.create({
      data: {
        id: STALE, ownerId: home.id, projectName: "E2E stale draft", projectType: "RESIDENTIAL",
        status: "ESTIMATED", inputData: { layout: { propertyType: "CASTLE" } }, totalEstimate: 1,
        quoteRequest: { create: { status: "DRAFT", visibilityCity: "NCR", maxQuotes: 5, quoteCount: 0 } },
      },
    });
    const stale = await action(buyer, "/dashboard", A.requestQuotes, [STALE]);
    const staleRfq = await prisma.quoteRequest.findUnique({ where: { projectId: STALE } });
    check(
      "a draft from an older calculator is refused, and stays a draft",
      stale.result?.errorCode === "ESTIMATE_OUTDATED" && staleRfq.status === "DRAFT",
      JSON.stringify(stale.result)
    );
  } finally {
    if (projectId) await prisma.project.deleteMany({ where: { id: projectId } });
    await prisma.project.deleteMany({ where: { id: STALE } });
  }
}

console.log("\n=== 20. EVERY SAVED ESTIMATE RECORDS ITS PIN CODE ===");
{
  const made = [];
  try {
    const noida = {
      propertyType: "FLAT", city: "Noida", bedrooms: 2, bathrooms: 2, balconies: 1,
      totalFloors: 1, modularKitchen: false, acInBedrooms: true, acInLivingRoom: true,
      geyserInBathrooms: true,
    };
    const owned = () => prisma.project.count({ where: { ownerId: home.id } });

    // The preview needs none: a plan read by Snap-to-BOM has none either.
    const preview = await action(buyer, "/calculator", A.estimate, [noida]);
    check("an estimate can be previewed without a pin code", preview.result?.success === true, JSON.stringify(preview.result)?.slice(0, 200));

    const before = await owned();
    const noPin = await action(buyer, "/calculator", A.createQuoteRequest, [noida, "DRAFT"]);
    check(
      "saving without a pin code is refused, and nothing is saved",
      noPin.result?.errorCode === "VALIDATION_ERROR" && (await owned()) === before,
      JSON.stringify(noPin.result)
    );

    // A Delhi pin code on a Noida home would put a UP site under Delhi's rule.
    const wrongState = await action(buyer, "/calculator", A.createQuoteRequest, [{ ...noida, pincode: "110001" }, "OPEN"]);
    check(
      "a pin code from another state is refused",
      wrongState.result?.errorCode === "VALIDATION_ERROR" && /pincode/.test(wrongState.result?.error ?? "") && (await owned()) === before,
      JSON.stringify(wrongState.result)
    );

    const saved = await action(buyer, "/calculator", A.createQuoteRequest, [{ ...noida, pincode: "201301" }, "OPEN"]);
    const rfq = saved.result?.quoteRequestId
      ? await prisma.quoteRequest.findUnique({ where: { id: saved.result.quoteRequestId }, include: { project: true } })
      : null;
    if (rfq) made.push(rfq.project.id);
    check(
      "the pin code is saved on the project, its layout and its request",
      rfq?.project.pincode === "201301" &&
        rfq.project.inputData?.layout?.pincode === "201301" &&
        rfq.visibilityPincode === "201301",
      `${JSON.stringify(saved.result)} ${rfq?.project.pincode} ${rfq?.visibilityPincode}`
    );
  } finally {
    if (made.length) await prisma.project.deleteMany({ where: { id: { in: made } } });
  }
}

await prisma.project.deleteMany({ where: { id: PID } });
await prisma.$disconnect();
process.exit(summary());
