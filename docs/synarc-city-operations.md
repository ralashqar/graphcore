# Synarc City operations

## Release policy

Use the isolated `feature/synarc-city` branch. Apply additive schema and deploy dedicated city Edge functions before enabling the client. No world/game worker deployment is required unless shared worker-executed modules change. Preserve existing Stripe credit/subscription handlers.

Separate browsing, onboarding and purchase gates. Test Stripe mode and an isolated database first. Live purchases require configured merchant tax treatment, refund terms, approved real businesses and verified recovery tests. Do not seed fictitious paid businesses into production.

## Required verification

Run city domain tests, database allocation/RLS tests, webhook and network-safety tests, TypeScript compilation, production build and dev-server/browser checks. Cover simultaneous purchases, repeated/out-of-order Stripe events, refunds, disputes, capacity expansion, reconnects, direct links, mobile and WebGL fallback.

## Recovery

Disable new checkouts when investigating payment trouble, leaving webhook fulfillment and reconciliation active. Never edit or delete posted ledger rows. Use compensating processor-state entries. Inspect unfulfilled paid orders, failed webhook attempts, stale allocations and moderation queues. Roll back frontend independently; retain additive tables and payment processing.

## Configuration

Edge secrets (never browser variables):

| Variable                     | Purpose                                                                                  |
| ---------------------------- | ---------------------------------------------------------------------------------------- |
| `CITY_BROWSING_ENABLED`      | Public reads, default false                                                              |
| `CITY_ONBOARDING_ENABLED`    | Business creation/import/editing, default false                                          |
| `CITY_PURCHASES_ENABLED`     | New Checkout Sessions, default false                                                     |
| `CITY_STRIPE_SECRET_KEY`     | Dedicated Stripe test/live key; independent of credit billing                            |
| `CITY_STRIPE_WEBHOOK_SECRET` | Signing secret for the city webhook endpoint                                             |
| `CITY_TAX_MODE`              | `automatic` for configured Stripe Tax, or explicitly merchant-approved `merchant_exempt` |
| `CITY_TERMS_URL`             | Published merchant purchase/refund terms, HTTPS                                          |
| `CITY_PUBLIC_ORIGIN`         | Canonical frontend origin for checkout redirects                                         |
| `CITY_ANALYTICS_SALT`        | Random secret for daily IP pseudonyms; no raw IP storage                                 |
| `CITY_RECONCILE_SECRET`      | Random scheduler bearer secret                                                           |

Reuse the existing `SB_SECRET_KEY`/`SUPABASE_SERVICE_ROLE_KEY` and `SB_PUBLISHABLE_KEY`/`SUPABASE_ANON_KEY` conventions. Each authenticated command checks the Supabase user server-side. Edge gateway JWT checking is disabled because public reads, new publishable keys and Stripe signatures require explicit boundary authentication.

Frontend: standard `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY` select the staging project. No service or Stripe secret belongs in `VITE_*`. Add the exact city authentication callback URLs to Supabase Auth's redirect allowlist.

Optional Vercel sharing adapter: use `vercel.city.json` as the deployment configuration (`vercel --local-config vercel.city.json`). It serves property metadata and on-demand PNG cards using the bundled OFL Manrope font. Configure server variables `CITY_SUPABASE_URL`, `CITY_SUPABASE_PUBLISHABLE_KEY`, `CITY_PUBLIC_ORIGIN`. The adapter makes only public reads. Other hosts need equivalent routes for `/city/business/:slug` and `/api/city-share` before advertising social-preview support.

## Deployment sequence

1. Create an isolated staging Supabase environment. Apply `20260920130959_synarc_city.sql` after the existing auth/storage baseline. Do not run unrelated pending repository migrations against production.
2. Configure the secrets above with all city gates initially false. Assign an operator by inserting their existing Auth UUID into `city_admins` from the service/database administration boundary.
3. Deploy only the four city functions, using the explicit staging project reference:

   ```text
   npx supabase functions deploy city-api city-command city-stripe-webhook city-reconcile --project-ref STAGING_PROJECT_REF --use-api
   ```

