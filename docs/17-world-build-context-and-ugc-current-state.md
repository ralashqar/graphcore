# World-Build Context And UGC Current State

Reviewed on April 16, 2026.

This document is the fast current-state study for GraphCore's world context generator. It explains how a prompt turns into characters, environments, items, graphs, and cinematics today, and where UGC-specific generation already exists in the codebase.

## Executive Summary

GraphCore is already more than a generic prompt-to-content app. The current system has a real orchestration path for:

- prompt intake
- world-build planning
- entity creation across characters, environments, and items
- graph authoring
- cinematic planning and runtime generation
- UGC-aware preset, subtype, and psychology metadata

The main gap is not the lack of UGC primitives. The gap is that our knowledge base and preset guidance are still less structured than the engine we already have.

## Main Surfaces In The App

The frontend runtime is centered in [`src/App.tsx`](../src/App.tsx). The most relevant authoring surfaces for world context generation are:

- [`src/features/onboarding/GameBootstrapOnboarding.tsx`](../src/features/onboarding/GameBootstrapOnboarding.tsx)
  - creates the first game concept and starter content
- [`src/features/prompts/PromptDock.tsx`](../src/features/prompts/PromptDock.tsx)
  - main prompt entry for later world-build and cinematic requests
- [`src/features/content/SpecializedDefinitionWorkspace.tsx`](../src/features/content/SpecializedDefinitionWorkspace.tsx)
  - dedicated character and environment authoring
- [`src/features/cinematics/CinematicsWorkspace.tsx`](../src/features/cinematics/CinematicsWorkspace.tsx)
  - cinematic graph authoring, editing, validation, and manual generation controls

## Canonical Data Contracts

The app's durable authoring state is `ProjectSnapshot` in [`src/domain/graphcore.ts`](../src/domain/graphcore.ts), backed by the current-state data model described in [`10-current-data-model.md`](./10-current-data-model.md).

The world context generator mostly works through these contracts:

- `DefinitionBase`
  - reusable world entities such as characters, environments, and items
- `GraphDefinition`
  - authored logic and cinematic graphs
- `GameSpec`
  - draft-scoped brief, theme, systems, selected presets, and cinematic defaults
- `WorldBuildPlanResponse`
  - planner output for prompt-driven world generation
- `CinematicPlan`
  - structured cinematic planning output with locked refs, script, storyboard, and shots

Relevant schema files:

- [`src/domain/worldBuild.ts`](../src/domain/worldBuild.ts)
- [`src/domain/cinematics.ts`](../src/domain/cinematics.ts)
- [`src/domain/gameSpec.ts`](../src/domain/gameSpec.ts)

## What The World Context Generator Produces

When the user prompts GraphCore, the system can generate or update:

- characters
- environments
- items
- world/narrative graphs
- cinematic graphs
- concept images
- storyboard sheets and panels
- composite continuity references
- cinematic stills and videos

This means the "world context generator" is not one prompt pass. It is a staged system that expands prompts into reusable world entities plus generated media.

## Current Prompt-To-World Flow

The current happy path is:

1. User enters a prompt in `PromptDock` or bootstrap onboarding.
2. Frontend packages the live snapshot, prompt text, and model choice.
3. [`src/data/graphcoreRepository.ts`](../src/data/graphcoreRepository.ts) validates the session, calls Supabase functions, and retries auth once if needed.
4. `plan-world-build` decides whether the request is:
   - `world_build`
   - `cinematic_build`
   - `direct_asset_generation`
5. `start-world-build` creates placeholder jobs for the required entities, assets, and graphs.
6. `poll-world-build` resolves jobs, repairs weak AI output, materializes graphs and assets, and may launch a child cinematic run.
7. Frontend merges the updated snapshot back into local state and subscribes to cinematic run progress where relevant.

Relevant backend files:

- [`supabase/functions/plan-world-build/index.ts`](../supabase/functions/plan-world-build/index.ts)
- [`supabase/functions/start-world-build/index.ts`](../supabase/functions/start-world-build/index.ts)
- [`supabase/functions/poll-world-build/index.ts`](../supabase/functions/poll-world-build/index.ts)

## How Characters, Environments, And Items Fit

GraphCore treats reusable world entities as definitions rather than temporary prompt tokens.

- Characters and environments are first-class authoring tabs.
- Items can be continuity-critical assets, hero props, equipment, or product objects.
- For cinematic extraction, the planner is intentionally selective about items. It only lifts an item into a reusable ref when that object needs continuity across beats.

That logic is visible in [`supabase/functions/_shared/world-build-cinematics.ts`](../supabase/functions/_shared/world-build-cinematics.ts):

- characters are default participants and speakers
- environments are settings and locations
- items are reserved for recurring or hero-level props, not generic clutter

This distinction matters for UGC because many prompts mention lots of objects, but only a few deserve continuity treatment.

## How Cinematic Generation Works Today

GraphCore's cinematic flow already has a strong authored model:

- `asset_ref`
  - direct source ref for a character, environment, item, audio ref, or style ref
- `composite_ref`
  - continuity lock for subject-plus-prop or other fused combinations
- `storyboard_ref`
  - sequence board or panel ref
