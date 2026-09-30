import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { auth } from "@/auth";
import { AppSessionProvider } from "@/components/providers/session-provider";
import { Navbar } from "@/components/Navbar";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

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
    process.env.NEXT_PUBLIC_APP_URL || "https://voltflow.in"
  ),
  title: {
    default: "VoltFlow",
    template: "%s | VoltFlow",
  },
  description:
    "India's electrical wiring marketplace. BOM calculator aligned with IS 732 standard practice, with competitive dealer quotes.",
  openGraph: {
    siteName: "VoltFlow",
    type: "website",
    locale: "en_IN",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AppSessionProvider session={session}>
          <Navbar />
          {children}
          <Toaster richColors position="top-right" />
        </AppSessionProvider>
      </body>
    </html>
  );
}
