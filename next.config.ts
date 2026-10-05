import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

/**
 * Sent with every response. The Content-Security-Policy is not in this list:
 * it carries a fresh nonce per request, so src/middleware.ts sets it.
 */
const SECURITY_HEADERS = [
  // No page of ours belongs in someone else's frame (clickjacking).
  // frame-ancestors 'none' in the CSP says the same to modern browsers.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Nothing here uses these. Photo uploads go through the file picker, which
  // needs no camera permission.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // Only over HTTPS; browsers ignore it on plain-HTTP local development anyway.
  ...(isProd
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]
    : []),
];

const nextConfig: NextConfig = {
  // Drops "X-Powered-By: Next.js" — no reason to advertise the stack.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
