# Synarc City: URL-to-campus

## Delivered experience

Each approved business has one public city address and a separate mini campus with an HQ and one to six exhibit stations. Campus stations never allocate ranked land or write the financial ledger. Free businesses enter through Discovery; paid businesses also enter from their existing lot. Routes are `/city/business/:slug/space` and `/city/business/:slug/space/:exhibit`. Existing profiles derive a welcome/sample, current offer when available and launch board without a data migration.

The campus reuses the Downtown MegaKit assemblies, entrance billboards, roads and landscaping. Courtyard and avenue recipes place stations deterministically. It uses a separate lazy-loaded R3F scene and map controls; the global city renderer unmounts on entry. Returning restores the in-session camera/selection or originating trail stop. HTML exhibit navigation, reduced-motion camera behavior and WebGL-loss fallback preserve access. The fictional demo is `/city/business/creator-2/space?demo=1`.

The owner editor supports galleries, confirmed before/after pairs, guided comparisons, screenshot walkthroughs, offer stands and launch boards. Owners can upload/replace images, reorder/remove/add exhibits, choose the layout and primary exhibit, preview and save. Offers and launches reference approved platform content. The primary exhibit supplies the compact property sample. Sample editing moves to the campus editor once a campus exists.

## Data and publication contract

`CityCampus` version 1 is optional inside the existing `CityProfile`. Each exhibit has a stable slug-like ID, typed template, title, item labels/descriptions, owned image paths and source URLs. Before/after requires exactly two images and owner confirmation. No arbitrary scripts, HTML, generated geometry or visitor-triggered model calls are accepted.

Profile and campus share `city_businesses.draft_version`: existing save, verification, submit and operator-review commands freeze and publish the complete bundle atomically. The operator can open the submitted campus preview. Changes never overwrite published content before approval; suspension hides public campus reads. The main city/discovery payload omits full campus content, which is fetched on entry. Public campus refresh runs every 30 seconds while visible. Private previews retain source evidence; public offer codes remain stripped.

Migration `20260920160701_city_campus.sql` adds:

- `city_campus_revisions`: a trigger records campus JSON at each business draft revision.
- `city_setup_jobs`: immutable request identity/base revision plus saved source manifest, planner responses, candidate, lease, usage and stage progress.
- `city_setup_budget`: a separate provider-spending cap, disabled by default.
- `city_campus_metrics`: daily visitor-deduplicated views, sample interactions and clicks, excluding authenticated owner activity. Owner workspace reads aggregate at most 10,000 observations from the last 30 days; these are not conversions.

All new tables enable RLS, revoke direct client privileges and use service-only RPCs. Edge authenticates the actor and checks ownership; the database repeats owner, revision, allowance and budget checks. Published campus reads require approved, nonsuspended business content.

## URL setup and refinement

`city-api` adds `campus_public` and `campus_workspace`. `city-command` adds `campus_save`, `campus_start`, `campus_refine`, `campus_retry`, `campus_cancel`, `campus_apply` and `campus_track`. Writes identify the business; draft-changing commands include the expected version, and starts require a UUID request key. Reusing a key for different input is rejected. Candidate application requires the original draft revision and saves to the draft, never directly to publication.

The Fly worker adds a signed-wake `city_setup` family and globally admits one running City job, with lease heartbeats, shutdown release and stale-job recovery. Stages are extraction, planning, media import, assembly, validation and ready. Existing generation families retain their own execution paths.

Extraction reads the homepage plus up to four same-origin product/example/about pages, using the existing DNS-pinned HTTPS/redirect/response-size boundary. It extracts text and up to twelve candidate images without executing scripts. Static HTML is the supported input; inaccessible and JavaScript-only sites produce warnings and manual-upload guidance. Images must be PNG/JPEG/WebP, up to 5 MB each and 30 MB total. Imported image paths are deterministic per job/image and owner-scoped, preventing duplicate uploads after interruption.

The model gateway receives bounded untrusted evidence and a typed schema, with no tools or executable output. It selects gallery/guided/walkthrough stations and branding images; it does not assert inferred before/after results. A first setup aims for three useful stations when evidence supports them and can return fewer. Prompt refinements merge changed station IDs, retain unmentioned exhibits, and remove only explicitly proposed IDs. Owners inspect the change summary, exact candidate and source pages before applying it. URL refresh is a new bounded refinement, not an automatic live update.

Successful source extraction and provider responses are checkpointed. Schema repair is limited to one extra call. Media failures produce a partial candidate and missing-image guidance; retrying missing media reuses the saved plan and successful uploads. Automatic execution is limited to three attempts per logical job. No new inference occurs for a saved-plan media retry.