4. Configure Stripe's city webhook for Checkout completion/expiry, successful PaymentIntents, refunds and dispute creation/update/closure. The city endpoint verifies the raw-body signature. Existing subscription/credit endpoints remain separate.
5. Enable `pg_cron` and `pg_net`. Store `city_function_origin` and `city_reconcile_secret` in Supabase Vault, then run `scripts/sql/city-scheduler.sql`. Each minute checks the five least-recently reconciled orders concurrently. Watch backlog age and increase scheduling throughput if admissions outgrow it.
6. Deploy the frontend and sharing adapter. Enable browsing and onboarding, verify a real test-owned domain, approve its exact revision, then enable test purchases. Confirm payment, rank displacement, refund and webhook replay before live activation.
7. Live activation requires merchant tax/terms decisions, Stripe live configuration and an approved pilot. No live accounts, payments, infrastructure or third-party messages are created by the local test suites.

## Commands and assets

- `npm run test:city`: domain rules, embedded PostgreSQL migration/transaction/RLS checks, webhook HMAC, principal calculations and network-address rejection.
- `npm run check:city:server`: Node sharing and Deno Edge type checks.
- `npm run test:city:sharing`: run after a build; validates escaping and real PNG rasterisation.
- `npm run test:city:browser`: run against a dev or preview server; set `CITY_TEST_ORIGIN` to its origin. Includes public navigation and a mocked business API flow. It does not certify hosted authentication or real Stripe Checkout.
- `CITY_NETWORK_SMOKE=true` enables the optional Deno public HTTPS import probe with `--allow-net`.
- `npm run build:city:kit` regenerates the Downtown MegaKit assemblies from vendored CC0 source dependencies. See the [asset pipeline](synarc-city-megakit.md) for Blender/Python requirements and validation commands. The old procedural kit is no longer loaded.
- `/city?demo=1` is explicitly fictional. `/city?demo=1&stress=1` loads 2,000 demonstration businesses for performance inspection.

## Data operations

Public reads return one consistent database snapshot. Approved media is signed in batches; codes are withheld until an authenticated claim. Draft media remains private. A claim stores a historical offer snapshot. Business review is fenced to the submitted revision. Ledger UPDATE/DELETE is rejected by a trigger; corrections reconcile current Stripe state into a new entry.

Inspect `city_orders.last_error`, old `updated_at`, `city_payment_events.status`, `city_reports` and pending business revisions. Event records freeze name/value/colour/rank and provide deterministic `/api/city-share?eventId=UUID` assets. Suspended properties cannot generate public cards. Historical cards retain their event timestamp.

Public popularity is an approximate, rate-limited signal: anonymous visits are deduplicated by daily IP pseudonym, so shared networks can undercount. It is not a verified-identity, purchase-attribution or fraud-proof metric. Browser views require two seconds with the property open. Authenticated owner traffic is excluded from visit/click counts.

## Initial marketplace acceptance — 20 September 2026

`npx tsc --noEmit`, the Node/Deno server checks and `npm run build` passed. The dev server started and browser checks reported no runtime errors. The full repository build retains its existing missing landing-atlas reference and large-chunk warnings.

Domain rules, the actual migration in embedded PostgreSQL (PGlite), RLS/grants, ledger immutability, payment replay/compensation, lease fencing, deterministic ranking and capacity expansion pass. Deno checks cover webhook signatures and payment/network rules; an optional real HTTPS probe passed with public-address pinning. Sharing tests produce an actual PNG and verify metadata escaping.

Browser checks cover desktop/mobile layouts, search, deep links, selection, directory pagination, saves/auth entry, PNG download and WebGL failure recovery without console errors. A separate fixture-backed flow covers business import, creation, verification, review and checkout handoff. This mocks authentication and business APIs; it is not evidence of a hosted payment.

The 2,000-property desktop scene measured 60.17 FPS over 2.51 seconds on Intel UHD Direct3D11 in headless Chromium. This is a short local rendering sample, not sustained load or physical mobile certification. Software rendering was materially slower; the renderer lowers quality for detected software devices, and a searchable directory is available.

That rendering measurement used the original procedural kit. Updated Downtown MegaKit measurements and asset checks are recorded in the [MegaKit documentation](synarc-city-megakit.md).

Hosted Supabase migration/auth/storage/realtime acceptance, multi-session concurrency, real Stripe test payments/refunds/disputes, live merchant configuration and physical mobile testing remain rollout gates. Nothing has been deployed or charged by this implementation. The Blender kit is generated locally; the bundled Manrope font includes its OFL licence.
