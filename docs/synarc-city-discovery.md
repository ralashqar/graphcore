# Synarc City: creator discovery

## Product direction

The first audience is people discovering creator tools. The product loop is discover a useful tool, try a constrained sample, follow the business or save an offer, and return for a launch. Paid geography remains a separate competitive layer; free discovery never changes Land Value or allocates a ranked plot.

Approved businesses can participate without purchasing land. Their stable business URL opens a shared Discovery Pavilion exhibit at Central Plaza. Paid businesses retain their ranked plot and entrance billboard. The Pavilion also appears on the main city map. Five fictional exhibits, two trails and one launch are available only in demo mode at `/city/discover?demo=1`.

## Implemented scope

- One moderated sample per business: before/after slider, selectable gallery, or guided preset comparison. These display owned uploaded images and text, not executable business code or live AI generations.
- Operator-curated trails with 3–5 ordered businesses, reasons to visit, paid-plot markers, a Pavilion view for free stops, next/back navigation and explicit explored-stop progress.
- Anonymous progress stays on the device. Signing in merges that progress into the account without overwriting previously completed stops. Account progress, follows and saved launches are private.
- Business owners submit UTC launch windows. Operators review exact draft versions, publish, reject or archive them. An edited draft does not silently replace its published revision. Upcoming/live/past status follows the published window; at most five active launches can be featured.
- Following is distinct from saving a business. The in-app following page presents businesses and their launches; no emails or automatic subscriptions are created.
- Existing offer claims, bookmarks and view/click tracking also support approved free businesses. Suspension removes eligibility. Organic actions do not write financial ledger or ranked listing rows.
- Public trail and launch routes have server-generated metadata and share-card support through the optional Vercel City adapter.
- Owners and operators see bounded 30-day discovery event aggregates and CSV export. Events use daily salted visitor hashes and deduplication. Sample activity and manually marked trail completion are engagement signals, not verified purchases or conversions.

## Architecture and boundaries

`CityStorefront` contains an approved profile and an optional paid `CityProperty`. The catalog merges paginated businesses with required trail stops, launch businesses and followed businesses. Published content and upload previews are signed server-side; unpublished draft data is restricted to the workspace boundary.

Migration `20260920152544_city_discovery.sql` adds entries, review audit records, follows, saved launches, trail progress and metrics. All tables enable RLS and deny direct anonymous/authenticated access. The service-only mutation RPC checks the supplied authenticated actor, owner/operator authority, revision fences and published eligibility. Edge functions obtain the actor from verified authentication, validate payloads and enforce rates. Public read responses never expose private follower lists or claim codes.

`city-api` exposes discovery catalog, workspace and sharing reads. `city-command` dispatches discovery mutations and bounded telemetry. The new shared helper is executed only by these City Edge functions; no Fly world/game worker executes it. Existing Stripe billing, ranking, refund and reconciliation logic remains unchanged.

## Rollout

1. Select an isolated Supabase staging project and configure the existing City baseline. No staging project has been selected in this work.
2. Apply the City migrations in order: base marketplace, pilot analytics, then discovery. Review the migration replacing `city_mutate`: its financial branches are preserved; free claims and bookmarks use approved business content.
3. Deploy `city-api` and `city-command` with their shared dependencies. Use the existing dedicated webhook/reconcile deployment when establishing a fresh City environment. No Fly rollout is needed.
4. Keep `CITY_DISCOVERY_ENABLED=false` initially. Configure browsing/onboarding gates, authentication redirects, media storage and analytics salt. Enable discovery only in staging after migrations and functions are present.
5. Verify real owner/operator/visitor sessions: owned upload, sample review, free claim/save, follow/unfollow, progress restore, launch submit/edit/stale review/archive and suspension. Check share metadata on the chosen host. Run Stripe sandbox recovery checks separately before enabling purchases.
6. Onboard approved real pilot businesses and curated content, then enable production deliberately. Demo brands are not production inventory.

Disabling the discovery flag hides discovery reads and mutations. The command boundary also prevents new free claims/bookmarks while disabled; removing a bookmark remains possible. Keep additive tables and review history during rollback.

## Verification and limits

Local database checks cover owner/operator permissions, stale reviews, published revision preservation, progress union/filtering, idempotent follows/saves, free claims, suspension/archive behavior, RLS and unchanged paid ranking/refund/retry scenarios. Browser checks cover mixed paid/free trails, samples, reload progress, mobile overflow, free deep links and WebGL fallback. Existing marketplace and mocked onboarding/payment UI checks also run.

These are local database and browser fixtures, not hosted acceptance. Hosted Supabase sessions, authenticated discovery editor flows, signed production media, Stripe sandbox, real mobile GPU performance and pilot retention remain rollout checks. Discovery catalog reads currently bound entries to 100, follows to 500 and analytics observations to 10,000; larger deployments need explicit pagination/aggregation. No conversion attribution, cash rewards, arbitrary scripts, email campaigns or runtime AI calls are included.

Local verification on September 20, 2026 passed: `npx tsc --noEmit`, `npm run build`, `npm run check:city:server`, `npm run test:city`, `npm run test:city:discovery`, `npm run test:city:sharing`, `npm run test:city:discovery:browser` and `npm run test:city:browser`. The dev server starts and browser suites report no runtime errors. Build warnings remain for large application chunks and the existing `/landing/output-card-atlas.png` reference. Browser evidence is written under ignored `output/playwright/`; it is not a physical-device certification.

## Next pilot decisions

Measure sample interaction, trail completion, follows, offer claims and return visits separately from spend. Interview creators about whether a sample helped them choose a tool. Expand the strongest useful trails and recruit relevant businesses before adding more districts or competitive inventory. Verified conversion integrations remain a later phase.