## Spending, cancellation and reconciliation

Pilot allowance: one initial setup and two refinements per business, including cancelled logical requests. Retries reuse the original allowance. Manual editing remains available. The model gateway records provider usage but does not deduct app credits.

The disabled-by-default budget row has a maximum $20 USD aggregate provider allowance. Admission reserves a conservative bound for two calls with 65,000 input / 3,000 output tokens each, rounded up per call; requests over $1 are rejected. Frozen configured input/output prices calculate actual usage. Unknown or missing model/pricing blocks admission. Fly hosting and network costs are not covered by this provider ledger.

A provider-submission marker is saved before calling the gateway. Unknown outcomes retain their reservation and enter `uncertain`; they are never automatically resubmitted. Cancelling an in-flight request revokes its lease but cannot promise cancellation at the provider, so the hold remains. After verifying the exact provider response/billing receipt, a service operator may call `city_setup_reconcile(job_uuid, receipt_description, actual_usd_cents, saved_response_text)`. This appends receipt evidence, clears the uncertainty and allows an eligible failed job to resume its saved response. Cancelled jobs remain cancelled. Never infer zero cost from a timeout or release holds without provider evidence.

## Configuration and paired rollout

Server-only configuration:

| Setting | Behavior |
| --- | --- |
| `CITY_CAMPUS_ENABLED` | Public campus/editor boundary and worker gate; default false |
| `CITY_SETUP_ENABLED` | Admission and Fly execution; default false; disabling preserves published campuses |
| `CITY_SETUP_MODEL` | Required supported model ID, frozen per job |
| `CITY_SETUP_INPUT_USD_PER_MILLION` | Required verified positive input price |
| `CITY_SETUP_OUTPUT_USD_PER_MILLION` | Required verified positive output price |

Retain existing City browsing/onboarding/auth/storage/analytics and shared gateway credentials. Configure gates on Edge and Fly. Model/pricing admission values are read by Edge and frozen in jobs. Enable `city_setup_budget.enabled` only after explicit approval of staging provider spend; applying this migration does not enable it.

1. Select an isolated staging project and apply the City baseline, discovery and campus migrations in order. No staging project has been designated for this release.
2. Deploy `city-api`, `city-command` and the Fly world-generation worker together. The worker executes the new shared module; Edge-only deployment is insufficient. Shared wake-family callers remain compatible because this is additive; deploy other entries only if their execution imports change.
3. Enable campus/manual editing in staging first. Verify real visitor, owner and operator sessions, uploaded media, free/paid entry, revision rejection and suspension.
4. Configure a verified planner model/pricing, approve the separate pilot budget, then enable setup in staging. Exercise an asset-rich site, sparse site, blocked/JavaScript-only site, real provider usage, cancellation and worker restart. Do not seed demo brands into production.
5. Enable production deliberately after acceptance. Disabling setup leaves manual editing and published campuses available. Roll back the frontend independently while retaining additive data and usage evidence.

## Verification and limits

Local PostgreSQL fixtures cover exact-bundle publication, owner/RLS fences, idempotency conflicts, global leasing, stale recovery, uncertain holds/reconciliation, retry limits, allowance and budget rejection, stale candidate application and zero additional land/ledger rows. Worker fixtures cover bounded source extraction, source failure, schema/media rejection, pricing, review-only candidate assembly, saved response reuse and provider uncertainty without external inference.

Browser fixtures cover free campus entry, one renderer, samples, station deep links, trail return, mobile overflow and WebGL fallback. An authenticated API fixture covers manual editing through candidate application, submission and operator approval. Existing discovery and marketplace browser suites pass. These fixtures are not hosted authentication or provider acceptance.

The full repository test command passed 726 tests with 8 skips and zero failures. Focused City Edge/worker Deno checks pass. A broad Deno check of the complete world worker using the City import map reports 330 existing import/type errors; a pre-change entrypoint comparison produces the same 330. Hosted rollout must use the worker's actual build environment and remains unverified. No production deployment, real model inference, app-credit debit or provider-budget activation occurred in this implementation.

Final local verification on September 20, 2026 passed `npx tsc --noEmit`, `npm run build`, `npm run check:city:server`, `npm run test:city:campus` (PostgreSQL scenarios plus six Deno tests), `npm run test:city`, `npm run test:city:discovery`, all three City browser suites and `npm test`. Build warnings remain for existing large app bundles and `/landing/output-card-atlas.png`. The dev server starts without errors. Screenshots and local reports are under `output/playwright/`; no physical mobile GPU certification is claimed.
