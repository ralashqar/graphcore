# Prompt-to-game architecture review

Review date: 8 September 2026. Status: recommendation, not implemented.

This review covers the local working tree, including existing uncommitted work. It combines source inspection, targeted existing tests, and current primary documentation. It does not establish the state of deployed services or demonstrate a live generated 3D game. No application code or infrastructure was changed for this review.

**Recommendation.** Build a dedicated Game workspace over GraphCore's existing canon and workflow infrastructure. Introduce a versioned game specification that compiles systems, prefabs, levels, UI, and assets into one reproducible playable build. Begin with a bounded single-player 3D adventure template. Use Babylon.js for the first playable runtime, retain the existing Three.js authoring tools, and use GLB plus structured manifests between them. Generate assets through a hybrid of procedural assembly, existing assets, image-to-3D providers, and isolated Blender processing.

The central product promise should be that a user can change one game system or asset, see its affected dependencies, and produce another working build without regenerating everything.

**What is already implemented in the inspected source**

| Area | Evidence | What it provides and where it stops |
| --- | --- | --- |
| Project-aware world creation | [projectContext.ts](../src/domain/projectContext.ts), [worldSeedProfiles.ts](../src/domain/worldSeedProfiles.ts), [worldPromptStrategies.ts](../src/domain/worldPromptStrategies.ts), [world-prompt.ts](../supabase/functions/_shared/world-prompt.ts) | Project/subtype inference, seed profiles, scoped incremental planning, graph mutations, canon identity and state. The game strategy concentrates on narrative, inventory, economy, travel, and progression. |
| Game presets | [gameArchetypes.ts](../src/domain/gameArchetypes.ts), [gameSpec.ts](../src/domain/gameSpec.ts), [gameBlueprints.ts](../src/domain/gameBlueprints.ts) | Broad genre presets and selected content packs. Only `narrative_rpg_mobile` has an entry in `GAME_BLUEPRINTS`. A genre preset is not an executable engine template. |
| Interactive execution | [interactiveSystems.ts](../src/domain/interactiveSystems.ts), [gameGraph.ts](../src/domain/gameGraph.ts) | Compiles manifests and executes conditions, outcomes, trade, stats, dialogue transitions, and travel. This is useful reusable gameplay logic. It does not provide a real-time 3D simulation loop. |
| Playable-flow UI | [WorldGraphPage.tsx](../src/features/world-builder/WorldGraphPage.tsx) | Interactive prototype and game readiness panel. The panel is shown for explicit game projects but uses Narrative RPG assumptions. Mobile shell generation is disabled. |
| Definitions and graph compilation | [graphcore.ts](../src/domain/graphcore.ts), [compiler.ts](../src/domain/compiler.ts) | Definitions, components, conditions/effects, subgraph references, diagnostics, bundle compilation. General ports carry direction and label but no payload schema. |
| Procedural environments | [environmentAssembly.ts](../src/domain/environmentAssembly.ts), [environmentAssemblyCompiler.ts](../src/domain/environmentAssemblyCompiler.ts) | Structured geometry graph, rooms, openings, stairs, surfaces, structural operations, Three.js mesh compilation, presets and macros. A substantial basis for greyboxing and modular levels. |
| 3D generation | [start-mesh-generation](../supabase/functions/start-mesh-generation/index.ts), [poll-mesh-generation](../supabase/functions/poll-mesh-generation/index.ts), [mesh-generation.ts](../supabase/functions/_shared/mesh-generation.ts), [render3d.ts](../src/domain/render3d.ts) | Image-to-GLB via `fal-ai/trellis-2`, job rows, storage and definition bindings. Start endpoint accepts characters/items only. This path is separate from the newer visual worker pipeline. |
| Durable production workflows | [outputWorkflowManifests.ts](../src/domain/outputWorkflowManifests.ts), [outputWorkflowNodeContracts.ts](../src/domain/outputWorkflowNodeContracts.ts), [output-workflow.ts](../supabase/functions/_shared/output-workflow.ts) | Node manifests, handler registry, child-workflow utilities, input hashes, recovery, caching, retry/cancellation and artifact registration. Manifests allow real schemas, but default schemas can be loose records; each game node needs explicit contracts. |
| Worker architecture | [world-generation/main.ts](../workers/world-generation/main.ts), [Director runtime design](26-director-runtime.md) | Existing durable execution and a newer isolated-runtime pattern. Director's documented rollout has remaining deployment gates; its existence is not evidence that the new runtime is live. |
| Release path | [publish-release](../supabase/functions/publish-release/index.ts) | Serializes a JSON bundle and records release/compile rows. It is not a game-code compiler, isolated execution environment, or browser acceptance gate. |

