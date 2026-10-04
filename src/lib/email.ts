import { Resend } from "resend";
import { logger } from "@/lib/logger";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM = process.env.EMAIL_FROM || "Phasr <noreply@phasr.in>";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://phasr.in";

function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

async function send(to: string, subject: string, html: string) {
  if (!resend) {
    logger.info("Email skipped (no RESEND_API_KEY)", { to, subject });
    return;
  }
  await resend.emails.send({ from: FROM, to, subject, html });
}

export async function sendNewRfqNotification(
  dealerEmail: string,
  data: {
    dealerName: string;
    projectName: string;
    estimateValue: number;
    rfqCity: string;
  }
) {
  await send(
    dealerEmail,
    `New Quote Request in ${data.rfqCity} - ${data.projectName}`,
    `<p>Hi ${esc(data.dealerName)},</p>
     <p>A new project "<strong>${esc(data.projectName)}</strong>" (est. value ${formatINR(data.estimateValue)}) is open for quotes in ${esc(data.rfqCity)}.</p>
     <p><a href="${APP_URL}/dealer/dashboard">View &amp; Submit Quote</a></p>
     <p>- Phasr</p>`
  );
}

export async function sendQuoteReceivedNotification(
  homeownerEmail: string,
  data: {
    homeownerName: string;
    projectName: string;
    dealerCompany: string;
    quotePrice: number;
  }
) {
  await send(
    homeownerEmail,
    `New quote received for ${data.projectName}`,
    `<p>Hi ${esc(data.homeownerName)},</p>
     <p><strong>${esc(data.dealerCompany)}</strong> submitted a quote of ${formatINR(data.quotePrice)} for your project "${esc(data.projectName)}".</p>
     <p><a href="${APP_URL}/dashboard">View Quotes</a></p>
     <p>- Phasr</p>`
  );
}

export async function sendQuoteAcceptedNotification(
  dealerEmail: string,
  data: {
    dealerName: string;
    projectName: string;
    homeownerName: string;
    homeownerEmail: string;
    homeownerPhone: string | null;
  }
) {
  const phoneLine = data.homeownerPhone
    ? `<p>Phone: ${esc(data.homeownerPhone)}</p>`
    : "";

  await send(
    dealerEmail,
    `Your quote was accepted - ${data.projectName}`,
    `<p>Hi ${esc(data.dealerName)},</p>
     <p>Your quote for "<strong>${esc(data.projectName)}</strong>" has been accepted!</p>
     <h3>Homeowner Contact</h3>
     <p>Name: ${esc(data.homeownerName)}</p>
     <p>Email: ${esc(data.homeownerEmail)}</p>
     ${phoneLine}
     <p>Please reach out to the homeowner to finalize the order.</p>
     <p>- Phasr</p>`
  );
}

export async function sendQuoteRejectedNotification(
  dealerEmail: string,
  data: { dealerName: string; projectName: string }
) {
  await send(
    dealerEmail,
    `Quote update - ${data.projectName}`,
    `<p>Hi ${esc(data.dealerName)},</p>
     <p>Your quote for "${esc(data.projectName)}" was not accepted this time.</p>
     <p><a href="${APP_URL}/dealer/dashboard">Browse more projects</a></p>
     <p>- Phasr</p>`
  );
}

export async function sendDealerApprovedNotification(
  dealerEmail: string,
  data: { dealerName: string; companyName: string }
) {
  await send(
    dealerEmail,
    "Your Phasr dealer profile has been approved",
    `<p>Hi ${esc(data.dealerName)},</p>
     <p>Your dealer profile for <strong>${esc(data.companyName)}</strong> has been approved.</p>
     <p>You can now browse and quote on open projects in your service area.</p>
     <p><a href="${APP_URL}/dealer/dashboard">Go to Dealer Dashboard</a></p>
     <p>- Phasr</p>`
  );
}

export async function sendDealerRejectedNotification(
  dealerEmail: string,
  data: { dealerName: string; companyName: string }
) {
  await send(
    dealerEmail,
    "Phasr dealer profile update",
    `<p>Hi ${esc(data.dealerName)},</p>
     <p>Your dealer profile for <strong>${esc(data.companyName)}</strong> could not be approved at this time.</p>
     <p>Please ensure your GSTIN and dealership certificates are valid and try updating your profile.</p>
     <p><a href="${APP_URL}/dealer/profile/setup">Update Profile</a></p>
     <p>- Phasr</p>`
  );
}

export async function sendAdminProjectSavedNotification(data: {
  saveMode: "DRAFT" | "OPEN";
  projectId: string;
  quoteRequestId: string;
  projectName: string;
  estimateValue: number;
  city: string;
  totalConnectedLoadKw: number;
  maxDemandKw: number;
  phase: string;
  itemCount: number;
  bomDataJson: string;
}) {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) {
    logger.warn("Admin project notification skipped: ADMIN_EMAIL not set");
    return;
  }

  const actionLabel =
    data.saveMode === "OPEN" ? "Quote request published" : "Draft saved";

  await send(
    adminEmail,
    `[Phasr Admin] ${actionLabel}: ${data.projectName} - ${data.city}`,
    `<h2>${actionLabel}</h2>
     <p style="font-size:14px;">Use the saved project below for manual quote sourcing.</p>
     <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse; font-family:monospace; font-size:14px;">
       <tr><td><strong>Save Mode</strong></td><td>${esc(data.saveMode)}</td></tr>
       <tr><td><strong>Project ID</strong></td><td>${esc(data.projectId)}</td></tr>
       <tr><td><strong>Quote Request ID</strong></td><td>${esc(data.quoteRequestId)}</td></tr>
       <tr><td><strong>Project</strong></td><td>${esc(data.projectName)}</td></tr>
       <tr><td><strong>Estimate</strong></td><td>${formatINR(data.estimateValue)}</td></tr>
       <tr><td><strong>City</strong></td><td>${esc(data.city)}</td></tr>
       <tr><td><strong>Connected Load</strong></td><td>${data.totalConnectedLoadKw.toFixed(2)} kW</td></tr>
       <tr><td><strong>Max Demand</strong></td><td>${data.maxDemandKw.toFixed(2)} kW</td></tr>
       <tr><td><strong>Phase</strong></td><td>${esc(data.phase)}</td></tr>
       <tr><td><strong>BOM Items</strong></td><td>${data.itemCount}</td></tr>
     </table>
     <h3>Full BOM Data (JSON)</h3>
     <pre style="background:#f5f5f5; padding:12px; overflow-x:auto; font-size:12px; max-height:600px;">${esc(data.bomDataJson)}</pre>
     <p style="font-size:12px; color:#888;">Reply with sourced quotes to inject into the marketplace.</p>`
  );
}
