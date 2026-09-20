# City adaptive landing

## Delivered experience

The live map remains the entry surface. A fresh document frames the paid #1 building in the clear canvas area after accounting for desktop panels or mobile search and leader controls. Search and business/deal deep links retain their destination; the initial central introduction is brief and interruptible. Reduced motion avoids the introductory delay. Returning from an in-app panel preserves the camera rather than pulling an exploring user back to centre. Central Plaza remains an explicit reset.

Welcome copy introduces discovery and collapses on exploration, selection, search or filters. A local `city-explored-v1` preference makes later visits compact. Login does not control this state. About City and For Businesses open optional explanations. The existing Synarc logo, typography, controls and light palette are retained.

Top spots opens the paid market from the shared navigation. The central leader card remains labelled sponsored. Challenge #1 routes to the merchant workspace, displays the current leader and preselects the server-calculated contribution needed to beat it. This never starts checkout or accepts terms. Quote refresh and settlement continue to determine actual rank. A confirmed movement result shows the actor, rank change and displaced leader where applicable, with optional replay; financial corrections remain neutral.

Nearby approved active deals and campus content supply scene markers. Business panels feature an available deal, exhibit or launch before offering entry to the full business space. Existing claim/auth, wallet, moderation and campus publication contracts remain unchanged.

## Measurement contract

`CITY_EXPOSURE_ENABLED` is false by default and requires `CITY_MARKET_ENABLED`. Canvas exposure is a browser observation, not proof of attention or a billable ad impression. Every 250ms, at most four of twelve nearby projected candidates are sampled. At least two of three rays must hit that property's instanced geometry, with a readable projected size, clear DOM foreground and stable screen position for two seconds. Hidden tabs, dialogs and movement replay reset/pause qualification. Scene occlusion, camera movement and gaps reset the dwell. This conservative sampling can undercount and needs physical-device profiling before broad rollout.

Leader-card exposure is separate: at least 75% intersection for two seconds, while visible and without an open dialog. The service-only `city_record_exposures` RPC accepts bounded batches, verifies published paid non-suspended businesses, excludes the signed-in owner and deduplicates each kind per actor/business/day. Public actor derivation and rate limits reuse the existing market boundary. Browser signals can still be spoofed; these are advisory analytics. Neither kind affects organic ranking, claims, payments or revenue attribution.

## Backend and rollout

Migration `20260920220724_city_landing_exposure.sql` extends the market attribution kind constraint, adds the restricted RPC and returns the current leader in the existing quote snapshot. Existing quote tie rules, integer pennies, limits and financial ledger are retained.

New customer read actions `customer_nearby` and `customer_destination` use the existing approved content projection and feature gates; responses are bounded and contain no private claims/codes. No new worker or model execution is introduced. City API/command and frontend need staging rollout after the migration; world/game Fly workers do not execute these changed modules.

No hosted migration, real payment or production activation was performed. Keep exposure disabled until the designated staging environment passes authenticated owner exclusion, rate limits, real-device performance and camera/occlusion review. Disable the exposure flag to stop observation collection without reverting ledger/history data.

## Local verification

- TypeScript, production build, City server type checks and development-server startup.
- Landing domain tests: desktop/mobile clear regions, welcome/deep-link persistence, stable visibility dwell.
- Customer database regression: projection availability, deduplicated organic ranking, saves and private access.
- Market database regression: payment/rank rules, authoritative leader quote, exposure deduplication, owner/suspension exclusion, batch bounds and anon/auth RPC denial.
- Browser fixtures: central leader, optional About, compact return visits, challenge prefill without checkout, feed/replay, distinct canvas/card observations, merchant alerts, mobile overflow and reduced motion. Customer fixtures cover discovery, saves, wallet, explicit authenticated claims and deep links. Browser backend responses are mocked; this does not establish hosted Stripe or integration acceptance.