The current repository already has distinct world, definition/flow, environment assembly, and output workflow models. Preserve those responsibilities and add explicit references between them. Avoid copying all information into a new game graph.

Existing tests run for this review: `gameGraph.test.ts`, `interactiveSystems.test.ts`, and `worldPromptStrategies.test.ts`: **19 passed, zero failed**. Full compilation/build/dev-server verification was not run because this review changes only this document. Provider generation and real-browser gameplay remain unverified.

**The graph architecture**

Use a small composition graph with drill-down children. A node is the unit users can understand, inspect, change, validate and, where applicable, regenerate. A workflow appears as a composite node and opens into its own graph of meaningful steps. Individual variables, texture channels, and every function call do not need top-level nodes.

| Graph/document | Owns | Examples |
| --- | --- | --- |
| World canon | Creative identity and authored facts | Character, location, faction, item, history |
| Game composition | Runtime system contracts and composition | Movement, interaction, combat, inventory, quest, UI, save/load |
| System behavior | One system's executable logic | State machine, behavior tree, event handlers, conditions/outcomes |
| Prefabs and levels | Runtime components and spatial instances | Player prefab, NPC prefab, door prefab, level chunks, triggers, spawn points |
| Production workflows | How specifications become artifacts | Plan references, generate model, bake materials, rig, optimize, compile, validate |
| Build manifest | Exact approved inputs for a playable version | Specification revision, templates, modules, assets, compiler/runtime versions, reports |

Distinguish four identities: a canon entity such as an NPC; its reusable gameplay prefab; each spawned runtime instance; and the asset revision rendered by those instances. One actor can have multiple outfits and gameplay variants without duplicating canon. Several runtime enemies can instantiate one prefab. Gameplay sessions must never write transient health or quest progress back into world canon.

Separate edge meanings: `contains`, `references`, `depends_on`, `consumes_artifact`, `emits_event`, and `transitions_to`. Containment has no cycles. Build dependencies form a DAG. Gameplay state machines may have cycles; execute them with explicit event/tick semantics and transition budgets. Do not schedule gameplay cycles through the production DAG executor.

Keep React Flow and ELK, which are already dependencies. Rete is unnecessary for this architecture. The stored contract and compiler should not depend on the visual editor library.

**Contracts before implementation**

Introduce versioned domain contracts, with strict schema validation and explicit adapters for old records:

- `GameDesignSpec`: core loop, supported template, camera/control scheme, target device profile, session scope, win/fail states, performance constraints and creative direction.
- `SystemSpec`: stable key, revision, module/template version, configuration, input commands, output events, owned state, dependencies, required capabilities and acceptance scenarios.
- `PrefabSpec`: component composition, default state, collision shape, animation requirements, interaction sockets and asset bindings.
- `LevelSpec`: coordinate system, layout seed, chunks, prefab instances, traversal constraints, spawn/trigger volumes, lighting and navmesh requirements.
- `AssetRecipe`: subject identity, style version, isolated references, provider/recipe, dimensional and material requirements, geometry/texture budgets and QA policy.
- `BuildManifest`: exact revision/hash of every input, generated module artifact, compiled data, engine/compiler/toolchain versions, assets and validation reports.

For every production node require a handler version, typed input/config/output schemas, artifact roles, executor/resource class, input hash, time/cost limits, retry/cancellation rules, and lineage. Existing workflow manifests are the extension point, rather than a second competing registry.

