# Unified gameplay builder

Schema 3 (`unified.v1`, `gameplay-3.0.0`) composes dialogue, inventory, objective prerequisites, combat, movement and spatial interactions in one bounded desktop Babylon level. Schema-1/2 drafts and published manifests retain their original readers and runtime paths; existing drafts are not automatically converted.

## Authoring and runtime

The unified workspace offers Plan, Systems, Level, Interactions, Assets and Build. Broad prompts create a durable reviewed plan. Generate gameplay materializes that exact plan against its frozen source revision. Selected-node prompts use direct bounded refinement. Definitions expose state ownership, input/output contracts, dependency graphs and separate behavior/generation views. Nested fields remain editable as validated JSON; arbitrary visual programming is not offered.

Character definitions are reusable across placed actor instances, with explicit player selection and one-time objective-triggered activation. Objectives support talk, collect, reach, defeat, interact and deliver, with sequential/parallel prerequisites and exactly-once item rewards. Delivery consumption and rewards commit together. Pickup quantities, objective progress, activation, key consumption and stable spatial attachments are checkpointed. The shared 60 Hz Rapier motor, procedural poses and Babylon renderer remain the execution foundation.

Independent chair, horse, vehicle and door recipes namespace their definitions. Additional pickups, NPC conversations, encounters and delivery objectives are composed from registered node schemas. Effects can add bounded damage, healing, stamina changes, slow statuses, impulses and release-time projectiles to registered abilities. Input attacks in schema 3 target the nearest hostile inside the ability range; collision sweeps still govern hits. A projectile intersecting an actor between the chest and launch socket impacts that actor rather than disappearing as an obstructed launch.

Exploration, Combat, Courier and Observatory are presets of the shared format. Courier and Observatory use different objective/instance compositions and layouts. Presets supply validated defaults; the planner can propose typed additions, edits and removals. New operations still require runtime/schema/acceptance work.

## Server boundary

`game-command` accepts `template: unified.v1` and `plan`/`materialize` alongside scoped `generate`, `save`, `build`, `test`, `cancel`, `retry` and `publish`. Materialization requires `planJobId`. Plans are stored in completed job checkpoints and exposed by the existing authorized job read. Broad planning has scope selection followed by bounded system, instance/layout and scenario child tasks. Child kind ownership and existing-node scope are enforced outside the model. World context remains frozen reference data.

The additive `20260908201203_unified_gameplay.sql` migration extends immutable node capture, preserves service-only command/lease/billing boundaries, stores plan inputs and prevents planning from publishing a design revision. Materialization freezes the reviewed plan transactionally. Provider uncertainty uses the existing reconciliation path; deterministic build retries retain fenced cached steps. `GAME_UNIFIED_ENABLED` defaults off and is additive to the owner allowlist and game/module gates. Planning uses the configured game model and design credit reservation; materialization and primitive builds are deterministic and free.

Compilation validates typed references and objective cycles. Simulation and isolated Chromium test the actual objective graph rather than assuming the legacy courtyard. Required recipe interactions and save/restart/load are checked. Rejected candidates cannot replace the last accepted build. Acceptance is bounded and can reject a layout whose supported route cannot be found; it is not a proof for arbitrary geometry.

## Verification and rollout

Commands: `npm run test:game-unified`, `npm run test:game-unified-browser`, `npm run test:game-unified-db`, `npx tsc --noEmit`, `npm test`, `npm run build`, `npm run build:game`, plus worker/Edge Deno checks and development-server inspection.

Deploy the migration, three game Edge entries, isolated game worker and preview app as a compatible set. Keep schema-3 admissions gated until hosted plan/materialize/build/publish acceptance passes. The main app frontend requires its own hosting deployment. Rollback disables new admissions while retaining schema-3 readers for existing builds.

## Release limits

Gameplay-first primitives are the release scope. Final mesh/rig bindings remain the subsequent production phase; Adventure's existing production assets remain supported. No arbitrary generated code or Blender scripts, automatic rigging, animation generation, multiplayer, multiple linked levels, general terrain navigation or full vehicle dynamics. NPC behavior remains patrol/chase/attack. Required schema-3 mission placements are on supported ground; authored ledge mechanics remain available but arbitrary elevated mission routes are not generated.

## Verified deployment — 8 September 2026

The migration is applied and recorded, all three game Edge entries are deployed, and the isolated game worker and preview apps are deployed. `GAME_UNIFIED_ENABLED=true` admits the existing consenting owner only; the existing owner allowlist remains unchanged. Main frontend compilation and local browser checks passed, but its hosting deployment awaits a specified destination.

Hosted planning, reviewed materialization, simulation, build admission, publication and real-keyboard release checks passed for both missions:

- [Courier](https://graphcore-game-preview.fly.dev/?release=462d1f74-8fcc-4086-8de2-8f5e652346cd): 11 published-browser checks, no errors. Scoped refinement changed sprint speed from 5.5 to 6; every sibling node remained unchanged.
- [Observatory](https://graphcore-game-preview.fly.dev/?release=7055979f-c70f-4f38-95b4-ecb661feccbd): 8 published-browser checks, no errors, with a different layout and no riding requirement.

The full suite passed 715 tests with 8 existing skips. TypeScript, app/runtime builds, worker/Edge checks, database transaction tests and local workspace browser checks passed. Existing published Adventure, combat and interaction previews passed regression checks. Initial hosted planning failures exposed nested schema unions and insufficient preset context; both were corrected and successfully rerun, with failed job diagnostics retained.

Detailed evidence is recorded under ignored `output/game-unified-*` files, including `game-unified-published.log`, `game-unified-tests-complete.log` and per-mission live fixture reports. Acceptance fixture projects are archived after publication; their explicitly published builds remain available.
