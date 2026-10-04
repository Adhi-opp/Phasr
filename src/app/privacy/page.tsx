import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-4 py-14 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Last updated: October 2026
      </p>

      <div className="mt-8 space-y-8 text-sm leading-relaxed text-muted-foreground">
        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">
            Data We Collect
          </h2>
          <p>
            We collect your name, email address, and phone number when you create
            an account. For dealers, we additionally collect company name, GSTIN,
            address, service areas, and brands sold. Project data includes room
            dimensions, appliance loads, and the generated Bill of Materials.
          </p>
          <p className="mt-2">
            Emails collected for feature waitlists are stored securely solely to
            deliver launch notifications.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">
            Contact Information Sharing
          </h2>
          <p>
            Your contact information (email, phone number) is <strong>never</strong>{" "}
            shared with the other party unless a quote is explicitly accepted. Once
            a homeowner accepts a dealer&apos;s quote, both parties&apos; contact
            details are revealed to facilitate the transaction.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">
            How We Use Your Data
          </h2>
          <ul className="ml-4 list-disc space-y-1">
            <li>Match homeowners with relevant local dealers</li>
            <li>Generate electrical estimates aligned with IS 732 practice</li>
            <li>Send transactional email notifications</li>
            <li>Improve our estimation algorithms</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">
            Third-Party Services
          </h2>
          <p>
            We use Supabase (PostgreSQL hosting), Vercel (application hosting), and
            Resend (transactional emails). Your data may be processed by these
            services in accordance with their respective privacy policies.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">
            Data Retention
          </h2>
          <p>
            Account data is retained for as long as your account is active. You may
            request deletion of your account and associated data by contacting us.
          </p>
        </section>
      </div>
    </main>
  );
}