- `cinematic_shot`
  - authored beat, framing, action, dialogue, audio, and reference packing
- `cinematic_take`
  - compiled execution unit for still/video generation

Key compiler/runtime files:

- [`src/domain/cinematicScriptCompiler.ts`](../src/domain/cinematicScriptCompiler.ts)
- [`src/domain/cinematicGraphProjection.ts`](../src/domain/cinematicGraphProjection.ts)
- [`supabase/functions/start-cinematic-run/index.ts`](../supabase/functions/start-cinematic-run/index.ts)
- [`supabase/functions/poll-cinematic-run/index.ts`](../supabase/functions/poll-cinematic-run/index.ts)

## Where UGC Already Exists In Code

UGC support is already embedded in the cinematic model. It is not just a future idea.

### Preset families

[`src/domain/cinematics.ts`](../src/domain/cinematics.ts) already defines:

- `story_movie_tv`
- `ugc_creator`
- `ugc_direct_response_ad`
- `ugc_faceless_format`

### UGC-specific subtypes

The same schema already supports subtypes such as:

- `creator_problem_solution`
- `creator_reframe`
- `creator_validation`
- `ad_problem_solution`
- `ad_mechanism_proof`
- `ad_before_after`
- `ad_comparison`
- `faceless_demo`
- `faceless_explainer`
- `faceless_process`
- `contrast_narrative`

### UGC-specific shot metadata

Shots and graph settings already carry:

- `hookRole`
- `formatSubtype`
- `formulaFamily`
- `dominantTrigger`
- `hookType`
- `targetEmotion`
- `personaStyle`
- `contrastAxis`
- `proofMoment`
- `ctaStyle`
- `proofType`
- `ctaType`
- `platformTarget`

### UGC-specific ref templates

[`src/domain/nodeLibrary.ts`](../src/domain/nodeLibrary.ts) already includes UGC-ready node templates:

- `creator_identity_ref`
- `product_hold_ref`
- `demo_proof_ref`
- `sequence_board_ref`
- `shot_panel_ref`

### UGC-specific planner and repair rules

[`supabase/functions/_shared/world-build-cinematics.ts`](../supabase/functions/_shared/world-build-cinematics.ts) already contains:

- UGC-aware planner instructions
- UGC-aware repair instructions
- quality checks for weak hook images
- warnings for abstract payoff without visible proof
- checks for insufficient contrast-narrative structure
- checks for faceless formats becoming too dialogue-heavy

### UGC-specific compile-time diagnostics

[`src/domain/compiler.ts`](../src/domain/compiler.ts) already warns on missing:

- first-shot hook clarity
- `formulaFamily`
- `dominantTrigger`
- product/proof continuity
- `personaStyle`
- `proofMoment`
- `ctaStyle`
- `contrastAxis`
- `targetEmotion`

The current engine therefore already expects structured UGC intent. What it needs now is a stronger internal playbook for how to choose those fields well.

## Supabase's Role In The System

GraphCore depends heavily on Supabase for the runtime control plane:

- Edge Functions for planning, generation orchestration, and publishing
- Auth for session validation and function invocation
- Postgres as the source of truth for draft state, graphs, assets, runs, and jobs
- Realtime for cinematic run and job updates
- Migrations for schema evolution

Important GraphCore implementations:

- session validation through `supabase.auth.getUser(access_token)` in [`src/data/graphcoreRepository.ts`](../src/data/graphcoreRepository.ts)
- function invocation through `supabase.functions.invoke(...)`
- realtime subscriptions to `cinematic_runs` and `cinematic_run_jobs` in [`src/App.tsx`](../src/App.tsx)

The relevant Supabase docs I reviewed against this architecture are:

- Edge Functions
  - <https://supabase.com/docs/guides/functions>
- JavaScript `auth.getUser`
  - <https://supabase.com/docs/reference/javascript/auth-getuser>
- Realtime Postgres Changes
  - <https://supabase.com/docs/guides/realtime/postgres-changes>
- Database migrations
  - <https://supabase.com/docs/guides/deployment/database-migrations>

These line up with the repo's documented patterns in:

- [`13-supabase-edge-function-runbook.md`](./13-supabase-edge-function-runbook.md)
- [`14-supabase-project-operations.md`](./14-supabase-project-operations.md)

## Why This Matters For UGC Knowledge Work

Because GraphCore already has preset families, UGC subtypes, continuity refs, repair rules, and validation diagnostics, the next improvement should not start with more schema invention.

The fastest leverage is:

1. improve the internal knowledge base of what makes UGC work
2. distill that into prompt guidance and preset heuristics
3. map each heuristic onto the fields the app already understands

## Highest-Leverage Next Moves

The most practical path is:

1. Treat UGC generation as a preset-guided persuasion system, not as generic short-form copy.
2. Standardize how we choose `formulaFamily`, `dominantTrigger`, `hookRole`, `proofMoment`, and `ctaStyle`.
3. Teach the planner what strong first-frame contrast, visible proof, creator identity, and escalation actually look like.
4. Add performance-memory metadata later, but first fix knowledge quality and prompt guidance.

That is what the `docs/ugc-mastery/` knowledge base is for.
