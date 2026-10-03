import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import type { QuoteRequestStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  DEMO_DASHBOARD_PROJECTS,
  DEMO_PROJECT_ID,
} from "@/lib/demo-data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { specTableStyle } from "@/components/spec-sheet";

const PROJECT_HEAD = ["Project", "Connected", "Demand", "Trade Estimate", "Status", "Quotes"];

export const metadata: Metadata = {
  title: "Dashboard",
  description: "View and manage your saved electrical estimates.",
};

// ---------------------------------------------------------------------------
// bomData extraction helpers
// ---------------------------------------------------------------------------

interface BomDataSnapshot {
  totalConnectedLoadKw: number;
  maxDemandKw: number;
  // materialCost, not totalEstimate: every estimate ever saved has it, and
  // VoltFlow no longer prices labour, so it is the one comparable figure.
  pricing: { materialCost: number };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseBomData(raw: unknown): BomDataSnapshot | null {
  if (!isRecord(raw)) return null;

  const pricing = raw.pricing;
  if (!isRecord(pricing)) return null;

  const materialCost = pricing.materialCost;
  const totalConnectedLoadKw = raw.totalConnectedLoadKw;
  const maxDemandKw = raw.maxDemandKw;

  if (
    typeof materialCost !== "number" ||
    typeof totalConnectedLoadKw !== "number" ||
    typeof maxDemandKw !== "number"
  ) {
    return null;
  }

  return { totalConnectedLoadKw, maxDemandKw, pricing: { materialCost } };
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
  }).format(date);
}

/** Reformat old-style project names ("Saved Estimate YYYY-MM-DD HH:MM:SS") */
function cleanProjectName(name: string): string {
  const match = name.match(/^Saved Estimate (\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const day = parseInt(match[3], 10);
    const month = months[parseInt(match[2], 10) - 1];
    return `Estimate — ${day} ${month} ${match[1]}`;
  }
  return name;
}

// ---------------------------------------------------------------------------
// Badge config
// ---------------------------------------------------------------------------

const QUOTE_STATUS_CONFIG: Record<
  QuoteRequestStatus,
  { label: string; variant: "secondary" | "default" | "destructive" | "outline" }
> = {
  DRAFT: { label: "Draft", variant: "secondary" },
  OPEN: { label: "Open for Quotes", variant: "default" },
  CLOSED: { label: "Closed", variant: "outline" },
  EXPIRED: { label: "Expired", variant: "destructive" },
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface PageProps {
  searchParams: Promise<{ demo?: string }>;
}

export default async function DashboardPage({ searchParams }: PageProps) {
  const { demo } = await searchParams;
  const isDemo = demo === "true";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- demo + Prisma shapes unified
  let projects: any[];

  if (isDemo) {
    projects = DEMO_DASHBOARD_PROJECTS;
  } else {
    const session = await auth();
    if (!session?.user) {
      redirect("/login");
    }
    if (session.user.role === "DEALER") {
      redirect("/dealer/dashboard");
    }
    projects = await prisma.project.findMany({
      where: { ownerId: session.user.id },
      include: { quoteRequest: true },
      orderBy: { createdAt: "desc" },
    });
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-4 py-14 sm:px-6">
      {isDemo && (
        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-700">
          You are viewing a demo.{" "}
          <Link href="/register?role=HOMEOWNER" className="font-semibold underline">
            Create a free account &rarr;
          </Link>
        </div>
      )}

      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">My Projects</h1>
        <Button asChild>
          <Link href="/calculator">New Estimate</Link>
        </Button>
      </div>

      {projects.length === 0 ? (
        <div className="border border-slate-200 bg-white px-4 py-14 text-center">
          <p className="text-sm text-slate-500">
            No saved estimates yet.
          </p>
          <Button asChild className="mt-4">
            <Link href="/calculator">Create Your First Estimate</Link>
          </Button>
        </div>
      ) : (
        /* A register of projects, not a gallery. One row per estimate so
           load, demand and value can be compared down a column. */
        <div className="border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            {/* spec-table: on a phone each project stacks into a card
                rather than scrolling sideways. Headers must match PROJECT_HEAD. */}
            <table
              className="spec-table w-full text-[13px]"
              style={specTableStyle(PROJECT_HEAD, 720)}
            >
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="spec-label px-3 py-2 text-left font-medium">
                    Project
                  </th>
                  <th className="spec-label px-3 py-2 text-right font-medium">
                    Connected
                  </th>
                  <th className="spec-label px-3 py-2 text-right font-medium">
                    Demand
                  </th>
                  <th className="spec-label px-3 py-2 text-right font-medium">
                    Trade Estimate
                  </th>
                  <th className="spec-label px-3 py-2 text-right font-medium">
                    Status
                  </th>
                  <th className="spec-label px-3 py-2 text-right font-medium">
                    Quotes
                  </th>
                </tr>
              </thead>
              <tbody>
                {projects.map((project) => {
                  const bom = parseBomData(project.bomData);
                  const estimate =
                    bom?.pricing.materialCost ?? project.totalEstimate;
                  const qr = project.quoteRequest;
                  const statusConfig =
                    qr?.status in QUOTE_STATUS_CONFIG
                      ? QUOTE_STATUS_CONFIG[qr.status as QuoteRequestStatus]
                      : null;

                  return (
                    <tr
                      key={project.id}
                      className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/70"
                    >
                      <td className="px-3 py-2.5">
                        <span className="font-medium text-slate-900">
                          {cleanProjectName(project.projectName)}
                        </span>
                        <span className="block text-[11px] text-slate-500">
                          {formatDate(project.createdAt)} ·{" "}
                          {project.status.replace("_", " ")}
                        </span>
                      </td>
                      <td className="spec-num px-3 py-2.5 text-right text-slate-600">
                        {bom ? `${bom.totalConnectedLoadKw.toFixed(2)} kW` : "—"}
                      </td>
                      <td className="spec-num px-3 py-2.5 text-right text-slate-600">
                        {bom ? `${bom.maxDemandKw.toFixed(2)} kW` : "—"}
                      </td>
                      <td className="spec-num px-3 py-2.5 text-right font-semibold text-slate-900">
                        {estimate != null ? formatCurrency(estimate) : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {statusConfig ? (
                          <Badge variant={statusConfig.variant}>
                            {statusConfig.label}
                          </Badge>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {qr ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            asChild
                          >
                            <Link
                              href={
                                isDemo
                                  ? `/dashboard/project/${DEMO_PROJECT_ID}/quotes?demo=true`
                                  : `/dashboard/project/${project.id}/quotes`
                              }
                            >
                              View
                              <span className="spec-num ml-1.5 border border-slate-300 px-1 text-[11px]">
                                {qr.quoteCount}
                              </span>
                            </Link>
                          </Button>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main>
  );
}
