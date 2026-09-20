# Customer discovery release

## Customer experience

`/city` gains a creator-focused discovery rail with full-text search, category filters, Hot Now, Freebies, Exclusives, Ending Soon, Surprise Me and a persistent My Deals button. Existing SynArc landing routes remain unchanged. Paid placement remains the shared geography; search returns matching paid-business IDs independently of result pagination and dims nonmatching buildings without removing geometry. Free approved businesses remain searchable and open through the existing Discovery Pavilion/business routes. Campus and launch destinations reuse their existing pages.

Deal deep links use `/city/deal/:id`, resolve the public business and select its plot where present. They open the deal terms without claiming anything. Expired or paused links explain current unavailability; previous entitlements remain accessible in the wallet. Social-card routes contain public offer descriptions, never receipts or codes. Mobile keeps the map behind a collapsible selected sheet. The existing directory remains the keyboard/WebGL fallback. Medium-zoom discovery markers use screen-space collision checks, a maximum of eight, and text/icon labels; far zoom suppresses them. Existing asset instancing, near/far building meshes and selected-only video loading remain.

Browsing is anonymous. Unique-code claims still require sign-in and an explicit claim button after authentication. Deal, business and launch saves work on-device for guests and merge idempotently into the account after login. Saving never reserves stock. Account storage becomes authoritative after migration. The wallet combines existing Active/Used/Expired/Cancelled receipts with saved discoveries and in-app reminders for saved launches and followed business activity. No email, push permissions, guest entitlements or new financial reward economy is introduced.

## Backend contracts

New flag: `CITY_CUSTOMER_DISCOVERY_ENABLED=false` by default. Requires the existing browsing/discovery flags; deal and campus flags separately gate their content. Apply `20260920185857_city_customer_discovery.sql` after all prior City migrations.

The existing `city-api` accepts:

- `customer_search`: query (max 160), filter (`all|hot|free|exclusive|ending`), category and offset. Returns at most 40 typed public business/exhibit/deal/launch results, next-page indication, categories, server time and a five-minute ranking bucket.
- `customer_resolve` and `customer_share`: deal ID → public destination/availability or social metadata.
- `customer_activity`: published available offers/launches plus aggregate committed claims with a minimum of five claims before display.
- `customer_wallet`: authenticated active entitlement count, saved items and reminders. No new endpoint returns coupon codes; existing private `deal_wallet` remains the receipt source.
- `customer_metrics`: owner-only 30-day discovery funnel.

`city-command` accepts `customer_merge` (one bounded, transactional batch of up to 200 local saves), `customer_save` (business, launch or deal), `customer_track` (property/deal opens) and `customer_event` (diagnostic city/search/result/surprise/wallet/impression/merchant-visit activity). Actor identity is derived server-side. Every request passes existing rate limiting; raw search terms and client-provided identity are not stored. Existing property tracking also records customer activity so free businesses receive organic credit.

`DealTerms` adds optional `freeConfirmed`, `cardRequired`, `renewalTerms`. Missing classification is not treated as free. Confirmed free offers must use free-product/trial types, require no minimum purchase, and trials must describe renewal/cancellation. The existing operator review and claimed-terms immutability apply. Exclusivity remains merchant-attested, not independently guaranteed.

All new private tables and the content view use RLS, revoked browser grants and service-only operations. Only the content revision table is publicly readable/realtime-published. Coupon inventory and personal claims are never published to Realtime. Transactional deal/business/launch changes bump the revision; consumers refetch sanitized metadata. Visible-tab polling and reconnect refresh cover clock-driven expiry and missed updates. Server-side claim admission remains authoritative.

## Discovery rules and measurement

The SQL content projection searches approved business name/category/description, published campus exhibit descriptions, approved deal terms and published launches. Unpublished/suspended businesses are excluded. Availability is evaluated at read time; saved unavailable deals remain recognisable. Text relevance precedes organic activity; paid rank never breaks a discovery tie.

Organic score is property opens ×1 + deal opens ×2 + saves ×3 + committed claims ×6, exponentially decayed with a six-hour half-life across a 48-hour window. Each actor/business/action contributes once per day. Scores use a five-minute time bucket and are computed on demand, avoiding another scheduler dependency at pilot size. Five distinct observed actors are required for a trending label; otherwise the interface says New discoveries. Accounts and daily salted network identifiers are observations, not proven distinct people. Owners are excluded when identifiable. Merchant-reported redemptions and paid spend do not contribute. Anonymous network resets and coordinated accounts remain pilot abuse limitations.

Ending Soon means available content ending within 24 hours. Remaining quantity is actual unissued code stock. Surprise Me weights usable content above plain business listings and avoids the last eight selected businesses within the discovery view. No fake stock, crowds, people counts or purchases are shown.

Diagnostic `city_customer_metrics` stores daily deduplicated observations. Card impressions require at least 50% viewport visibility for one second. They are discovery-card impressions, not proof that a building was seen in the canvas. Merchant reporting distinguishes observations, committed claims and merchant-reported redemptions; purchases and verified revenue require a future integration. Account city-open events support return-rate analysis; anonymous daily network hashes cannot establish cross-day retention. Do not use these metrics to unlock scarce rewards.

The initial search uses a live Postgres full-text projection rather than an external engine or stale index. It performs text-vector evaluation over eligible content at pilot scale; measure query plans/latency before increasing inventory and materialize/index this projection when warranted. Event tables have business/time indexes. A separate aggregate worker is unnecessary for this release.

## Verification and rollout

Commands: `npm run test:city:customer`, `npm run test:city:customer:browser`, existing City deal/discovery/campus/sharing suites, `npm run check:city:server`, `npx tsc --noEmit`, `npm test`, `npm run build`, and dev-server startup/runtime checks.

Local regression results: 726 repository tests passed with 8 existing skips; City deal, sharing, discovery and campus browser suites passed. New customer database and browser fixtures passed. Existing large-bundle and landing-atlas build warnings remain.

Database tests apply real City migrations in PGlite and verify free discovery, publication boundaries, FTS, free/ending filters, feature flags, organic cold start, event deduplication, owner exclusion, saves without allocation, invalidation and private grants. PGlite serializes connections: hosted multi-session claim contention still requires staging acceptance. Existing claim allocation tests remain in place.

Browser fixtures verify guest save, sign-in merge, explicit claim after login, direct deal selection, wallet counts, cold-start labels, filters, mobile overflow and dialog Escape behavior with no runtime errors. Fixture useful-content rendering was approximately 1.9–2.6 seconds on the development machine; this is not a hosted/mobile performance result. Before enabling a pilot, measure useful content within five seconds and central interaction within eight seconds on a documented physical mobile/network profile.

Deploy the additive migration, `city-api`, `city-command` and City frontend/sharing routes together in the designated isolated staging project. This change does not modify Fly-executed generation modules and requires no new Fly deployment or inference. Earlier campus/Fly rollout prerequisites remain separate. No hosted migration, checkout, model call or deployment was performed by this implementation. The staging project is still undesignated; shared GraphCore production is not a substitute.

Enable the customer flag after authenticated staging acceptance and public-data inspection. Roll back by disabling the flag; existing City routes, receipts, business tooling and stored saves remain intact. Monitor discovery latency, failures/rate limits, properties opened, claim/save activity, search-result engagement, wallet revisits and account seven-day return rate. Keep merchant-reported redemption separate from verified acquisition.

Later work: provider-verified redemption, guest claims if needed, notification delivery, precise local search, personalization, and server-validated reward trails. Existing self-reported trails are not entitlement authority.
