# GraphCore Current Data Model

This document describes the current domain model as implemented in the code, not the original design intent.

## Core Snapshot

The canonical in-memory state is `ProjectSnapshot`, defined and validated in [`src/domain/graphcore.ts`](../src/domain/graphcore.ts).

A snapshot includes:

- workspace metadata
- project metadata
- draft metadata
- optional `gameSpec`
- `archetypes`
- `definitions`
- `graphs`
- `assets`
- `patchSets`
- `releases`

The bundle compiler in [`src/domain/compiler.ts`](../src/domain/compiler.ts) consumes this snapshot and produces a deterministic `GameSystemBundle`.

## Definition Kinds

Current `definition_kind` values:

- `item`
- `stat`
- `quest`
- `character`
- `ability`
- `location`
- `environment`
- `world_model`
- `market`
- `narrative_flow`
- `graph`

Important specialized kinds added recently:

- `character`
- `ability`
- `environment`
- `world_model`

## Asset Kinds

Current asset kinds:

- `image`
- `audio`
- `json`
- `document`
- `mesh`
- `other`

`mesh` exists as a data contract only right now. There is no full 3D generation or preview pipeline implemented yet.

## Archetypes

Archetypes are reusable schema + field templates for a given definition kind.

They live in `snapshot.archetypes` and are stored in `project_archetypes` plus `project_archetype_fields`.

The preset catalog in [`src/domain/presetCatalog.ts`](../src/domain/presetCatalog.ts) provides:

- archetype presets
- definition presets
- graph presets
- preset packs

The current approach is:

- keep a versioned code-owned preset library
- materialize project-local archetypes and definitions from those presets
- record preset source in metadata

## Game Spec

`gameSpec` is draft-scoped and stored inside `project_drafts.metadata.gameSpec`.

Schema lives in [`src/domain/gameSpec.ts`](../src/domain/gameSpec.ts).

Main sections:

- `theme`
- `systems`
- `contentScope`
- `selectedPresetIds`
- `bootstrapTargets`
- `overrides`

This is the canonical top-level brief for a game draft.

## Specialized Data Contracts

The specialized classes are still built on the generic `definition + components` model, but now have fixed shared modules.

### Character

Important character-related component types:

- `character_profile`
- `ability_loadout`
- `animation_binding`
- `logic_state_machine_binding`
- `inventory`

Character subtype enum:

- `humanoid`
- `beast`
- `construct`
- `undead`
- `vehicle`
- `spirit`

`humanoid` is the default compatibility subtype.

### Environment

Environment-related component types:

- `environment_profile`
- `environment_render_binding`
- `environment_navigation`
- `environment_spawn_rules`

Environment subtype enum:

- `interior`
- `exterior`
- `dungeon`
- `settlement`
- `wilderness`
- `structure`
- `biome`
- `poi`

### World Model

World model component types:

- `world_profile`
- `world_environment_index`
- `world_render_binding`

World model subtype enum:

- `hub_world`
- `region_set`
- `planetary_world`
- `mission_world`

### Physical / 3D-Ready Items

Physical item support is represented with:

- `physical_item_profile`
- optional `render_3d_binding`

Physical item subtype enum:

- `prop`
- `equipment`
- `weapon`
- `pickup`
- `world_object`

This is data-only. It reserves a stable place for later 3D systems.

## Graph Model

Graphs are separate from definitions and stored in:

- `draft_graphs`
- `draft_graph_nodes`
- `draft_graph_edges`

Graph types:

- `narrative_flow`
- `system_graph`
- `quest_flow`

Node types include:

- `start`
- `text`
- `choice`
- `condition`
- `effect`
- `quest_step`
- `branch`
- `call_subgraph`
- `return`
- `random`
- `market`
- `end`

## Validation

The main validator/compiler lives in [`src/domain/compiler.ts`](../src/domain/compiler.ts).

Recent validation areas include:

- field value shape
- archetype field compatibility
- ability references
- player-only input binding checks
- location -> environment links
- environment -> world_model links
- world_model environment index links
- asset reference validation for placeholder render data

## Important Practical Rule

When extending the schema, prefer:

1. fixed kind
2. fixed component type
3. strict subtype enum if needed
4. additive custom fields only after that

Do not invent new ad hoc schema blobs if an existing kind/component/subtype can carry the data cleanly.
