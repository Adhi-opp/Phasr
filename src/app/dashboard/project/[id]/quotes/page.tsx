import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { auth } from "@/auth";
import {
  getQuotesForProject,
  type ProjectQuoteView,
} from "@/features/quotes/queries";
import {
  DEMO_QUOTES,
  DEMO_PROJECT_NAME,
  DEMO_RFQ_STATUS,
} from "@/lib/demo-data";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { QuotesClient } from "./QuotesClient";

export const metadata: Metadata = {
  title: "Compare Quotes",
};

/** Reformat old-style project names ("Saved Estimate YYYY-MM-DD HH:MM:SS") */
function formatProjectDisplay(name: string): { title: string; timestamp?: string } {
  const match = name.match(
    /^Saved Estimate (\d{4})-(\d{2})-(\d{2}) (\d{2}:\d{2}):\d{2}$/,
  );
  if (match) {
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const day = parseInt(match[3], 10);
    const month = months[parseInt(match[2], 10) - 1];
    return { title: `Estimate — ${day} ${month} ${match[1]}`, timestamp: match[4] };
  }
  return { title: name };
}

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ demo?: string }>;
}

export default async function QuotesPage({ params, searchParams }: PageProps) {
  const [{ id: projectId }, { demo }] = await Promise.all([params, searchParams]);
  const isDemo = demo === "true";

  // ── Demo mode: completely bypass auth + Prisma (params.id ignored) ──────
  let projectName: string;
  let rfqStatus: string;
  let projectEstimate: number | null = null;
  let quotes: ProjectQuoteView[];

  if (isDemo) {
    projectName = DEMO_PROJECT_NAME;
    rfqStatus = DEMO_RFQ_STATUS;
    quotes = DEMO_QUOTES;
    projectEstimate = 85000;
  } else {
    const session = await auth();
    if (!session?.user) {
      redirect("/login");
    }

    // Ownership and the isHidden filter both live in the query, so a new
    // caller cannot accidentally skip either one.
    const result = await getQuotesForProject(projectId, session.user.id);

    if (!result.ok) {
      if (result.reason === "NOT_FOUND") {
        notFound();
      }
      redirect("/dashboard");
    }

    projectName = result.projectName;
    rfqStatus = result.rfqStatus;
    projectEstimate = result.projectEstimate;
    quotes = result.quotes;
  }

  const dashboardHref = isDemo ? "/dashboard?demo=true" : "/dashboard";

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

      <div className="mb-2">
        <Link
          href={dashboardHref}
          className="text-sm text-muted-foreground hover:underline"
        >
          &larr; Back to Dashboard
        </Link>
      </div>

      <div className="mb-8">
        {(() => {
          const { title, timestamp } = formatProjectDisplay(projectName);
          return (
            <>
              <h1 className="text-2xl font-bold tracking-tight">
                Quotes for {title}
              </h1>
              {timestamp && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Saved at {timestamp}
                </p>
              )}
            </>
          );
        })()}
        <p className="mt-1 text-sm text-muted-foreground">
          {quotes.length === 0
            ? rfqStatus === "OPEN"
              ? "Awaiting dealer responses\u2026"
              : "No quotes received yet."
            : `${quotes.length} quote${quotes.length === 1 ? "" : "s"} received — sorted by price (lowest first).`}
        </p>
      </div>

      {quotes.length === 0 ? (
        rfqStatus === "OPEN" ? (
          <div className="space-y-4">
            <p className="text-center text-sm text-muted-foreground">
              BOM routed to verified NCR distributors. Awaiting calculations&hellip;
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardHeader className="pb-3">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="mt-1 h-3 w-20" />
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between">
                      <Skeleton className="h-4 w-12" />
                      <Skeleton className="h-6 w-24" />
                    </div>
                    <div className="flex justify-between">
                      <Skeleton className="h-4 w-12" />
                      <Skeleton className="h-4 w-20" />
                    </div>
                    <div className="flex justify-between">
                      <Skeleton className="h-4 w-14" />
                      <Skeleton className="h-4 w-16" />
                    </div>
                  </CardContent>
                  <CardFooter className="gap-2">
                    <Skeleton className="h-9 flex-1" />
                    <Skeleton className="h-9 flex-1" />
                  </CardFooter>
                </Card>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-12 text-center">
            <p className="text-muted-foreground">
              No quotes were received for this project.
            </p>
          </div>
        )
      ) : (
        <QuotesClient
          quotes={quotes}
          projectEstimate={projectEstimate}
          rfqStatus={rfqStatus}
          demoMode={isDemo}
        />
      )}
    </main>
  );
}
