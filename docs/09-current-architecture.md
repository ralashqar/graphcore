# GraphCore Current Architecture

This document explains the main runtime architecture as it exists now.

## High-Level Shape

GraphCore is a React + Supabase authoring app for game data. The current architecture is split into these layers:

- `src/app` equivalent is currently centered in [`src/App.tsx`](../src/App.tsx)
- `src/features` contains UI workspaces and shell components
- `src/application/services` contains thin use-case services
- `src/domain` contains pure schemas, validators, bundle compilation, presets, and prompt contracts
- `src/infrastructure` contains adapters that bridge application services to repository / backend code
- `src/data` contains the main repository implementation for live Supabase access plus local fallback behavior
- `supabase/functions` contains the protected Edge Functions

The long-term modularization is in progress, but the current direction is already visible in the service and feature split.

## Main Frontend Composition

The top-level runtime is [`src/App.tsx`](../src/App.tsx).

It owns:

- auth/session bootstrap
- workspace loading and refresh
- active game switching
- onboarding open/close state
- local editable snapshot state
- prompt generation and apply calls
- bundle compilation and publish entrypoints

It lazy-loads the heavy workspaces:

- `GraphWorkspace`
- `ContentWorkspace`
- `AssetsWorkspace`
- `SpecializedDefinitionWorkspace`
- `ActivityWorkspace`
- `ReleasesWorkspace`

## Feature Modules

Important feature entrypoints:

- [`src/features/shell/WorkspaceTopbar.tsx`](../src/features/shell/WorkspaceTopbar.tsx)
  - top tabs
  - active game selector
  - new game action
- [`src/features/onboarding/GameBootstrapOnboarding.tsx`](../src/features/onboarding/GameBootstrapOnboarding.tsx)
  - manual first-run / new-game bootstrap overlay
  - game archetype + concept prompt flow
- [`src/features/prompts/PromptDock.tsx`](../src/features/prompts/PromptDock.tsx)
  - compact bottom dock
  - model + prompt only
  - sends prompt or reopens initialization for an empty game
- [`src/features/graphWorkspace.tsx`](../src/features/graphWorkspace.tsx)
  - graph editing surface
- [`src/features/itemAssetWorkspace.tsx`](../src/features/itemAssetWorkspace.tsx)
  - generic content workspace coordinator
- [`src/features/content/SpecializedDefinitionWorkspace.tsx`](../src/features/content/SpecializedDefinitionWorkspace.tsx)
  - dedicated `Characters` and `Environments` top-level tabs

## Service Layer

Application services are intentionally thin wrappers over infrastructure adapters:

- [`src/application/services/authService.ts`](../src/application/services/authService.ts)
- [`src/application/services/workspaceService.ts`](../src/application/services/workspaceService.ts)
- [`src/application/services/promptGenerationService.ts`](../src/application/services/promptGenerationService.ts)
- [`src/application/services/patchApplyService.ts`](../src/application/services/patchApplyService.ts)
- [`src/application/services/publishService.ts`](../src/application/services/publishService.ts)

These services define the UI-facing use cases without putting Supabase calls directly into most feature modules.

## Infrastructure Layer

Important infrastructure adapters:

- [`src/infrastructure/auth/supabaseAuthAdapter.ts`](../src/infrastructure/auth/supabaseAuthAdapter.ts)
- [`src/infrastructure/graphcore/graphcoreWorkspaceAdapter.ts`](../src/infrastructure/graphcore/graphcoreWorkspaceAdapter.ts)

The graphcore adapter delegates to the repository in [`src/data/graphcoreRepository.ts`](../src/data/graphcoreRepository.ts).

## Repository Responsibilities

[`src/data/graphcoreRepository.ts`](../src/data/graphcoreRepository.ts) is still one of the larger files. It currently handles:

- loading the active workspace/project/draft snapshot
- creating workspace shell data when needed
- creating a new game as a new project + primary draft
- listing games in the current workspace
- persisting active game selection
- bootstrapping baseline archetypes
- local fallback prompt generation when hosted prompt generation fails
- calling hosted prompt/apply flows

This is still a major integration point, but it is no longer the only control center in the app.

## Shared UI / State

Shared workspace-facing types live in [`src/shared/workspace.ts`](../src/shared/workspace.ts).

Editor state is split into lightweight Zustand slices:

- [`src/state/slices/workspaceSelectionSlice.ts`](../src/state/slices/workspaceSelectionSlice.ts)
- [`src/state/slices/promptComposerSlice.ts`](../src/state/slices/promptComposerSlice.ts)
- recomposed in [`src/state/editorStore.ts`](../src/state/editorStore.ts)

## Current Tabs

Top-level tabs are defined in [`src/shared/workspace.ts`](../src/shared/workspace.ts):

- `graph`
- `content`
- `characters`
- `environments`
- `assets`
- `prompts` (used as activity/history)
- `releases`

`characters` and `environments` are intentionally first-class tabs now, not hidden inside the generic content view.
