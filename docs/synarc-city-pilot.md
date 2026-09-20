# City branding, staging and pilot

## Business branding

The business studio has a dedicated billboard upload, horizontal/vertical crop controls and 1–3x zoom. A flat 2:1 composition preview and the actual MegaKit building preview use the same artwork renderer as the public city. The logo is contained in a neutral badge; the name and tagline remain readable over the image. Missing dedicated artwork falls back to the hero image, then brand colour and text. Crop coordinates describe the percentage of image overflow to remove from the left/top.

`CityProfile.billboard` and `billboardCrop` are optional for compatibility. Media stays in the private `city-media` bucket under its owner's UUID; signed URLs are returned separately in `business.preview`. Save retains storage paths, never expiring signed URLs. The existing immutable submitted revision and moderation process covers the new fields. Crop validation is enforced by the Edge boundary. Deploy the backend before the new editor, because the old strict profile schema rejects new fields.

## Isolated staging

No staging credentials were available during implementation. The commands below do not establish hosted acceptance until run successfully against a configured isolated project. Never point the acceptance scripts at the shared production project.

1. Follow [operations](synarc-city-operations.md) to configure an isolated Supabase project. Apply the base City migration and `20260920145000_city_pilot_analytics.sql`, deploy the four City functions, and install the reconciliation/retention scheduler. Existing world/game workers are unaffected.
2. Use a Stripe sandbox/test key, its city webhook signing secret, test merchant terms and tax configuration. Follow [Stripe testing](https://docs.stripe.com/testing) for supported test cards; no real card details or charges are required. Keep keys outside Git and all `VITE_*` variables.
3. Create two test accounts and verify domains you control. Upload real PNG/JPEG/WebP files, save, reload, submit each exact revision and approve using an operator account. Verify another account cannot access those drafts or upload paths. The preview URLs are time-limited and do not replace storage access rules; see [Supabase private buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals).
4. Set `CITY_STAGING_SUPABASE_URL`, `CITY_STAGING_PUBLISHABLE_KEY`, `CITY_STAGING_ACCESS_TOKEN` (an approved test business's current user token), and `CITY_STRIPE_SECRET_KEY` securely in the local environment. Run `npm run check:city:staging`. It checks public reads, authenticated workspace, approval, purchase gates and Stripe test mode. It creates nothing and reports missing configuration without printing keys.
5. For two businesses without previous purchases, complete one hosted test Checkout each: A at £10, then B at £20. Open a second browser session and observe B displace A. Record their order UUIDs as `CITY_STAGING_ORDER_A` and `CITY_STAGING_ORDER_B`.
6. Set `CITY_STAGING_SERVICE_KEY` and `CITY_STRIPE_WEBHOOK_SECRET`, then run `npm run test:city:staging-payments`. **This refunds order B in full in the sandbox.** It verifies both paid Checkout Sessions belong to the selected orders and are not live, asserts ledger credit and ranking, replays B's actual signed Stripe event and checks no duplicate ledger entry, then creates an idempotent test refund and waits for compensation and rank restoration. Use a fresh pair for a new run; a failed/uncertain refund attempt uses the same order-derived idempotency key. Reports contain no credentials and are saved under ignored `output/city-staging/`.
7. Separately exercise a declined card, abandoned Checkout, simultaneous purchases, partial refund, dispute, delayed/reordered webhooks and scheduler recovery before enabling live purchases. These have local contract coverage but are not all covered by the hosted runner. Verify account login/logout, storage signing, mobile browsers and realtime updates on the deployed frontend too.

The scripts reject live Stripe secret keys and the known shared project. Readiness authenticates the locally supplied Stripe key; hosted payment acceptance additionally verifies the actual deployed Checkout sessions are sandbox sessions. Neither a green readiness report nor mocked browser checkout proves live payment readiness.

## Pilot operation

Set optional `CITY_PILOT_USER_IDS` to comma-separated exact Auth UUIDs for 5–10 recruited business owners. With a non-empty allowlist, new business creation is restricted to those accounts. Existing businesses retain editing access; consumer accounts remain open. Recruitment and invitation sending are separate human operations; no messages have been sent by this implementation.

Use the Operations page to identify each business's next step (domain verification, review, first purchase or offer), inspect approved/draft branding, and export results to CSV. It covers the latest 100 businesses, so use it for the small pilot, not as an unbounded reporting system. Existing business dashboards now include the same 30-day engagement window.

Suggested two-week pilot:

- Recruit a mix of categories and budgets; each business supplies one real, clear offer and a controlled domain.
- Complete domain verification, moderation and test acceptance before taking live funds. Record the pilot start date and initial ranks in the operator's export.
- Review views, outbound clicks, offer claims and returning signed-in visitors at days 7 and 14. Ask owners whether traffic was useful; claims are not sales attribution.
- Agree success thresholds before launch and use the results to decide whether to expand. Do not infer demand from fictional demo traffic.

## Measurement and privacy

Anonymous views/clicks keep the existing daily salted-IP deduplication. They are approximate daily observations, not unique people across the whole month. Authenticated property visits are separately stored once per user, property and UTC day in service-only, RLS-protected `city_visit_days`. User IDs come from verified Auth sessions, never request-body identifiers. Owner visits and unpublished/suspended properties are excluded. Returning visitors have visits on two or more different days within the last 30 UTC calendar days; the denominator is signed-in visitors in that same window. Anonymous return rates are intentionally not claimed.

Public responses contain no visitor identities. Only the owning business and operators receive aggregate metrics. A daily scheduler deletes visit days older than the window; authenticated visit recording also prunes old rows. Account deletion cascades those records. Deploy the retention schedule with the migration and document this analytics purpose in the pilot privacy notice. Payment ranking remains financially determined and unaffected by engagement.

## Verification

`npm run test:city` checks actual PostgreSQL schema, financial allocation, access grants/RLS, owner exclusion, daily deduplication, retention, return counting, media ownership and crop bounds. `npm run test:city:branding` checks portrait/landscape crop geometry. The fixture-backed business browser flow tests billboard upload, crop persistence after reload, preview loading, operator CSV export and checkout handoff. These are local checks; hosted payment acceptance is pending staging configuration.

Local verification on 20 September 2026: `npx tsc --noEmit`, production build, Node/Deno server checks, domain/crop and embedded PostgreSQL tests passed. Public navigation and 2,000-property rendering passed without browser errors; the business fixture flow passed upload/crop/save/reload, a 390px mobile layout check, CSV download and mocked checkout. Billboard loading and broken-image fallback passed. Both staging scripts stopped with an explicit missing-configuration report before any remote request. The build retains the existing landing-atlas and chunk-size warnings. No hosted payment, migration, deployment, business recruitment or invitation was performed.
