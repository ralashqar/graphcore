# Animation generation preflight

`animation-preflight-1.0.0` adds a generation admission check for flexible studio graphs. Graph authoring and static/saved previews remain available when a motion is unsupported or needs clarification. No finite action template catalog is introduced.

## Structured review and controlled commands

The existing graph-edit planner runs first. A separate strict-schema critic then returns exactly one result per clip, with capability requirements, exact evidence quoted from the graph, and typed contradiction/ambiguity/continuity findings. The critic cannot change the graph, approve IDs, execute commands, or override deterministic checks. Unknown capabilities, duplicate/missing nodes and invented evidence reject the report. One repair attempt is allowed.

Supported capability declarations are `humanoid_motion`, `static_contact` and `locomotion_processing`; `animated_partner`, `dynamic_prop`, `terrain_ik`, `physics_simulation` and `non_humanoid_rig` are unsupported by this pipeline. These classify requested execution capabilities rather than animation names: arbitrary single-humanoid gestures, dance, sword actions and mimed interactions remain valid subjects. The critic is instructed to respect negation and distinguish static props or mimed riding from coordinated dynamic actors.

Deterministic checks enforce graph integrity, profile/contact compatibility, conflicting simultaneous effector positions, and the actual compiled provider prompt length. The compiler now rejects descriptions over 1,500 characters instead of silently truncating constraints. The report status is derived by code: `ready`, `needs_clarification`, or `unsupported`. A semantic review is not proof of physical feasibility or a guarantee of visual quality; post-generation validation and creator review remain required.

## Persistence and admission

Reports are server-owned data in the existing fenced planner job's `checkpoint.studioEdit.preflight`. The report fingerprints the graph with the preflight policy version, excluding accepted clip hashes/IDs and pinned candidate IDs; candidate acceptance and source pinning do not require another semantic review. Graph intent edits invalidate reports. The server recomputes report findings from the typed critic output and deterministic rules, rather than trusting a stored status field.

`plan` adds optional `reviewOnly: true`. This skips graph-edit generation entirely and assesses the unchanged graph. The existing finish-edit transaction records a new immutable revision with the same graph and its review; stale jobs still cannot overwrite newer work. Normal planning includes the critic automatically. If semantic review fails, valid graph edits are retained with an explicit error and no passing report. The UI offers another readiness check.

Before generation reservations or inference, the authenticated Edge boundary loads a matching completed report from the same workspace and requires every selected unbound clip to be ready. Unrelated blocked states can remain as placeholders. Client-supplied approval fields are rejected by the strict command schema. Each prepared asset job carries a service-created preflight receipt bound to its exact recipe hash. The worker verifies it immediately before fresh custom inference. Existing submitted requests can still reconcile, and saved-source CPU imports bypass this inference-only receipt requirement.

## UX and costs

Motions & review exposes Generation readiness, per-state status, reasons, questions and suggested changes. Suggestions open the existing scoped composer without submitting it. Check generation readiness uses the current design-credit price and never generates motion. Prompt planning adds one critic call, or two if review repair is needed; it uses the existing model gateway, job fencing, usage tracking and design-credit reservation. The configured user-facing credit price is unchanged. Missing/stale/failed reports keep new inference blocked.

There is no database migration, new GPU reservation policy, budget increase or provider gate change. Shared world-generation execution is unaffected. Worker version is `game-animation-studio-2.2.0`; deploy animation-studio, game-command, get-game-workspace, get-game-release and the isolated Fly game/preview apps together.

## Verification

31 focused tests and the existing regression suite (726 passed, 8 skipped) passed. The focused checks include forged/stale/incomplete reports, exact-recipe worker receipts, conflicting contacts, unsupported capabilities, semantic contradictions, selective admission, strict schemas and prompt overflow. `scripts/animation-preflight-browser.mjs` verifies review, generation button gating, scoped suggestions and invalidation with a deterministic mocked critic; it submits no inference. `npx tsc --noEmit`, the main and game builds, and Deno checks for the game worker and animation Edge entry passed. The dev server started on port 5215; the animation route loaded without page errors after initial compilation. Existing saved-motion studio browser acceptance also passed.

All four Edge entries and both isolated Fly apps are deployed. Asset worker health reports `game-animation-studio-2.2.0` on image `deployment-01M2BEGZWY3R4HE28PV94ERDQ4`. The animation endpoint returns OPTIONS 200 and unauthenticated POST 401. Main frontend verification is local; its hosting destination is still unspecified.

`scripts/animation-preflight-hosted.mjs` exercised a fresh CPU-only import without a preflight receipt in the marked test project. Job `b17654d2-14c9-4c7b-b7dc-07c67c44787a` completed with validated candidate `30060861-b766-48fc-b796-4aa5b7b78ace`; downloaded GLB bytes matched the recorded hash. The provider-started flag stayed false and the setup reservation count did not change. The candidate remains unaccepted and unbound. This verifies saved-source compatibility, not fresh inference or authenticated semantic-review admission.

Hosted LLM critic quality and authenticated end-to-end prompting remain separate acceptance checks under the existing account/credit gates. No claim is made that all semantic contradictions are detected.