For every gameplay system additionally declare who owns state, when it runs, which events it consumes/emits, and which dependencies it can call. For example:

| Inventory contract | Example |
| --- | --- |
| Owns | Item quantities and capacity |
| Inputs | `AddItem(itemId, quantity, commandId)`, `RemoveItem(...)` |
| Outputs | `InventoryChanged(delta)`, `InventoryRejected(reason)` |
| Invariants | Valid item IDs, positive command quantities, nonnegative holdings, capacity policy |
| Persistence | Inventory save schema and migration version |
| Tests | Add/remove, insufficient quantity, capacity exceeded, save/load roundtrip |

The quest system observes an item event and advances its own state; it does not directly mutate the inventory store. Treat a merchant transaction as an atomic domain command so currency debit and item transfer cannot partially succeed. Runtime instance IDs must be distinct from template and canon IDs.

Start with engine-independent TypeScript gameplay modules and a small component composition/runtime layer. Reuse the current interactive condition/outcome primitives after tightening their contracts. Keep simulation state out of React render state. Use fixed simulation steps, explicit event ordering, seeded generation/randomness where needed, and adapters for rendering, input, physics, audio and persistence. This improves repeatable tests; it does not imply identical physics across different engines or machines.

**Hierarchical prompt-to-game generation**

1. Infer project/game intent through the existing router. Resolve a supported runtime template, requested scope, device target and art direction. Preserve a user's existing world when converting it into a game.
2. Generate the game brief and a small complete gameplay loop. Record unsupported mechanics explicitly instead of pretending a broad genre preset implements them.
3. Freeze a source revision. Plan required systems, prefabs, level responsibilities and shared interfaces before generating implementations.
4. Validate cross-system contracts: commands/events, item/stat IDs, state ownership, units, capabilities, dependency cycles, start state and terminal conditions.
5. Expand each subsystem as a child workflow. Each planner receives its specification, relevant canon, dependency interfaces and budget; it does not need the entire project history.
6. Assemble tested template modules. Compile declarative behaviors first. Generate scoped custom TypeScript only for mechanics the module library cannot express.
7. Build a playable greybox using placeholder meshes and known-good character rigs. Verify the complete loop before expensive art production.
8. Run independent asset recipes and replace placeholders as validated assets finish. A failed art job should leave the playable greybox intact.
9. Compile and run integrated gameplay, visual and performance checks. Repair the failing owner with a bounded number of attempts and a specific failure report.
10. Register an immutable build and switch the preview's active-build pointer only after acceptance passes.

Example: for an adventure, generate movement, interaction, inventory, NPC dialogue, a quest, a locked door and save/load. The first acceptance path is spawn, navigate, obtain the key, open the door, complete the objective, reload, and verify progress. A second route must test that the door remains locked without the key.

An edit such as “make sprint consume stamina” should patch movement/stats/UI contracts and affected tests. It should not regenerate the level or character mesh. An art-style change invalidates relevant materials/reference/model recipes, while preserving game logic. A collision-size change invalidates traversal checks. Compute these effects from explicit dependencies and semantic input hashes, not graph-screen proximity or a whole-project timestamp.

**Engine and template choice**

