# Phasr

Electrical estimation and B2B procurement for residential construction in Delhi NCR.

Phasr turns a house layout into a buildable Bill of Materials (BOM): cable by the coil, breakers by rating and curve, and a distribution board schedule an electrician can wire from. It then puts that BOM in front of verified local dealers for competing quotes. The estimate is computed, not guessed: the same layout always produces the same BOM.

## The Engine

The engineering lives in two pure modules in `src/features/calculator`: `calculateBOM.ts` builds the circuits and the BOM, and `boardEngine.ts` turns those circuits into a board schedule. Neither touches the database or the UI, so every figure is reproducible and covered by unit specs. The rules follow IS 732 practice for residential wiring.

### Cable is sized per point, not per square foot

Cable comes from the electrical points in each room, never from its floor area:

| Circuit | Cable run |
| --- | --- |
| Lighting: lights, fans, exhaust fans and 5 A sockets, 8 points per circuit | 7 m per point, plus a 5 m home run to the board |
| 15 A sockets, 2 per circuit | 9 m per socket, plus a 5 m home run |
| Dedicated AC or geyser | 14 m |
| Cooking range or induction hob | 14 m |
| Any circuit on a different floor from the board | 4 m more per floor |

Every run is counted three times (phase, neutral and earth), given a 10% margin, then rounded up to the coils dealers actually sell: 90 m up to 4 mm², 45 m for 6 and 10 mm², 30 m for 16 mm². The surplus left on the last coil is reported, not hidden.

Because room dimensions never enter the cable calculation, a room size that is mistyped, or misread off a floor plan, cannot inflate the estimate. What moves the BOM is what an electrician would move it for: how many rooms there are, what they are, and the appliances in them.

Voltage drop is checked at each circuit's farthest point, the home run to the farthest room it serves plus 10 m across that room, with the circuit's whole current assumed to flow the whole way. That overstates the drop, so a warning marks a run worth checking. The check never uses a circuit's total cable, which adds up every point's run.

### Protection defaults

| Circuit | Cable | Breaker |
| --- | --- | --- |
| Lighting and 5 A sockets | 1.5 mm² | 10 A, Type B |
| 15 A sockets | 2.5 mm² | 16 A, Type C |
| AC or geyser, one circuit each | 4 mm² | 20 A, Type C |
| Cooking range or induction hob | 6 mm² | 32 A, Type C |

Lighting circuits group lights, fans, exhaust fans and 5 A sockets, eight points at a time, on a 10 A Type B breaker. Every 15 A socket pair, AC, geyser and cooking range gets its own breaker.

The curve follows the load. Type B trips at 3–5× its rating and protects resistive lighting and socket circuits. Type C trips at 5–10× and is used where the inrush of a compressor or motor would nuisance-trip a B.

**Fire guard.** `boardEngine.ts` caps every breaker at what its conductor can safely carry: 10 A on 1.5 mm², 16 A on 2.5 mm², 25 A on 4 mm², 32 A on 6 mm². A rating above the cap is clamped down, never up, and every correction is printed on the schedule with its reason.

### Supply phase and RCCB

| Supply | When | Incomer and RCCB |
| --- | --- | --- |
| Single phase | Default | 40 A double-pole main switch and RCCB (30 mA), 10 mm² feeder |
| Three phase | Peak demand above 7 kW, or connected load over the state's single-phase limit (below) | 63 A four-pole main switch and RCCB (30 mA), 16 mm² feeder, phase balancing |

The connected-load limit is set by each state's electricity regulator, and NCR spans three states. Each rule below comes from the regulator's own text, cited in `regulatoryPolicy.ts`:

| Area | Regulator | Single phase | Three phase |
| --- | --- | --- | --- |
| Delhi | DERC (BSES, Tata Power-DDL, NDMC) | Up to 10 kW | Above 10 kW |
| Gurugram, Faridabad | HERC (DHBVN) | Up to 5 kW | Above 5 kW |
| Noida, Greater Noida, Ghaziabad | UPERC | Below 5 kW | 5 kW or more |

The calculator asks for the site first, a city and a pin code, and applies that state's rule to presets and custom layouts alike. The pin code must lie in the city's state (its first two digits are the postal circle: 11 Delhi, 12–13 Haryana, 20–28 UP), since a mismatch would put the home under the wrong rule. An estimate saved before the city question existed is treated as Delhi, and anywhere outside NCR falls back to 7 kW. When either test trips, the whole BOM switches to three-phase parts automatically: a TPN distribution board, a four-pole isolator and a 63 A four-pole RCCB.

The parts list and the board schedule read the same main-switch rating, and the main feeder from the meter is sized to carry that breaker under the fire-guard table: 10 mm² for 40 A, 16 mm² for 63 A.

Peak demand applies whole-house diversity to the connected load: 40% for lighting, 50% for 15 A sockets, 40% for ACs and geysers. If demand needs more than the standard fitment, the schedule steps the incomer and RCCB up to the next standard rating (80 A, then 100 A).

On a three-phase board, circuits are placed heaviest first onto whichever of the R, Y and B phases is lightest at that moment (greedy longest-processing-time). It is deterministic: anyone can follow the printed schedule and check the balance by hand.

