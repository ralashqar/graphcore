# Living storefronts and customer return visits

## Experience

The shared storefront resolver selects one approved primary campaign: ending within 24 hours, live launch, freebie, exclusive, ordinary deal, upcoming launch, then a verified sell-out within the last 24 hours. Deadline then stable content key resolves ties. Paused, ended, unpublished, suspended and expired content is excluded. Sell-out means all issued codes, not verified purchases; historical evidence is not fabricated for previously exhausted pools. Restocking restores the available state.

The map, property/campus panels, discovery cards and merchant preview share this policy. Colour is paired with text/icons; launches get a small architectural beacon. Full property content remains available. Pending merchant content has a separately labelled private draft preview and still requires approval. Existing main-panel follow controls remain distinct from saves.

Street figures represent deduplicated recent observed engagement, not avatars or people currently online. Version 1 uses the existing six-hour half-life score across 48 hours: property opens ×1, deal opens ×2, saves ×3, committed claims ×6. Five distinct observed actors are required. Scores below 5 are quiet, 5–19 active, 20–59 busy, 60+ very busy. Paid spend, canvas exposure, identifiable owner activity and merchant-reported redemptions do not contribute. Network identifiers do not establish unique people, and coordinated accounts remain a pilot limitation.

Only eight nearby properties animate, at most 96 figures total, halved on mobile. Figures use two instanced meshes on side setbacks; labels are bounded and collision-filtered. Reduced motion uses static figures. Replay/hidden tabs suppress them, and expired evidence returns to quiet. World signals do not move the camera or alter the financial ledger.

New Drops includes approved upcoming/live launches, live launches newest-first then upcoming earliest-first. Launch deep links remain over the main map, focus paid properties and offer full campus entry. Free businesses keep access through their business campus. Mobile launch sheets can be minimised. Central framing and explicit paid Top Spots remain unchanged.

## Return visits and evidence

Following / What’s New contains approved content events since following (up to the last 30 days), with pagination and private read state. Following does not expose an audience member's identity to businesses. Explicit in-app launch reminders appear when the published start passes, while the launch remains live. There is no scheduler or external delivery dependency: due reminders are projected on authenticated reads with stable keys and persisted read receipts. Late expired launches do not produce alerts. Saving a launch never creates a reminder. Unfollowing removes business updates; separately chosen launch reminders require their own cancellation.

A launch schedule change produces a new reminder occurrence key. Publication events freeze approved titles, business names, timestamps and limited public evidence. Sell-out events freeze quantity/issuance facts. Very-busy organic milestones are emitted at most once per business/day when a committed organic event qualifies; this is a score milestone, not a claimed #1 trending position. Existing historical milestones are not backfilled.

Merchant tools show follower totals, campaign history, current/draft storefront previews and creation shortcuts. Moment-card generation refetches the public evidence through the server before rendering a PNG; suspended/unpublished businesses cannot retrieve new cards. Already downloaded images cannot be revoked. Shared links go to the relevant business/deal/launch destination. No video export, revenue attribution or verified redemption is implied.

## Interfaces and storage

Migration `20260920223031_city_living_storefronts.sql` adds `city_content_events`, `city_launch_reminders`, `city_inbox_receipts` and a follow timestamp. Existing follows receive migration time, avoiding a backlog of fabricated notifications. Tables use RLS with browser grants revoked; mutation/read RPCs are service-only. Events reject updates/deletes. No new payment, code allocation or generation mechanism is introduced.

City API adds `customer_city_state` (up to 100 requested business IDs), `customer_resolve_launch`, `customer_inbox` (40 items/page), `customer_campaign_history` (owner only), and `customer_moment`. Commands add `customer_reminder` and `customer_inbox_read` (up to 40 keys). Existing customer rate limits and verified identity boundaries apply. Public living-state results contain only selected approved content, activity band, policy version, measurement window and expiry. No coupons, receipt contents or actor identities are returned.

`customer_search` accepts `drops`; the underlying query preserves text relevance and organic ranking for other filters. Campus/deal flags continue to gate their content independently. Existing customer-revision invalidation triggers refresh; visible-tab polling covers scheduled transitions and missed events. Living responses expire at the next five-minute bucket or earlier scheduled transition. Polling is bounded to 15 seconds for state and 30 seconds for inbox; stale data is hidden rather than presented as current.

## Rollout and rollback

Both new flags default false and require the existing customer discovery/browsing prerequisites. The storefront flag controls campaign presentation and in-app launch features; the activity flag controls score-derived motifs and milestones. The baseline discovery, campuses, paid ranking and claims remain usable independently. Disabling purchases does not disable these customer systems. `CITY_DEALS_ENABLED` remains the existing global emergency gate; disabling only deal discovery must not be confused with disabling entitlement recovery.

Apply migrations in order on the designated isolated staging project, then deploy City API/command and frontend. Neither the new helper nor domain resolver is imported by the Fly execution graph; no Fly/provider rollout is needed for this change. Existing campus rollout prerequisites are unchanged. Do not substitute shared GraphCore production for the still-undesignated staging environment.

Before enabling broadly: use real merchant/operator/consumer sessions, run multi-session publication/claim tests, verify revision delivery and flag combinations, and profile a 400-property scene on a documented physical mobile device/network. Keep flags off until these pass. Rollback disables flags and retains immutable evidence, private preferences and all financial/claim records.

## Local verification

- Living domain tests cover eligibility, priority, tie order, sell-out evidence and stale-state removal.
- PGlite migration tests cover drop filtering, explicit and idempotent reminders, schedule/expiry behavior, read isolation, follow/unfollow, immutable sell-out/milestone evidence, paid/organic independence, suspension and browser-role denial.
- Browser fixtures exercise guest discovery, existing authenticated claims with purchases disabled, main-panel follows, launch selection, reminders, read/reload/cancel behavior, mobile sheet collapse and reduced motion.
- A 400-property desktop-browser fixture checks scene/runtime behavior and the 96/48 figure caps. This is not physical-mobile performance certification.
- Existing customer and market regression suites, sharing tests, server checks, TypeScript, production build and development startup passed locally. Browser runs reported no runtime errors. The 400-property fixture recorded 54 draw calls and 565,944 triangles in its sampled desktop view, with 96 desktop / 48 mobile-width figures. These are fixture observations, not a physical-device performance guarantee. Known build warnings concern existing large shared chunks and the landing-atlas reference.

No hosted deployment, actual merchant transaction, AI inference, external notification or provider spend is performed by this implementation. Verified ecommerce redemption, timed billboard inventory, district allocation, QR redemption and rewarded trails remain deferred.
