# Live Workspace and Game Flow

This document explains how projects, drafts, onboarding, and active game selection currently work.

## Terminology

Current practical meaning:

- workspace: a user-owned authoring container
- project: a game
- draft: a version of that game

The app now treats `project` as the main game boundary.

## Startup Flow

The main startup path is in [`src/App.tsx`](../src/App.tsx) and [`src/data/graphcoreRepository.ts`](../src/data/graphcoreRepository.ts).

Runtime sequence:

1. read current Supabase session
2. ensure the user has a live workspace shell or fall back to demo mode
3. resolve the active game for that workspace
4. load the snapshot for that project + draft
5. compile the bundle and hydrate UI selections

## Active Game Selection

Server-side persistence target:

- `public.user_workspace_state`

This table stores, per user and workspace:

- `active_project_id`
- `active_draft_id`

If the table exists, refresh uses that record to reopen the same game.

## Missing-Migration Compatibility

The repository now includes a compatibility fallback for environments where `user_workspace_state` has not been migrated yet.

Fallback behavior:

- if Supabase reports that `public.user_workspace_state` is missing
- GraphCore falls back to browser-local storage
- key: `graphcore.active-game-selection.v1`

This keeps refresh and game switching usable until the migration is applied, but it is not a substitute for the real migration.

## New Game Flow

`New Game` no longer means "reuse the current draft and open onboarding".

Current behavior:

1. create a new `projects` row
2. create a new primary `project_drafts` row
3. mark draft metadata with `bootstrapStatus: 'pending'`
4. seed baseline archetypes
5. persist the new project/draft as the active game
6. reload only that game's snapshot
7. open onboarding for that new game

This is what isolates old graphs, definitions, and assets from the newly created game.

## Refresh Behavior

On refresh:

- GraphCore reloads the current active game
- onboarding does not auto-open just because the game is empty

An empty game now stays empty until the user explicitly initializes it.

## Onboarding Behavior

Current onboarding entrypoints:

- `New Game`
- explicit `Initialize Game` action when the active game is empty

Current onboarding non-entrypoints:

- browser refresh
- generic startup of an already existing empty game

The onboarding overlay also has an explicit close button now. Closing it leaves the empty game selected rather than deleting it.

## Game Switching

The top bar includes a game selector.

Selecting another game:

1. persists the chosen project/draft as active
2. reloads the snapshot for that game
3. clears UI selection state
4. keeps onboarding closed unless the user explicitly opens it

## Demo vs Live Mode

If the app cannot load a live workspace through Supabase, it falls back to the bundled demo snapshot.

That distinction is surfaced in `LoadedState` and shown in the shell.

Key rule:

- prompt generation, patch apply, publish, and real multi-game behavior only work in live Supabase mode

## Bootstrap Status

Draft metadata now uses:

- `bootstrapStatus: 'pending' | 'complete'`

`set_game_spec` in the apply flow marks bootstrap complete.

This status is useful for UI and game-list summaries, but current empty-state handling is still based primarily on whether the snapshot has a `gameSpec`, definitions, and graphs.
