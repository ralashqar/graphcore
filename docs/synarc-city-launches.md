# Organic City launches

## Behavior

Launches extends the existing discovery entries, media upload boundary, publication review, customer saves, follows, reminders and unique-code claims. The permanent city still opens around the paid number-one business. Launch Plaza is a temporary annex at world Z -510; it never allocates paid plots or changes City Value.

The merchant editor provides types, stable product identifiers, categories, tagline, description, owned cover/screenshots/MP4, product URL, device-timezone/UTC scheduling and an optional approved same-business deal. Private draft saving is separate from review submission. Pending or rejected edits preserve the last approved snapshot. Merchant pause is separate from operator archive; operators can audit an exception to the 24-hour overlap/30-day same-product cooldown. Already-started launches cannot reset their start time through editing.

Version-one lifecycle defaults: upcoming, a 15-minute launch moment, 24-hour live window, seven-day recent window, then history. A merchant's earlier end wins. Existing timestamps and URLs remain intact. These are versioned server/domain policy constants, not merchant-controlled ranking settings; changing the policy requires updating the SQL and shared resolver together.

Hot / Launches / Deals navigation keeps the city visible. Launches supports today, coming soon, trending, recent, saved, text search and category filters. Plaza allocates up to eight current and four upcoming displays within three days, filling unused slots from the other group. Existing displays retain order during refresh to avoid jumping under the pointer. All launches remain available through paginated discovery. Late visitors do not replay the reveal. Reduced motion uses static figures; videos load only in selected detail panels and require playback input.

## Authority and privacy

`city_launch_signals` stores one row per launch/account/action with a retained first timestamp and reversible enabled state. Interested requires an authenticated verified account at Edge. Save/reminder/claim signals come from their existing authoritative database mutations. Each account contributes its largest decayed signal: Interested 4, Save/Reminder 3, committed Claim 6; six-hour half-life, 48-hour window. At least five eligible accounts are required for public score/rank. Identifiable owners, paid value, impressions, clicks, shares and merchant-reported redemptions are excluded. Existing saves/reminders are retained, without inventing historical signal timestamps.

New tables are RLS-enabled and service-only. Public APIs return approved launch content, counts and ranks, never account lists or coupon pools. `city_launch_observations` holds daily-deduplicated impressions, product visits and observed shares independently of rank. Card headings must be visibly observed for one second before an impression is reported. These are browser observations, not verified purchases or concurrent visitors.

Optional reward claims pass `sourceLaunchId` through `deal_claim`. The database locks the deal, validates the approved launch/business/deal association, allocates once and stores immutable attribution in the same transaction. Recovery returns the original claim without changing source. Launch participation never claims stock automatically. Merchant reports distinguish observations, interested accounts, reminder signups, committed claims and merchant-reported redemptions.

Publication, interest thresholds and top-ten organic placement create immutable, timestamped content events. Existing card export reads this evidence; suspended businesses cannot serve cards. Exported copies already downloaded cannot be revoked. Business follows, saved launches and explicit reminders remain separate. Reminder receipts survive reload; late reminders appear only during the relevant launch window.

## Interfaces and rollout

- `launch_catalog`: filter, query, category, offset; at most 25 items.
- `launch_plaza`: at most 12 items; stable placement refresh at five-minute boundaries.
- `launch_detail`: ID or existing slug; archived-by-time content remains readable.
- `launch_history`: approved business history, 25 records per page, including expired launches.
- `launch_interest`: authenticated ID and enabled state.
- `launch_track`: impression/product_visit/share; validated public launch, deduplicated actor/day.
- `launch_analytics`: owner-only business report.
- `launch_share`: latest confirmed publication/milestone event ID; existing card export renders it.
- `discovery_entry_save`: additive rich content and `saveDraft`.
- `discovery_entry_review`: optional operator `overrideReason` written to audit history.
- `discovery_launch_pause`: owner pause/resume, never an override of operator archive.

Catalog responses include server time and expiry. Media URLs are short-lived. Hidden tabs stop reads; stale activity drops to zero. The two new default-off flags are `CITY_LAUNCHES_ENABLED` and `CITY_LAUNCH_PLAZA_ENABLED`. Existing browsing/discovery/customer gates remain prerequisites. Animated queue motifs additionally require `CITY_ACTIVITY_ENABLED`; the city and Plaza never animate more than eight destinations/96 figures at once (half density below 900 px). No purchase flag is needed for discovery, following or existing entitlements.

Apply `20260920225908_city_launches_layer.sql` after the existing City migrations. Deploy `city-api`, `city-command` and the frontend together to isolated staging. Inspection found no generation-worker imports of the new launch modules; do not deploy unrelated Fly workers or submit generation jobs. Disable the new flags to roll back the experience; retain schema and claims.

No isolated staging project/frontend has been designated in this workspace. No hosted migration, production activation, provider spending or hosted acceptance is claimed.

## Verification

- `npm run test:city:launches`: lifecycle, rolling decay, Plaza selection; database deduplication, owner exclusion, paid allocation independence, publication continuity, private drafts, RLS, atomic reward attribution, recovery and suspension.
- `npm run test:city:launches:browser`: API-fixture browser flow for Plaza, deep links, guest saves, explicit interest/reminders, reward attribution, mobile sheet, reduced motion and merchant private-draft preview/save.
- Set `CITY_LAUNCH_STRESS=1` for a 400-property/12-display desktop browser fixture. Evidence is written under `output/playwright/city-launches-evidence.json`. The tested desktop view observed 40 figures within the 96-figure cap. This is not a physical mobile benchmark.
- Existing living/customer tests, City server type checks, TypeScript compilation, production build and dev startup/runtime checks are part of local acceptance.

Physical-mobile acceptance remains required before broad animation activation: record device model/OS/browser, test 400 properties plus 12 launch displays, loading, pan/zoom, interactions, memory, frame behavior and reduced motion. Browser viewport emulation does not satisfy that requirement.

Deferred: unrestricted comments, Ask the Maker, external notifications, sponsored launch inventory, full calendar, video share export and verified purchase attribution.

Local verification on 21 September 2026 passed: launch domain/database suites, City Edge/server checks, TypeScript, production build, development startup, launch/browser merchant flow, existing living/customer suites and market browser regressions. Build retains the pre-existing large-chunk and landing atlas warnings. No physical mobile device or hosted staging acceptance was performed.
