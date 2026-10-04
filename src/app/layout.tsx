import type { Metadata } from "next";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";
import { auth } from "@/auth";
import { AppSessionProvider } from "@/components/providers/session-provider";
import { Navbar } from "@/components/Navbar";
import { Toaster } from "@/components/ui/sonner";
import { getLatestCopperRate } from "@/features/market/copperRate";
import "./globals.css";

/** Display face for headlines and the wordmark only; body copy stays Geist. */
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "https://phasr.in"
  ),
  title: {
    default: "Phasr",
    template: "%s | Phasr",
  },
  description:
    "India's electrical wiring marketplace. BOM calculator aligned with IS 732 standard practice, with competitive dealer quotes.",
  openGraph: {
    siteName: "Phasr",
    type: "website",
    locale: "en_IN",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // The copper rate is cached and never throws: the menu shows it, but a
  // database hiccup must not take every page down with it.
  const [session, copperRate] = await Promise.all([auth(), getLatestCopperRate()]);

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${bricolage.variable} antialiased`}
      >
        <AppSessionProvider session={session}>
          <Navbar copperRate={copperRate} />
          {children}
          <Toaster richColors position="top-right" />
        </AppSessionProvider>
      </body>
    </html>
  );
}
