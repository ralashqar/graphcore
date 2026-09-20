# City Deals: unique creator rewards

## Delivery and boundaries

Business owners can create an offer, upload unique codes, submit it for operator review, and issue one entitlement per signed-in account. Approved deals appear at a business property and its expanded campus. Offer stands optionally reference one deal; unlinked stands list the business’s approved deals. Businesses without an offer stand still have an accessible campus deals section. Paid map properties with an active, stocked deal receive a restrained `✦ Deal` marker (up to 40 visible markers).

Consumers can browse without an account. Claiming opens the existing SynArc sign-in flow and remembers the selected deal in this browser session. Successful claims expose one unique code and a claim reference; My Deals recovers them across reloads/devices. Guests, anonymous Supabase users and visitor-side AI cannot allocate rewards. Existing reusable-code offers remain explicitly labelled Public offers, and their legacy history is unchanged.

Uploaded codes must already exist and work at the merchant. SynArc allocates codes; it does not configure the merchant’s checkout. Exclusivity is a merchant confirmation, not an independently verified guarantee. A redemption deadline is allowed only when the merchant confirms their store enforces it. No short local timer pretends to invalidate an external coupon.

## Data and access

Migration `20260920172201_city_deals.sql` adds `city_deals`, `city_deal_codes`, `city_deal_claims`, `city_deal_audit` and `city_deal_metrics`. All have RLS enabled and all public/anon/authenticated privileges revoked. Server-only, security-invoker RPCs (`city_deal_mutate`, `city_deal_stats`) have execute privileges only for service_role. This follows the same authenticated Edge boundary as existing City services without introducing a security-definer function in the exposed schema.

`city_deal_mutate` locks the deal row, checks the business/schedule/inventory, returns an existing entitlement on retry, and assigns a locked unused code in one transaction. The unique `(deal_id,user_id)` and unique code-reference constraints reinforce allocation. Quantity is the imported pool size; imports support 1–1000 codes per batch. Duplicate batches roll back completely. Quantity can grow by importing additional codes without changing the frozen reward terms. Code values are exact/case-sensitive: merchants must match their checkout’s uniqueness rules before import, including avoiding reuse across campaigns.

Once any claim exists, terms cannot change. Before that, editing removes approval and increments the revision; an operator approves only the exact submitted revision. Pause/end stops new issuance and does not erase existing claims. All issued codes remain assigned indefinitely, including after expiry or correction of a redemption report. No recycling job exists. A deal is never itself “claimed” or “redeemed”; consumer receipt state is computed independently from its frozen terms, cancellation flag and redemption report.

MVP monetary support is GBP, USD and EUR using integer minor units, with integer percentages. Other currencies, per-customer commerce checks and authenticated merchant integrations are deferred. Offer descriptions must specify any product/new-customer restrictions: SynArc cannot enforce those at an unintegrated checkout.

## Interfaces

All requests are POST and use the existing City API client. Deal responses set `Cache-Control: private, no-store`.

| Endpoint | Actions | Access |
| --- | --- | --- |
| city-api | `deal_catalog` (`businessId`) | Public, approved deals of a published, non-suspended business only; never code inventory |
| city-api | `deal_wallet` (`offset`) | Signed-in claimant; 50 entitlements per page, each with their assigned code |
| city-api | `deal_workspace` (`businessId`, or `admin:true`) | Business owner, or operator review queue; terms and aggregate counts, no codes |
| city-api | `deal_claims` (`id`, `offset`) | Owning merchant; 50 issued claim references per page, no codes/customer identifiers |
| city-command | `deal_save`, `deal_import`, `deal_submit`, `deal_pause`, `deal_end` | Owner; existing deal mutations require exact `version` |
| city-command | `deal_review` (`id`, `version`, `decision`, `note`) | Operator, pending revision only |
| city-command | `deal_claim` (`id`) | Permanent signed-in account; repeat request recovers the same entitlement |
| city-command | `deal_report`, `deal_correct` (`id`, `claimId`, optional `orderId`, `note`) | Owner; corrections require a reason; append-only audit history |
| city-command | `deal_track` (`id`, `kind:open|click`) | Public, rate-limited, daily salted-IP deduplication; authenticated owner activity excluded |

