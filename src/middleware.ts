import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import type { NextAuthRequest } from "next-auth";
import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

// ---------------------------------------------------------------------------
// Content-Security-Policy
// ---------------------------------------------------------------------------
// Nonce-based, so no inline script runs unless the server rendered it for
// this request. Next.js reads the nonce from the CSP request header set below
// and stamps it on its own scripts; that needs dynamic rendering, which every
// route already has (the root layout reads the session).
//
// 'strict-dynamic' lets those nonced scripts load Next's chunks. Styles keep
// 'unsafe-inline' because React style attributes need it, and a style cannot
// run code. Nothing is loaded from another origin: fonts are self-hosted by
// next/font, and the vision and copper APIs are called from the server.
// ---------------------------------------------------------------------------

function contentSecurityPolicy(nonce: string, overHttps: boolean): string {
  const isDev = process.env.NODE_ENV === "development";
  return [
    "default-src 'self'",
    // React needs eval in development only, for its error overlay.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    // blob: is the floor-plan preview decoding a picked photo in the browser.
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    // Only when the page itself came over HTTPS (always, on Vercel). Over
    // plain HTTP (a local build, a phone on http://<LAN IP>) it would rewrite
    // every same-site request to https:// and break the page.
    ...(overHttps ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

// ---------------------------------------------------------------------------
// Role gates
// ---------------------------------------------------------------------------
// The first line of defence; every admin and dealer page also checks the
// session itself.
// ---------------------------------------------------------------------------

function roleRedirect(req: NextAuthRequest): NextResponse | null {
  const { pathname } = req.nextUrl;

  // Let demo URLs reach the route layer without any edge auth redirect.
  if (req.nextUrl.searchParams.get("demo") === "true") return null;

  const session = req.auth;
  const isLoggedIn = !!session?.user;
  const role = session?.user?.role;
  const to = (path: string) => NextResponse.redirect(new URL(path, req.url));

  // /admin/* → ADMIN role only
  if (pathname.startsWith("/admin")) {
    if (!isLoggedIn || !role) return to("/login");
    if (role !== "ADMIN") return to("/dashboard");
  }

  // /dealer/* → DEALER or ADMIN only
  if (pathname.startsWith("/dealer")) {
    if (!isLoggedIn || !role) return to("/login");
    if (role !== "DEALER" && role !== "ADMIN") return to("/dashboard");
  }

  // /dashboard/* → any logged-in user; DEALER redirected to dealer dashboard
  if (pathname.startsWith("/dashboard")) {
    if (!isLoggedIn || !role) return to("/login");
    if (role === "DEALER") return to("/dealer/dashboard");
  }

  // /calculator is intentionally public. It is the top of the funnel: anyone
  // can compute a full BOM without an account. The wall sits at saving an
  // estimate or requesting quotes, which createQuoteRequestAction enforces
  // server-side.
  return null;
}

export default auth((req) => {
  const redirect = roleRedirect(req);
  if (redirect) return redirect;

  const nonce = btoa(crypto.randomUUID());
  const overHttps =
    req.nextUrl.protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
  const csp = contentSecurityPolicy(nonce, overHttps);

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
});

export const config = {
  // Every page, so every document gets a CSP. Skips API routes (JSON, no
  // scripts) and static files. Prefetch requests are deliberately NOT
  // skipped: anyone can send a prefetch header, and skipping on it would
  // also skip the role gates above.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|avif|txt|xml|webmanifest)$).*)",
  ],
};
