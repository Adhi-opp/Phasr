import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CopperRateForm } from "./CopperRateForm";

export const metadata: Metadata = {
  title: "Admin Dashboard",
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export default async function AdminDashboardPage() {
  const session = await auth();

  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  const [
    usersByRole,
    projectCount,
    openRfqCount,
    totalRfqCount,
    quoteCount,
    acceptedRevenue,
    pendingDealers,
    latestSnapshot,
  ] = await Promise.all([
    prisma.user.groupBy({ by: ["role"], _count: true }),
    prisma.project.count(),
    prisma.quoteRequest.count({ where: { status: "OPEN" } }),
    prisma.quoteRequest.count(),
    prisma.quote.count(),
    prisma.quote.aggregate({
      where: { status: "ACCEPTED" },
      _sum: { totalPrice: true },
    }),
    prisma.dealerProfile.count({ where: { approvalStatus: "PENDING" } }),
    prisma.priceSnapshot.findFirst({
      orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
      select: { baseCopperRate: true, source: true, effectiveDate: true },
    }),
  ]);

  const roleMap = Object.fromEntries(
    usersByRole.map((r) => [r.role, r._count])
  );

  const stats = [
    { label: "Homeowners", value: roleMap["HOMEOWNER"] ?? 0 },
    { label: "Dealers", value: roleMap["DEALER"] ?? 0 },
    { label: "Admins", value: roleMap["ADMIN"] ?? 0 },
    { label: "Projects", value: projectCount },
    { label: "Open RFQs", value: openRfqCount },
    { label: "Total RFQs", value: totalRfqCount },
    { label: "Total Quotes", value: quoteCount },
    {
      label: "Accepted GMV",
      value: formatCurrency(acceptedRevenue._sum.totalPrice ?? 0),
    },
  ];

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-4 py-14 sm:px-6">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/admin/dealers">Dealers</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/admin/rfqs">RFQs</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/admin/quotes">Quotes</Link>
          </Button>
        </div>
      </div>

      {pendingDealers > 0 && (
        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          {pendingDealers} dealer{pendingDealers !== 1 ? "s" : ""} awaiting
          approval.{" "}
          <Link
            href="/admin/dealers?status=PENDING"
            className="font-medium underline"
          >
            Review now
          </Link>
        </div>
      )}

      <section className="mb-6 space-y-2 border border-slate-200 px-4 py-3">
        <p className="text-sm text-slate-600">
          Copper index:{" "}
          {latestSnapshot ? (
            <span className="font-medium tabular-nums text-slate-900">
              {formatCurrency(latestSnapshot.baseCopperRate)}/kg · {latestSnapshot.source} ·{" "}
              {latestSnapshot.effectiveDate.toLocaleString("en-IN", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </span>
          ) : (
            <span className="font-medium text-amber-700">
              none recorded — new projects are saved without one
            </span>
          )}
        </p>
        <CopperRateForm />
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader className="pb-2">
              <CardDescription>{s.label}</CardDescription>
            </CardHeader>
            <CardContent>
              <CardTitle className="text-2xl tabular-nums">
                {s.value}
              </CardTitle>
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}