Business workspace/catalog reads are bounded to 100 deals, newest first in the workspace. This is a pilot limit; larger catalogues need pagination. The current UI reports issuance/open and merchant-reported-redemption/claim ratios. Opens and clicks count daily network identifiers, not unique people; blocked telemetry can make issuance/open exceed 100%. Claims come from committed entitlement records. A click never records redemption. Reports are explicitly **merchant-reported**, with no provider-verified revenue attribution. Property views remain in the existing business dashboard. Land Value is unchanged.

Optional `CityExhibit.dealId` links a stand to a deal. The public catalog always scopes by business, so a foreign or stale reference cannot reveal another merchant’s private deal. Website setup can suggest an offer stand but its strict model schema has no entitlement/code/discount-creation command. Refining the same stand preserves the owner’s existing deal reference; the model cannot author it. Publication still requires the existing business review. Worker version: `2026-09-20-city-deals-1`.

## Verification and rollout

Local verification covers CSV rules, monetary/schedule schema, transactional allocation, duplicate import rollback, repeated/final-stock requests, frozen terms, stale/self approval, owner isolation, suspension, schedule bounds, audit corrections and direct-role permission denials. PGlite serializes its connections; this verifies database behavior and constraints, not hosted multi-session contention.

The browser fixture exercises create → import → submit → operator approval → campus claim → retry → wallet reload → merchant report → mobile wallet. A signed-out browser opens sign-in and restores the selected deal after reload. Test codes never reach a real merchant. Existing City/campus/discovery regression checks are run alongside compilation/build checks. Generated screenshots are local test artifacts under `output/playwright`.

Local results (20 September 2026): `npx tsc --noEmit`, `npm run build`, `npm run check:city:server`, the deals/campus/discovery/City suites and their browser checks passed. `npm test` passed 726 tests with 8 existing skips. `npm run dev` started successfully, and the fresh development-server browser smoke reported zero runtime errors, including desktop/mobile navigation and WebGL fallback. The production build retains the existing large-chunk and unresolved landing-atlas warnings. Hosted database advisors, real parallel sessions and merchant checkout remain unverified.

Launch remains disabled by default with server flag `CITY_DEALS_ENABLED=false`. No hosted migration, Edge deployment, Fly deployment, real coupon claim, model request or merchant checkout has been performed as part of this implementation.

Staging activation sequence:

1. Apply the additive migration on the designated staging project after preceding City migrations. Run database access checks/advisors and parallel authenticated requests against the last real test code; confirm only one account receives it.
2. Deploy city-api and city-command. Shared City/profile/schema code also bundles into city-stripe-webhook and city-reconcile; redeploy those with the same branch. Pair the world-generation Fly worker deployment because campus assembly preserves the new references; unrelated game workers are unaffected.
3. Set `CITY_DEALS_ENABLED=true` on staging alongside the existing City browsing/onboarding/campus flags as appropriate. Keep URL-setup inference and spending gates unchanged.
4. Use separate operator, merchant and customer accounts. Upload merchant-configured sandbox codes, approve the exact terms, claim, recover on a second device and complete one actual merchant checkout. Check external single-use and expiry behavior and document the evidence.
5. Pilot with a small creator-tool cohort only after those checks. Use per-deal pause/end for normal operational stops so issued rewards remain recoverable. Turning the global feature flag off hides the feature and its wallet; it is an emergency shutdown, not a substitute for pausing issuance.

Follow-on integrations should add evidence provenance and reservation/commit/cancel semantics for checkout; verifying an entitlement alone does not reserve it against two concurrent purchases. Physical QR, staff roles, guest identity linking, reward gates, platform cash balances, store OAuth, notifications and cross-business vouchers are intentionally outside this release.
