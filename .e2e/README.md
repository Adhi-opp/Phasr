# End-to-end harness

Drives the real stack over HTTP: NextAuth credentials login, Next.js server
actions, and the rendered pages, asserting against the live database. It is
the closest thing here to a click-test — everything a browser would do apart
from running client-side JavaScript.

## Running it

```bash
npx prisma db seed          # the harness assumes the seeded fixtures exist
npm run build && npx next start -p 3131
node .e2e/run.mjs
```

Exits non-zero on failure. It creates and deletes its own `e2e-*` projects and
resets what it touches, but it **mutates the seeded database** — re-run
`npx prisma db seed` afterwards before doing a manual pass.

## The action IDs will go stale

`run.mjs` invokes server actions by the opaque ID Next.js assigns them. The
IDs are derived from each action's file path and export name, not its body:
a full rewrite of `features/quotes/actions.ts` (Sep 2026) left every ID
unchanged. **Renaming or moving an action changes its ID**, and the harness
then decodes `null` instead of a result.

To refresh them:

1. `cat .next/server/server-reference-manifest.json` — the `node` key maps each
   ID to the page whose bundle contains it.
2. Identify which is which by behaviour — the manifest carries IDs and page
   paths but no function names. Call each candidate through `action()` in
   `lib.mjs` against a throwaway fixture and read the error back:
   - Against an **ACCEPTED** quote, `hideQuoteAction` returns the "holds the
     dealer's contact details" error while accept and reject both return
     "already processed" — that isolates hide.
   - Against a **SUBMITTED** quote on a **CLOSED** RFQ, accept returns
     "no longer open" while reject succeeds — that separates the remaining two.
3. Update the `A` map at the top of `run.mjs`.

This fragility is why the harness is deliberately **not** wired into
`npm run test`. The specs in `src/features/**/*.spec.ts` are the suite that
must always pass; this one is run by hand before a release.

## What it does not cover

Everything that only happens in a browser:

- the calculator form itself, and `BOMResultView` rendering from it
- the anonymous → authenticated handover via `localStorage`
  (`src/lib/pending-estimate.ts`)
- optimistic UI, the Remove button's instant row removal
- any client-side validation

Closing that gap needs a real browser driver (Playwright or similar), which
would be a new dev dependency and a browser download.