## Marketplace

- **Quotes from verified dealers.** A saved estimate becomes a request for quotation (RFQ), and records the site's pin code on both. It is visible to approved dealers whose city or service area matches, and takes sealed bids for 72 hours or until five dealers have bid. An estimate saved as a draft can be sent later from the dashboard; it is re-priced at that day's rates first.
- **Built for copper volatility.** Every quote carries a server-set 72-hour validity and a declared wire grade (FR, FRLS or ZHFR), so dealers never hold a copper-linked price open-ended, and buyers compare like with like. That validity is the buyer's only deadline: once bidding closes they can still accept any quote until it lapses.
- **Contact details stay private** until the homeowner accepts a quote.
- **Daily copper reference.** A Vercel cron runs every day around 5 PM IST and records a ₹/kg copper parity rate, derived from COMEX and the USD/INR reference rate. It skips days when COMEX is closed, refuses implausible readings rather than recording them, and the rate is shown on `/copper-rate`.

## Snap-to-BOM (in development)

A vision model reads the rooms, their sizes and any marked AC, geyser or cooking-range positions off a floor-plan photo or PDF. It does no electrical maths: the extraction goes through the same engine as the calculator. Before upload, the browser shrinks photos to 1920 px and re-encodes them as JPEG, which keeps them under the 4 MB upload limit and strips EXIF metadata, including GPS location. Admin-only while in development.

## Demand analytics and the case study

`/case-study` is a public write-up of the product, data architecture and engineering decisions. It includes a projected-demand chart: cable demand by gauge and pin code, from an illustrative month of estimates run through the real engine (`src/features/analytics/demandSample.ts`). Because a bill of materials exists before the cable is bought, saved estimates are a leading indicator of demand by gauge.

## Security

- Nonce-based Content-Security-Policy on every page (`src/middleware.ts`): no inline script runs unless the server rendered it for that request.
- `X-Frame-Options: DENY`, `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy` and `Permissions-Policy` on every response (`next.config.ts`).
- Role checks at the edge and again in every protected page and server action; Postgres row-level security on every table.
- Prices are always recomputed on the server; the browser only ever sends a layout.

## Tech Stack

- **Framework:** Next.js 16 (App Router) + React 19 + TypeScript
- **Database:** PostgreSQL (Supabase) + Prisma ORM
- **Authentication:** Auth.js / NextAuth (Role-based: Homeowner, Dealer, Admin)
- **Styling:** Tailwind CSS v4, with the Phase R·Y·B palette taken from the Indian three-phase colour code
- **Transactional Email:** Resend
- **Floor-plan reading:** Google Gemini API, structured JSON output
- **Hosting:** Vercel (Mumbai region), with Vercel Cron for the daily copper rate

## Local Setup

**1. Clone and install dependencies:**

```bash
git clone https://github.com/Adhi-opp/VoltFlow.git
cd VoltFlow
npm install
```

**2. Environment Variables:**

Create a `.env` file at the root — not `.env.local`. The Prisma CLI only reads `.env`, so `migrate` and `db seed` will not find the connection strings otherwise. See `.env.example` for the annotated template.

```env
# Database
DATABASE_URL="postgres://[user]:[password]@[host]:6543/postgres" # Transaction pooler
DIRECT_URL="postgres://[user]:[password]@[host]:5432/postgres"   # Session pooler for migrations

# Auth — must match the origin the app is served from
AUTH_SECRET="your_generated_secret"
AUTH_URL="http://localhost:3000"
NEXTAUTH_URL="http://localhost:3000"

# Email Operations — optional locally; without a key, notifications no-op and are logged
RESEND_API_KEY="your_resend_key"
ADMIN_EMAIL="admin@phasr.in"
EMAIL_FROM="notifications@phasr.in"

# Used to build absolute links inside outgoing emails
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

**3. Database Provisioning:**

Run the migrations and seed the database with baseline copper rates and test accounts (Admin, Dealer, Homeowner).

```bash
npx prisma migrate deploy
npx prisma db seed
```

**4. Run the Development Server:**

```bash
npm run dev
```

Navigate to `http://localhost:3000`.

## Architecture Notes

- **Pure Calculations:** The core electrical logic (`calculateBOM` and `boardEngine`) runs independently of the database layer, ensuring deterministic and fully testable outputs.
- **The model reads, the engine calculates:** In Snap-to-BOM, the vision model only transcribes the drawing. Its reply is validated against a strict schema before the deterministic engine sees it.
- **Server Actions:** Data mutation and state transitions (RFQ submission, dealer quoting, quote acceptance) are handled exclusively via Next.js Server Actions.
- **Server-Side Recomputation:** The calculator is public and unauthenticated. Saved projects are recomputed from the submitted layout at current rates rather than trusting any BOM or total supplied by the client.
- **Tests:** `npm test` runs the unit specs: engine, pricing, board schedule, copper parity, waitlist and floor-plan handoff. `.e2e/` holds an HTTP-level harness that exercises auth, server actions and rendered pages against a running server; see `.e2e/README.md`.