My first runtime choice is **Babylon.js**, while keeping current Three.js asset/environment authoring. Babylon includes scene management, physics integration, a character controller, animation, audio, GUI, and WebGL/WebGPU support. Those integrations reduce the engine work GraphCore must establish before it can reliably generate a playable experience. This is an architectural recommendation, not a benchmark result. [Babylon specifications](https://www.babylonjs.com/specifications/).

Three.js remains viable, especially if reuse of the current renderer is the overriding priority. It gives excellent rendering building blocks but GraphCore would need to assemble more game infrastructure; the official game guide illustrates that additional infrastructure. Keep simulation behind an engine boundary but implement one engine first. An engine switch should be a validated build target change, not a promise that arbitrary generated code runs unchanged in both engines. [Three.js game guide](https://threejs.org/manual/en/game.html).

Use GLB and engine-neutral level/component manifests to cross the authoring/runtime boundary. The existing assembly compiler is coupled to Three.js geometry, so create an exporter or neutral mesh output adapter; do not pass Three.js objects into Babylon. Establish meters, up/forward axes, handedness, pivots and material conventions explicitly and validate imported assets against them. Prefer broadly supported glTF materials initially; negotiate engine-specific features through capabilities.

Start with a tested GraphCore template package for a compact 3D adventure, then add an arena-action template to prove that the architecture is not RPG-specific. A template must include runtime modules, exposed parameters, required/optional systems, input actions, camera setup, collision/navigation defaults, prefab slots, level rules, save version and acceptance tests. Separate environment kits and art styles from gameplay templates so a theme change does not change mechanics.

The current archetype catalog can drive creative suggestions, but only mark a subtype “playable generation supported” when it maps to one of these tested packages. Racing, city simulation, RTS, platforming, multiplayer and open-world streaming require different runtime contracts and should enter through dedicated template implementations.

Established engine examples are useful starting references, not finished GraphCore templates. PlayCanvas has maintained game examples and starter kits; adopting it would also be a reasonable strategic alternative if its editor/platform becomes desirable. Avoid introducing a second editing platform merely to obtain a starter game. [PlayCanvas tutorials](https://developer.playcanvas.com/tutorials/).

**Art and 3D production**

The proposed art direction sequence is sound with one addition: make it a versioned art specification shared by both asset generation and the runtime's materials/lighting. A matching prompt alone will not enforce style after rendering.

`Art direction → visual style target + structured style specification → per-asset recipe → isolated subject reference(s) → geometry/material production → game preparation → engine QA → asset revision`

Store shape language, proportions, palette, surface treatment, roughness/metalness policy, texture treatment, lighting assumptions, outline/toon/PBR policy and exclusions. Runtime light/exposure/material profiles should reference the same style version.

Existing wiki reference sheets are useful identity context, but their multi-panel layout and icon crop are not ideal direct mesh inputs. Generate dedicated references containing one unobstructed object. For characters use a clear full-body neutral pose suitable for the chosen rigging pipeline; derive multi-view references only where the provider supports them. Keep backgrounds simple and avoid strong painted shadows that become baked into the texture.

Use different recipes for different jobs:

| Asset type | Preferred initial recipe | Why |
| --- | --- | --- |
| Walkable buildings, rooms, stairs, platforms | Existing assembly DSL plus modular kits; Blender where useful | Exact dimensions, connectivity and controllable collision |
| Simple stylized props, mechanisms, furniture | Parameterized procedural mesh or Blender template | Stable pivots, separate moving parts, editable structure |
| Distinctive organic/static props | Isolated reference → image-to-3D → preparation | Fast visual variety without writing elaborate geometry scripts |
| Player and humanoid NPCs | Known-good rig/template first; generated mesh with a validated rigging path later | Animation and controller compatibility are more demanding than appearance |
| Creatures/nonhumanoids | Specific skeletal archetype or static/limited-motion fallback | Generic humanoid auto-rigging is not a universal solution |
| Whole environments | Layout and traversal plan → modules/props → dressing → lighting | Preserves gameplay space and independent editable objects |

Keep **Trellis 2 through Fal** as the first static-mesh baseline because an adapter already exists and the current endpoint returns GLB. Benchmark alternatives against actual GraphCore assets before choosing a quality winner. **Meshy** is worth evaluating for its explicit image-to-3D, rigging and animation APIs. Its rigging API documentation currently limits reliable programmatic rigging to clearly structured humanoids; do not infer API capabilities from broader web-app marketing. [Fal Trellis 2](https://fal.ai/models/fal-ai/trellis-2), [Meshy image-to-3D](https://docs.meshy.ai/en/api/image-to-3d), [Meshy rigging](https://docs.meshy.ai/en/api/rigging).

A provider comparison should include actual usable-result rate, silhouette/style fidelity, mesh defects, UV/material quality, download/decode size, required cleanup, animation deformation, latency and total accepted-asset cost. Do not optimize only for generation price. For an initial experiment, use a fixed sample of props, modular pieces and humanoids in several chosen art styles, and store all failure reports.

Direct scripted 3D-to-GLB is an excellent path for structured/stylized geometry. Prefer a constrained recipe DSL compiled by tested operations over unrestricted generated Python for ordinary assets. Preserve recipe, seed, tool version and source references. Exporting a GLB does not preserve arbitrary Blender Python, procedural shaders or game logic; bake or compile the relevant geometry/material results and keep behavior in the game manifest. [Blender glTF documentation](https://docs.blender.org/manual/en/3.6/addons/import_export/scene_gltf2.html).

**Blender's server role**

Use headless Blender workers for deterministic modeling recipes, imports, transform normalization, decimation/remeshing, UV/material baking, attachment sockets, rig preparation, collision proxies, export and QA renders. Batch/command-line automation is an established Blender interface. [Blender command-line documentation](https://docs.blender.org/manual/en/latest/advanced/command_line/index.html).

MCP is a control interface, not the 3D generation model or durable job system. The community Blender MCP uses an addon/socket plus an MCP server and exposes arbitrary Python execution. It can be useful for optional interactive authoring and repair, but I would not make a long-lived shared MCP Blender session the production worker. [Blender MCP repository](https://github.com/ahujasid/blender-mcp).

Expose the same bounded operations through a worker API and, optionally, an MCP facade. Each production job runs in an isolated process/environment with a pinned Blender/toolchain version, immutable inputs, explicit output paths, CPU/memory/disk/time limits, and no application credentials. A trusted supervisor stages inputs and registers outputs. Arbitrary generated scripts require a stronger disposable sandbox boundary and restricted network access. Headless does not mean GPU inference: hosted providers can generate meshes while CPU Blender workers handle many preparation operations; benchmark which baking/rendering workloads merit GPU workers.

Keep the existing dedicated-worker architectural direction. Add resource classes for mesh-provider work, Blender processing, code compilation and browser validation instead of running these workloads on request-serving Edge Functions or blocking the shared world-generation worker. Do not repurpose Director-specific tables for games.

**An asset is ready only after the game contract passes**

A production asset manifest should identify its immutable storage artifact, source entity/style/recipe revisions, dimensions, axes/pivot, material slots, texture sizes/formats, triangle count, draw-call contribution, bounds, collider, LODs where required, sockets, skeleton and animation mapping, provenance and QA reports.

Separate stages: submitted, provider complete, downloaded, prepared, validated, accepted, bound. Check file size and download deadlines, then glTF structural validity, target-engine loading, material appearance, collision fit and animation clips. Use Khronos validation for file correctness and glTF Transform for supported optimization/compression operations; neither establishes gameplay suitability on its own. [glTF Validator](https://github.com/KhronosGroup/glTF-Validator), [glTF Transform](https://gltf-transform.dev/).

Treat physics meshes separately from render meshes. For example, a dense generated rock can use a simple collision hull, and a character can use a capsule controller independently of its visual surface. Characters need skeleton compatibility, clip names and retarget mapping, locomotion/root-motion policy, and deformation tests. Moving objects need separate parts and pivots. Navigation must be tested against the controller's radius, step height and slope limits.

Generate a new asset revision into staging and promote it atomically after QA. The existing mesh-start path can reuse a mesh asset key and remove its prior storage object; replace that behavior for game production so regeneration cannot destroy the mesh used by the last good build.

**Builds, sandboxing and recovery**

Build from immutable source revisions, never a changing browser snapshot. Resolve pinned template/modules, compile data and scoped code, package exact asset revisions, run checks, then register the build. Store logical asset IDs and hashes, not expiring signed URLs, in build manifests.

Use a disposable build sandbox with pinned dependencies and resource/network limits. User-generated code must not run with Supabase service credentials or inside privileged production workers. Run playable previews on a separate origin with a narrow, schema-validated message protocol. Pass only build-scoped assets and necessary short-lived capabilities; isolate preview storage and keep publication an explicit action. The current app HTML-preview path is useful UI precedent, but does not establish the required game build isolation.

Acceptance gates should include strict contracts/type checks; module and cross-system tests; actual browser startup and engine asset loading; input, movement, collision and camera tests; objective completion and fail/restart paths; save/load; animation/material inspection; and frame-time, memory and loading-budget checks on specified target devices. Start with a single-player target; multiplayer introduces authoritative simulation, reconciliation and abuse constraints that deserve a separate design.

Associate diagnostics and runtime traces with system, graph node and source revision. A player falling through a stair should link to the level/collider job. A quest that cannot complete should link to its conditions/outcomes. Automated playthroughs complement human playtesting; they cannot prove that a game is enjoyable or that every state is reachable.

Use existing durable-job concepts: idempotent command admission, submit-once markers for paid providers, resumable checkpoints, bounded retries, fenced finalization and credit/cost accounting. Distinguish cancelling future work from cancelling an already submitted provider charge. Persist uncertain submissions for reconciliation. Reuse existing workflow history/progress views while giving each executable job one owner.

**Dedicated Game workspace**

Add a game-specific route/workspace selected when the project type is game. Keep shared World/Wiki and Feed accessible, and place game design/runtime controls in focused modules rather than extending the already large `WorldGraphPage.tsx`.

| Surface | Main task |
| --- | --- |
| Game Overview | Brief, core loop, template, target device, readiness and latest playable version |
| Systems | Composition graph; drill into one system's contract and behavior |
| Levels | Spatial hierarchy, 3D viewport, spawn/collision/navigation overlays |
| Assets | Prefabs, references, recipes, variants, rigs, animations and QA |
| Build & Play | Greybox/generated-assets mode, build history, playtest, diagnostic links and publish |

Generation progress belongs inside each relevant node and in the shared Feed; it does not require a large top-level page for every technical worker.

Expose a prominent **Build playable** action and an **Auto-build changes** preference. Keep **Greybox / Generated assets** as a preview fidelity choice. The engine can be advanced build configuration once multiple supported adapters exist. Every build runs against a frozen revision; UI changes mark affected nodes stale and queue a new build under the user's selected cost policy. Display status such as contract-ready, greybox-playable, assets-ready and playtest-passed instead of a single percentage that confuses node presence with playability.

**Implementation sequence and acceptance criteria**

| Stage | Deliverable | Exit condition |
| --- | --- | --- |
| 1. Contract and workspace foundation | Game domain schemas, migrations, game route, composition views, capability/template registry and source snapshots | A saved specification round-trips; invalid wiring fails before generation; old narrative prototypes still work |
| 2. First playable vertical slice | Babylon adapter, compact adventure template, movement/interaction/inventory/quest/save, one greybox level | Automated and manual traversal of the complete loop, including negative paths and save/load |
| 3. Production asset pipeline | Trellis adaptation, isolated references, staged asset revisions, Blender preparation, GLB/engine QA | One prop and one compatible animated character replace greybox assets without changing gameplay behavior |
| 4. Scoped generation and repair | System child workflows, bounded custom code, dependency invalidation, build sandbox and source-linked failures | A scoped prompt changes only the relevant modules/artifacts; failure preserves last good play |
| 5. Generalization | Second non-narrative template, performance/device profiles and reusable recipe library | Arena-action generation works without mandatory merchants/dialogue; template/asset versions are reproducible |

Suggested code boundaries: `src/domain/game/` for design, system, prefab, level and build schemas; `src/features/game-builder/` for the workspace; a separately packaged game runtime and template library; `supabase/functions/_shared/game-generation/` for narrow planning/orchestration packs; and dedicated game-build/asset-processing workers. These names are proposals, not existing files.

Any implementation touching shared generation execution needs the repository's paired Supabase/Fly deployment process and corresponding `Agents.md` updates. Add migrations incrementally; retain compatibility projections for existing game entities and narrative prototype data. Where both `customProperties.interactive` and `customProperties.game` exist, normalize them at one boundary instead of introducing another untyped source of truth.

Before broadening scope, demonstrate one generated game that can be played, saved, regenerated in parts, recovered after failure and rebuilt from its manifest. That is the acceptance target for the first prompt-to-game release.
