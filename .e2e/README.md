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

## Server action IDs

`run.mjs` invokes server actions by the opaque ID Next.js assigns them, and
those IDs change from build to build. It no longer hard-codes them: it reads
`.next/server/server-reference-manifest.json` from the build under test and
looks each action up by its `exportedName`. So **build before you run it**;
against a stale build, or after an action is renamed, it stops with a
"No server action" error instead of failing every check with `null`.

The harness is still deliberately **not** wired into `npm run test`: it needs
a running server and mutates the database. The specs in
`src/features/**/*.spec.ts` are the suite that must always pass; this one is
run by hand before a release.

## What it does not cover

Everything that only happens in a browser:

- the calculator form itself, and `BOMResultView` rendering from it
- the anonymous → authenticated handover via `localStorage`
  (`src/lib/pending-estimate.ts`)
- optimistic UI, the Remove button's instant row removal
- any client-side validation

Closing that gap needs a real browser driver (Playwright or similar), which
would be a new dev dependency and a browser download.
