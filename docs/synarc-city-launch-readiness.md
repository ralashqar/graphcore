# Merchant launch readiness and exhibit-linked offers

## Delivered behavior

Each deal in the merchant workspace and operator review queue has five readiness checks: business publication, unused customer codes, a current merchant-reported checkout test, operator approval, and an available or scheduled claim window. The checklist is advisory: it never publishes, pauses or retroactively invalidates a deal. Existing review and claim admission remain authoritative. “Complete” requires every check; a passed checkout test is explicitly not an independently verified conversion. Refresh deal readiness reloads server state.

The private customer preview uses authenticated workspace data and the same reward-term presentation as the live experience. It shows both an unclaimed card and an example receipt with `PREVIEW-ONLY`. Previewing never invokes claim, tracking, payments or checkout APIs. It neither reveals a customer code nor consumes inventory. Operators can inspect the same preview, but cannot read dedicated test-code values.

Owners register a separate disposable code already configured at their merchant checkout. SynArc does not create the external discount or submit an order. The owner opens their store, checks benefit/eligibility/single-use/expiry behavior, and records passed or failed evidence. A pass requires an explicit test confirmation and at least ten characters of notes. Checkout evidence is tied to an immutable snapshot of the tested deal terms: subsequent term edits make it stale, whereas importing more codes does not. A fresh code is required after terms change. Latest test attempts are used for readiness; older attempts remain private history.

Comparisons, galleries, guided examples and walkthroughs can link to one specific deal through the existing optional `CityExhibit.dealId`. Offer stands retain their all-approved-deals default when no specific link is selected. The visitor sees the relevant offer alongside the experience and can claim directly, without an exploration gate. The URL setup model cannot choose or create commercial offers; assembly preserves a manually selected link when refining that exhibit, regardless of exhibit kind.

## Data and API contracts

Additive migration `20260920182940_city_deal_launch.sql` follows the City Deals migration. It adds service-only, RLS-protected `city_deal_checkout_tests` and `city_deal_exhibit_metrics`, and optional source exhibit ID/title columns on claims. No client-role table access is granted. All new RPCs use security-invoker privileges and revoke public/anon/authenticated execution.

Dedicated checkout codes are rejected if they already occur in any customer pool for the same business. Conversely, every customer import checks all historical checkout test codes for that business. Registration/import serialize on a business-scoped transaction advisory lock in addition to the existing deal row lock. Test records never enter customer claims, quantity, issued counts or conversion statistics. Exact/case-sensitive code matching follows the existing inventory contract; merchants must respect their store’s own code-normalization rules.

| Boundary | Addition | Authorization |
| --- | --- | --- |
| `city-api` | `deal_launch {id}` returns the ten latest test records, including dedicated test codes | Current business owner only; private/no-store response |
| `city-command` | `deal_test_register {id,version,code}` | Owner; exact current deal version; idempotent for the same code and terms |
| `city-command` | `deal_test_report {id,version,testId,outcome,note,confirmed}` | Owner; test belongs to deal, current terms, audited report; `passed` requires confirmation |
| `city-api` | `deal_workspace` includes `businessReady`, `checkoutTest`, `exhibitStats` | Existing owner/operator boundary; no test codes in workspace summaries |
| `city-command` | `deal_claim` and `deal_track` accept optional `sourceExhibitId` | Source must be a currently published exhibit on that deal’s business, linked to that deal |

`city_deal_launch_summary` computes current evidence with JSONB term equality and returns no codes. `city_deal_exhibit_stats` aggregates daily-deduplicated opens/clicks, issued claims and merchant-reported redemptions by exhibit. Source links are validated against the published campus under the claim transaction’s business lock. The original claim stores the exhibit ID/title; retries do not rewrite its source, and historical attribution survives later exhibit removal. Legacy/direct claims stay unattributed. Wallet outbound clicks carry the frozen source when it is still a valid published link; removal can suppress subsequent click telemetry, never receipt access.

Origins are visitor-reported context constrained to legitimate published links, not proof that a visitor completed or watched an exhibit. They do not unlock rewards or affect Land Value. Authenticated owner metrics are excluded. Merchant correction of a redemption report updates derived exhibit totals. Source-less deal metrics and all financial ledgers remain unchanged.

## Verification

`npm run test:city:launch` checks readiness states and the real migration using PGlite: owner/version rejection, cross-campaign test-code isolation, idempotent registration, stale evidence, unchanged quantity/claims/metrics, private summaries, published-link validation and immutable claim attribution. Existing deal tests now apply both migrations. Campus tests cover gallery links surviving worker refinement.

The extended `npm run test:city:deals:browser` fixture checks private preview without allocation/telemetry, separate merchant test registration/reporting, operator review, exhibit-linked claim/retry, wallet recovery and mobile layout. It uses fictional codes and simulated APIs; no merchant order is placed. Existing campus/discovery smoke checks, server checks, TypeScript, build and full repository tests cover regression. PGlite serializes connections, so hosted multi-session contention remains a staging acceptance item.

Local verification on 20 September 2026 passed: launch/deal database and domain suites, eight campus server tests, City server compilation, TypeScript, production build, extended deal browser flow, campus/discovery browser regression and the broader repository suite (726 passed, 8 existing skips). The development server started successfully. Builds retain the existing large-chunk and landing-atlas warnings.

## Deployment and staging status

No hosted deployment or real checkout has been performed. `CITY_DEALS_ENABLED` remains default-off. Read-only project discovery found GraphCore and Katchimeras, neither designated as City staging. The dedicated `npm run check:city:launch-staging` report is blocked on `CITY_STAGING_SUPABASE_URL`, `CITY_STAGING_PUBLISHABLE_KEY` and `CITY_STAGING_ACCESS_TOKEN`. The checker refuses shared GraphCore production, never prints tokens, and does not require a Stripe key because deal readiness is separate from land payments.

On the designated isolated staging environment: apply the migration after prior City migrations, deploy affected City Edge bundles and the world worker together, enable the existing City flags, then run the checker and real merchant acceptance. Worker version is `2026-09-20-city-launch-1`; no model prompt, provider gate or budget change is introduced. The new operations execute in city-api/city-command; the shared worker change preserves exhibit references. Include other affected City bundles when deploying the branch because they share City/profile modules.

Acceptance requires separate owner/operator/customer accounts; confirm public APIs cannot read test records, preview does not allocate, changed terms invalidate test evidence, test codes cannot enter customer pools in either race order, and two customers competing for the last code produce exactly one allocation. Complete a merchant sandbox checkout manually, including its single-use/expiry behavior. Record that evidence without presenting it as provider-verified conversion. Hosted provider integrations and automatic redemption confirmation remain separate follow-on work.
