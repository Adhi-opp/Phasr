-- CreateTable
CREATE TABLE "WaitlistSubscriber" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaitlistSubscriber_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WaitlistSubscriber_email_key" ON "WaitlistSubscriber"("email");

-- Row Level Security: on, with no policies, so deny-all through Supabase's
-- auto-generated REST API (the anon and authenticated keys can neither read
-- nor write this table).
--
-- The app is unaffected: Prisma connects as the table's owner, postgres,
-- which bypasses RLS. Deliberately no policies:
--   - No INSERT policy for anon. It would let anyone holding the public anon
--     key write straight into this table, past the server action's
--     validation and bot trap. Sign-ups come only through joinWaitlistAction.
--   - No ADMIN policy. Admins are rows in our own "User" table (NextAuth,
--     not Supabase Auth), which the REST API cannot see, so such a policy
--     cannot be expressed. Admins read through the app.
ALTER TABLE "WaitlistSubscriber" ENABLE ROW LEVEL SECURITY;
