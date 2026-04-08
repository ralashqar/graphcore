# Prompt, Bootstrap, and Edge Function Flow

This document describes the current prompt-generation path and how onboarding/bootstrap is connected to it.

## Frontend Prompt Entry

The main prompt entry surface is [`src/features/prompts/PromptDock.tsx`](../src/features/prompts/PromptDock.tsx).

The dock is intentionally minimal:

- model selector
- prompt text
- generate button

If the active game is empty, the dock does not run a normal generation request. It redirects the user into onboarding instead.

## Prompt Request Contract

Frontend request/response types live in [`src/domain/prompting.ts`](../src/domain/prompting.ts).

Current request shape supports:

- `mode: 'orchestrate'`
- `intent`
- `phase`
- `gameSpec`
- `gameArchetypeId`
- `gameConceptPrompt`
- `selectedPresetIds`
- `allowedPresetIds`
- `selectionContext`
- `operationBudget`
- `autoApply`

Current response shape supports:

- `requestSummary`
- `executionPlan`
- `activityEntries`
- `operations`
- `diagnostics`
- `assistantNotes`

## Current UX Behavior

The current happy path is auto-apply.

Meaning:

1. frontend sends prompt request
2. hosted backend returns operations plus planning/activity metadata
3. frontend stores a preview entry for activity/history
4. if operations are present, frontend immediately calls `apply-patch`
5. frontend reloads the live snapshot

The old mandatory manual review model is no longer the main UI flow.

## Bootstrap Flow

Bootstrap uses the same general generation infrastructure, but with a different intent and phase.

Onboarding sends:

- `intent: 'bootstrap_game'`
- `phase: 'bootstrap_orchestrator'`
- `gameArchetypeId`
- `gameConceptPrompt`

The server then derives:

- `gameSpec`
- selected preset IDs
- starter archetypes
- starter definitions
- starter graphs

## Game Archetypes and Presets

Top-level game archetypes live in [`src/domain/gameArchetypes.ts`](../src/domain/gameArchetypes.ts).

The preset library lives in [`src/domain/presetCatalog.ts`](../src/domain/presetCatalog.ts).

The current direction is:

- user picks a high-level archetype
- user writes a concept
- the backend chooses preset composition and starter content

This hides preset complexity from the onboarding UI while still keeping generation grounded in a fixed catalog.

## Hosted Prompt Backend

Main function:

- [`supabase/functions/prompt-patch/index.ts`](../supabase/functions/prompt-patch/index.ts)

Important shared backend helpers:

- [`supabase/functions/_shared/prompt-patch.ts`](../supabase/functions/_shared/prompt-patch.ts)
- [`supabase/functions/_shared/openai.ts`](../supabase/functions/_shared/openai.ts)
- [`supabase/functions/_shared/auth.ts`](../supabase/functions/_shared/auth.ts)
- [`supabase/functions/_shared/http.ts`](../supabase/functions/_shared/http.ts)

## Current Backend Strategy

The prompt backend now follows an orchestrated structure rather than a single freeform generation pass.

Conceptually:

1. parse and validate request
2. build compact prompt context from snapshot + selection + gameSpec
3. run orchestration / planning
4. generate dependency operations first
5. generate graph jobs when needed
6. merge operations
7. validate and repair
8. return operations + execution metadata

The exact implementation is still concentrated in `prompt-patch/index.ts`, but the request contract already reflects the newer orchestrator model.

## Apply Backend

Main function:

- [`supabase/functions/apply-patch/index.ts`](../supabase/functions/apply-patch/index.ts)

This function is responsible for materializing patch operations into real rows across:

- project definitions
- definition components
- archetypes and fields
- graphs, nodes, and edges
- draft metadata
- patch set status

It also handles preset-aware operations such as:

- `set_game_spec`
- `apply_preset_pack`
- `instantiate_archetype_preset`
- `instantiate_definition_preset`
- `instantiate_graph_preset`

## Bootstrap Data Expectations

Recent bootstrap behavior should create concrete data, not only archetypes.

For archetypes that imply authored spaces or entities, bootstrap should create:

- starter characters
- starter environments
- starter world models
- linked locations where appropriate

If onboarding results seem too thin, check:

- `src/domain/presetCatalog.ts`
- `src/domain/gameArchetypes.ts`
- `supabase/functions/prompt-patch/index.ts`

## Important Current Caveats

- `user_workspace_state` migration must exist for server-side active-game persistence
- there is still a browser-local fallback if that table is missing
- some older docs in this folder still describe the previous review-first prompt flow
- 3D-related fields are currently data-only placeholders, not real generation/rendering features
