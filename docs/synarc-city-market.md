# Synarc City: permanent competition

## Product contract

City Value buys movable sponsored geography, not ownership of a fixed coordinate or guaranteed traffic. The underlying `land_value` ledger remains net eligible paid principal after refunds and disputes. GBP pennies, the £10 minimum, £50,000 per-payment maximum and earlier-incumbent tie order are unchanged. Organic discovery never reads the new attribution or paid-ranking records.

The public map has a Central Plaza leader card, a Top 10 drawer and a paginated market feed. Selecting a ranked business travels to its property. Fresh map/deep-link entry briefly establishes the centre before travelling to the requested business; pointer/wheel interaction interrupts the introduction, and reduced motion skips the travel. Existing in-document camera restoration remains. Management/account pages open their requested task directly.

The merchant studio exposes current and best recorded rank, building tier and next threshold, category comparison, traffic sources and configurable in-app displacement alerts. Category rank does not imply a separate district plot. Next-place, Top 10 and #1 shortcuts are shown when those targets exist ahead of the business. Quotes show old/projected rank, a compact position diagram, tier and up to ten businesses potentially passed.

## Authoritative estimates and payment settlement

`city_market_quote` reads every eligible business in one database snapshot, independently of the loaded map region. The quote includes timestamp and allocation revision. A target requires one penny more than the incumbent, rounded up to the purchase minimum; targets beyond the per-payment maximum are disabled. Empty target coordinates mean additional capacity must be allocated on settlement, not a guaranteed location.

The client refreshes the quote immediately before checkout. Changed rank, tier or current principal requires reviewing the updated estimate and clicking again. Checkout still accepts a contribution amount, never a promised rank. Stripe reconciliation, leases, idempotent orders and the immutable compensating ledger remain authoritative. A competing payment can change the actual result between preview and settlement.

The additive allocator wrapper takes the same transaction lock, captures the previous allocation, runs the existing append-only plot allocation, and records the resulting changes atomically. Allocator and quote use `city_market_tier` with the existing thresholds. The browser's matching `CITY_TIERS` provides presentation names/heights; threshold changes must update both contracts and boundary tests.

Only the first positive, fulfilled settlement of an order is a `purchase`. Refunds, disputes, reinstatement and moderation reallocations are `correction`. A repeated effective payment creates neither a new allocation revision nor a new alert.

## Transition and replay

`city_market_transitions` stores version 1, revision, cause, initiating business, timestamp and compact before/after facts: identity, slug, name, colour, value, rank, coordinates, tier and approved logo/billboard storage keys with crop settings. History rejects update/delete. Public reads omit currently suspended or unpublished businesses and expose no customer or order data.

One three-second root transform moves architecture and billboard parts together, including a tier change. The new tier grows into place; it does not retain the previous mesh as a second model. Labels hide during movement and reappear afterwards. Live playback leaves the visitor's camera alone, coalesces newer revisions, ignores historic catch-up and snaps for reduced motion. Offscreen geometry is not instantiated just to animate it.

The explicit replay action returns the camera to the centre and renders frozen names, colours, positions and tiers. Replay uses the frozen logo/billboard references, signed on read; unavailable/deleted assets fall back to template signage. No coupon codes or private profile fields are copied. It is labelled separately from a live change. Event links use `/city?market=<revision>`; rank-card downloads use the recorded timestamp. Video export and timed billboard auctions remain deferred.

## Backend boundaries

Apply `20260920202005_city_market_competition.sql` after the existing City migrations. New service-only tables:

- `city_market_transitions`: immutable grouped movement history.
- `city_market_preferences`: per-business lose-central, leave-Top-10 and optional rank threshold settings.
- `city_market_alerts`: owner-only, revision-deduplicated alerts and read state.
- `city_market_attribution`: daily deduplicated source/kind observations, separate from organic popularity.

`city-api`: `market_public`, `market_quote`, `market_position`.

`city-command`: `market_preferences`, `market_read`; existing `track` accepts the bounded attribution source. Owner checks protect quotes, metrics, preferences and alert reads. RLS denies direct browser access. Public reads are rate limited, private/no-store and signed through the existing listing media helper. Feed pages contain at most 20 revisions; each revision describes its affected allocation.

Source labels are `paid_top_spots`, `organic`, `deal`, `share`, and `city`. These are browser-reported discovery attribution, not verified purchases. Reports explicitly distinguish property opens/outbound clicks from measured 3D exposure. This release does not manufacture canvas impressions, conversion revenue or ROAS. Existing customer funnel analytics, campaign checklist, deals and campus editor remain available.

## Activation and verification

`CITY_MARKET_ENABLED` defaults false and requires `CITY_BROWSING_ENABLED`. Deploy `city-api`, `city-command`, `city-stripe-webhook` and `city-reconcile` together after applying the migration in the chosen isolated staging project. The last two use the updated database settlement function. No Fly world/game worker executes these City modules, so no Fly or model deployment is required. No AI inference or real payment was submitted during implementation.

Disable the flag to roll back UI/API exposure; retain migration and financial/history data. Do not reverse paid ledger entries as a deployment rollback.

Local checks:

- `test:city:market`: root motion and neutral correction labels; full migration chain; exact ties, min/max and global quotes; settlement races; displacement without removal; upgrade transitions; duplicate payment, refund and reinstatement; rank threshold alerts; pagination, moderation filtering, history immutability and private access.
- `test:city`: existing order/ledger/webhook and 401-plot expansion checks with the new allocator.
- `test:city:customer`: complete migration chain and unchanged organic/search/save boundaries.
- `test:city:market:browser`: desktop/mobile leader and feed, replay and event links, quote shortcuts, owner preferences/read state, attribution and runtime checks using mocked APIs.
- Customer browser regression, TypeScript, City server checks, production build and development startup.

Hosted Stripe settlement, realtime delivery under concurrent clients, migration application and performance on physical mobile devices remain staging acceptance work. No staging project has been designated, and the shared GraphCore production project has not been modified.
