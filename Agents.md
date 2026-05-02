# GraphCore AI Agents

This document outlines the AI agents and autonomous systems that power GraphCore's content generation, game authoring, and UGC creation capabilities.

## Overview

GraphCore employs multiple specialized AI agents working in concert to transform natural language prompts into structured game content. The system uses a layered architecture where different agents handle specific aspects of content creation, from initial concept generation to detailed asset production.

## Maintenance Requirements

**CRITICAL**: This document must be kept current whenever changes are made to the AI agent infrastructure. Update requirements:

- **New Agents**: When adding new AI agents, document their purpose, capabilities, integration patterns, and supported models
- **Agent Modifications**: Update capabilities, models, and workflows when agents are enhanced or modified
- **Infrastructure Changes**: Document changes to Supabase Edge Functions, provider integrations, or orchestration patterns
- **Model Updates**: Track new model support, deprecated models, and performance characteristics
- **API Changes**: Update function signatures, request/response formats, and error handling
- **Configuration Updates**: Document new environment variables, secrets, or configuration options
- **Performance Changes**: Update latency expectations, throughput capabilities, and cost implications
- **Security Updates**: Document security enhancements, authentication changes, or access control modifications

**Verification Requirement**: Before marking any code change as complete, AI agents MUST verify:

1. **TypeScript Compilation**: Run `npx tsc --noEmit` and confirm zero errors
2. **Project Builds**: Run `npm run build` (or equivalent) and confirm successful build
3. **Dev Server Starts**: Run `npm run dev` and confirm the application starts without errors
4. **No Runtime Errors**: Check for console errors in the development server output

**Review Process**: All pull requests that modify AI agent code, Supabase functions, or agent orchestration logic must include corresponding updates to this document.

## Core AI Infrastructure

### Supabase Edge Functions
GraphCore runs AI workloads through protected Supabase Edge Functions that provide secure, authenticated access to external AI providers.

#### `ai-openai` Function
**Purpose**: General-purpose LLM interactions for content generation, reasoning, and structured data extraction.

**Capabilities**:
- OpenAI Responses API integration
- JSON schema validation and structured outputs
- Multi-modal content processing
- Reasoning effort control (low/medium/high)
- Tool calling and function execution
- Token usage tracking and optimization

**Models Supported**:
- GPT-4, GPT-4 Turbo
- GPT-3.5 Turbo
- Custom fine-tuned models
- Reasoning models (o1, o3-mini)

**Use Cases**:
- Graph structure generation
- Content archetype creation
- Narrative script writing
- UGC psychology optimization
- Patch operation planning

#### `ai-fal` Function
**Purpose**: Visual asset generation and image manipulation using Fal.ai's queue-based processing system.

**Capabilities**:
- Asynchronous job queuing and status polling
- Image generation from text prompts
- Image-to-image editing and manipulation
- Batch processing with priority controls
- Webhook notifications for job completion
- Multiple output formats (PNG, JPEG, WebP)

**Models Supported**:
- `fal-ai/nano-banana-2` (primary image generation)
- `fal-ai/nano-banana-2/edit` (image editing)
- Custom fine-tuned vision models
- Style transfer and enhancement models

**Use Cases**:
- Character concept art generation
- Environment visualization
- Item and asset previews
- Cinematic storyboard creation
- UGC thumbnail and banner creation
- Batch world-entity icon generation through `openai/gpt-image-2`, using compact row-major grid prompts built from each entity's `metadata.visualDescription` and the project art style. Prompts must stay visual-only and avoid GraphCore, project, schema, node-type, or internal ID wording.

## Specialized Content Agents

### Prompt-to-Patch Agent (`prompt-patch`)
**Purpose**: Orchestrates the conversion of natural language prompts into structured game content patches.

**Architecture**:
- Multi-pass generation strategy
- Content pass → Graph pass separation
- Validation and repair layers
- Patch proposal and review workflow

**Capabilities**:
- Natural language understanding for game design
- Structured patch generation (JSON operations)
- Content scaffolding and archetype reuse
- Graph relationship modeling
- Error correction and validation

**Workflow**:
1. **Content Pass**: Creates or reuses content definitions (items, characters, locations)
2. **Graph Pass**: Builds narrative graphs, choices, and relationships
3. **Validation**: Ensures patch integrity and compatibility
4. **Proposal**: Stores patch for user review and approval

### Visual Asset Generation Agent
**Purpose**: Creates visual assets for game content using AI image generation.

**Capabilities**:
- Concept art generation from text descriptions
- Character portrait creation
- Environment visualization
- Item and prop design
- Style consistency across assets

**Integration**:
- Automatic prompt enhancement for better results
- Reference image incorporation
- Aspect ratio optimization for different use cases
- Resolution scaling (1K, 2K, 4K outputs)

### Cinematic Script Agent
**Purpose**: Generates cinematic content and video scripts optimized for UGC engagement.

**Capabilities**:
- Script writing with psychological hooks
- Storyboard generation
- Scene composition and timing
- Character dialogue optimization
- Viral content structure implementation

**Special Features**:
- Attention psychology integration
- Conversion mechanism embedding
- Scroll-stopper implementation
- Platform-specific formatting

### World Building Agent
**Purpose**: Procedurally generates game worlds, environments, and interconnected content systems.

**Capabilities**:
- Environment assembly and structural fusion
- World entity relationship modeling
- Terrain and geography generation
- Cultural and societal system creation
- Quest and narrative thread weaving

**Advanced Features**:
- Multi-scale world construction (local → regional → global)
- Entity relationship inference
- World state consistency checking
- Dynamic content expansion
- World-prompt chat turns now return touched linked definition records alongside world-graph mutations so prompt-created characters, items, and environments appear immediately in their specialized workspaces without waiting on a later refresh cycle.
- World-prompt chat turns now also return the completed turn's prompt messages, prompt events, suggestions, and touched threads in the `start-world-prompt-turn` response so the frontend can merge the submitted user prompt and assistant result immediately without depending on realtime timing or a broad snapshot reload.
- World graph views now include a graph-native Wiki mode for readable world-bible presentation derived from entities, relationships, threads, timeline ordering, linked outputs, and lightweight wiki metadata.
- World graph views now distinguish authored story sequence from in-world event chronology. `sequence_unit` nodes represent chapters, episodes, missions, campaign moments, or UGC beats, while `event` nodes remain diegetic world happenings.

### World Prompt Agent (`world-prompt`)
**Purpose**: Runs GraphCore's live prompt-to-world graph chat for story-gardening style authoring over an ever-growing world graph.

**Capabilities**:
- Resolves each turn into explicit answer, preview, apply, or blocked modes before planning
- Applies actionable world-building changes immediately and answers in advisory mode when the prompt is non-mutating
- Maintains structured session memory for active focus, background focus, recent turns, and retrieved graph context
- Builds a balanced prompt context packet for every turn with recent raw chat, compact long-term session memory, a lightweight world atlas, typo-tolerant entity matching, rich graph/thread retrieval, and diagnostics for what context was used
- Persists actionable suggestions with machine-readable target metadata
- Treats selected prompt suggestions as apply-now continuations when they return safe actionable graph operations, and accepts explicit canon-repair wording as correction intent instead of looping on preview-only answers
- Preserves full advisory answers for chat readability and uses advisory-specific progress messages so answer-only turns do not appear to be assembling graph mutations
- Maintains a neighborhood-first world view layer with auto-managed semantic views such as protagonist neighborhoods, faction/place maps, lore clusters, timeline overviews, thread-focus views, recent-growth views, and a separate global overview
- Uses the active selected world view as a first-class retrieval anchor, and can switch the session-selected view to a newly relevant neighborhood when a prompt causes a real topic pivot
- Ranks next-step suggestions using both planner ideas and story-seed signals such as protagonist, villain, ruler, factions, lore, and missing inciting events
- Completes underspecified support entities on direct world-building turns by reusing a strong existing match when available or inventing a concrete named entity instead of emitting placeholder canon
- Reconciles entity summaries, contexts, and relationship notes additively while preserving prior refinements in append-only metadata history
- Syncs shared world-entity fields (`name`, `summary`, icon, tags) into linked definition records during prompt-driven world mutations
- Returns touched linked definition records from `start-world-prompt-turn` so prompt-created or prompt-updated characters, items, groups, concepts, events, and environments appear immediately in their specialized workspaces
- Returns updated prompt suggestion records from `start-world-prompt-turn`, including used and superseded records, so selected suggestions disappear immediately and do not loop back into the same suggestion set
- Records OpenAI Responses API token usage for each world-prompt LLM call into turn metadata, including input, output, total, cached input, reasoning tokens, provider response id, and request id. Incremental progress events also carry the latest cumulative turn token usage so onboarding and graph prompt meters update during each work item instead of waiting for a final turn refresh. The frontend session token meter uses this exact cached usage when available and falls back to an approximate visible-text estimate for older turns.
- Initial seed generation now keeps onboarding open until the skeleton generation turn completes. The inferred project context is supplied to the planner immediately but is not persisted with `onboardingCompletedAt` until the full initial skeleton turn finishes, and the frontend keeps an explicit active seed-session latch so partial first-wave entities cannot briefly open the graph view before the turn is done.
- Exposes linked world context and world-graph relationships inside the specialized definition workspaces through the `linkedDefinitionKey` bridge, including deep links back into the graph and across linked records
- Uses planner-authored thread lifecycle actions so world-prompt turns can create, deepen, reprioritize, resolve, park, or relink story threads without backend-invented fallback thread canon
- Uses planner-authored temporal event relationships so event chronology is stored as graph canon on `world_relationships.metadata.temporal` instead of chat order or prompt event sequence
- Maintains lightweight wiki presentation hints during prompt turns when canon naturally supports them, including loglines, synopsis text, role labels, short summaries, tone tags, and wiki section metadata
- Maintains project-wide wiki overview metadata with planner-authored `update_world_wiki_metadata` ops in the same prompt turn, storing generated content title, logline, synopsis, themes, tone tags, genre, core conflict, visual motifs, and freshness fingerprints in `project_drafts.metadata.worldWiki`
- Uses an incremental manifest-and-work-item executor for initial seed generation and broad/sequence-heavy prompt turns. The agent first plans small ordered work items, emits the full manifest outline for progress UI, then generates and applies each item through the normal graph mutation path so entity, sequence-unit, and relationship progress is visible before the full turn completes.
- Includes wiki gap diagnostics in prompt retrieval so empty or weak wiki sections can be filled through targeted prompt turns without extra background LLM passes on every normal authoring turn
- Uses authored sequence retrieval for Story project plot and chapter prompts. Sequence units carry synopsis, dramatic question, story function, outcome, consequences, character arc deltas, open/resolved loops, and script-expansion readiness metadata.
- Enforces Story sequence-unit completeness before writing chapter canon. Story planner JSON schema requires `sequence_unit` ops to carry strict `customProperties.sequence` metadata, including ordinal, synopsis, dramatic question, outcome, at least one cause/effect consequence, and at least one character arc delta; still-incomplete sequence ops are repaired or skipped with an explicit note instead of persisting thin chapter nodes.
- Runs a focused Story sequence completion pass when the main planner or durable streamed seed worker emits thin chapter ops, using current sequence context, relevant graph entities, relationships, and threads to fill required `customProperties.sequence` metadata before validation and apply.
- Stores canonical visual image prompts on world entities at `world_entities.metadata.visualDescription`. World-prompt entity and sequence-unit generation should provide concise visual-only descriptions for image-capable nodes; apply paths normalize and cap the value, preserve existing visual descriptions on unrelated updates, and write a compact summary/context/name fallback when the streamed model output omits the field so image generation still has durable visual guidance.
- First-run project onboarding is now input-first: the user starts with a single prompt, optional uploaded source file, or imported URL instead of preselecting project type, subtype, and art style. The first `start-world-prompt-turn` creates the persistent chat thread, passes `sourceContext` into the planner, and the planner returns `projectContextInference` so project type, subtype, brain profile, and art direction are inferred by the LLM before graph mutations are applied.
- First-run source ingestion supports text extraction for prompt, example, TXT/Markdown/JSON/DOCX/PDF files, and authenticated URL import via the `extract-source-url` Edge Function. Extracted source text is capped and passed as turn metadata/context rather than requiring a separate upload storage workflow.
- `start-world-prompt-turn` now returns touched world graph records directly alongside messages, events, suggestions, threads, and linked definitions, so the frontend can render the first generated graph immediately without waiting for realtime replication.
- Initial world creation now uses a dedicated two-stage seed flow in the persistent world-prompt thread. `start-world-seed-inference` creates an inference turn and pauses it with `awaiting_user_input` while returning inferred project type/subtype, confidence, visible rationale, art-style options, and the selected subtype skeleton profile. `continue-world-seed-generation` resumes from the art-style choice, returns immediately after creating the skeleton-generation turn and durable generation job, and leaves execution to the configured async worker. The completion marker is persisted only after the skeleton turn completes, while transient inferred context is used during generation.
- Initial seed generation uses subtype-specific skeleton profiles from `src/domain/worldSeedProfiles.ts`. Story profiles require project wiki metadata, full main cast, main locations, relevant groups/objects/concepts, and ordered `sequence_unit` story arcs with sequence relationships; Game, Brand, and UGC profiles require their own locations/factions/systems/campaign/UGC beat structures.
- Normal follow-up `world-prompt` turns remain compact modification turns. Initial skeleton generation is no longer allowed through `start-world-prompt-turn`; it must enter through `continue-world-seed-generation`, which creates the durable streamed generation job.

### App Prompt Agent (`app-prompt`)
**Purpose**: Extends the Prompt-to-World graph system into prompt-to-app product graph generation. App projects use the same persistent world graph tables, prompt sessions, streamed generation jobs, and view/retrieval infrastructure, but generate app/product canon instead of story, game, brand, or UGC world canon.

**Supported Project Type**:
- `projectType: "app"`
- `brainProfile: "app"`
- Initial subtypes:
  - `ai_utility_wrapper`
  - `mascot_daily_ritual`
  - `content_generator`

**App Art Styles**:
- `premium_mobile_utility`
- `playful_ritual_companion`
- `creator_tool_editorial`
- `soft_consumer_wellness`

**App Graph Ontology**:
- Product and strategy nodes: `app`, `persona`, `business_goal`, `feature`
- UX nodes: `user_flow`, `screen`, `section`, `component`, `animation_spec`
- Data and backend nodes: `data_model`, `action`, `api_endpoint`, `backend_function`, `external_service`
- Delivery nodes: `design_system`, `capability`, `screen_mockup`, `image_region`, `tower`, `code_file`
- App graph nodes store app-specific structured fields under `world_entities.custom_properties.app`; durable visual guidance remains `world_entities.metadata.visualDescription`

**Relationship Verbs**:
- `contains`
- `uses`
- `reads`
- `writes`
- `creates`
- `updates`
- `deletes`
- `calls`
- `invokes`
- `emits`
- `transitions_to`
- `requires_auth`
- `gated_by`
- `styled_by`
- `represented_by`
- `implemented_as`
- `tested_by`
- `depends_on`
- `owned_by_tower`
- `requires_capability`

**Generation Behavior**:
- First-run app onboarding uses `start-world-seed-inference` and `continue-world-seed-generation`, preserving the existing durable Fly worker stream path.
- App seed profiles require app identity, personas, business goals, features, user flows, screens, components, data models, actions, API endpoints, capabilities, design system, implementation towers, and code-file plan nodes.
- App UX flows must be represented as `user_flow` nodes, not story `sequence_unit` nodes.
- App entities are not linked into character, item, or environment projection records. Linked definition repair remains limited to narrative/media node types such as `actor`, `place`, and `object`.

**Codegen Direction**:
- Dedicated app modules define the Expo React Native target contract, base file plan, tower ownership, preview targets, and native capability constraints.
- Generated apps should target Expo, React Native primitives, Expo Router, TypeScript, a mock backend adapter for preview, and later managed/Supabase backend adapters.
- Web preview, GitHub export, EAS, and App Store publishing remain separate downstream app-generation stages after the App Graph is stable.

**Architecture**:
- Retrieval-first world authoring instead of generic chat memory
- Explicit turn contract before planning:
  - `resolvedMode`
  - `resolvedIntent`
  - `resolvedFocus`
- Conservative mutation policy with immediate apply-or-answer execution
- Structured continuity memory in `world_prompt_sessions.last_context.memoryState`
- Hybrid retrieval using graph anchors, graph-local expansion, Postgres FTS, and reranking

**Capabilities**:
- Distinguishes advisory turns from graph mutations
- Auto-pivots focus when prompts abruptly shift topic
- Narrows context separately for answer, mutation, and background packets
- Persists actionable suggestions with machine-readable target metadata
- Skips risky unresolved ops with an explicit assistant note instead of creating a pending approval queue
- Stores retrieval diagnostics for debugging relevance and coherence issues

**Integration**:
- `create-world-prompt-session`
- `start-world-seed-inference`
- `continue-world-seed-generation`
- `start-world-prompt-turn`
- `apply-world-prompt-preview`
- `approve-world-prompt-op`
- `reject-world-prompt-op`
- `refresh-world-prompt-suggestions`

**Operational Notes**:
- The graph remains the source of truth; chat history is continuity support only
- Apply paths refresh touched entities and threads from live DB state before mutating
- After manual graph edits and mutating prompt turns, the system recomputes and persists auto-managed `world_views` so the world surface stays neighborhood-first instead of collapsing into one global graph
- Linked definition records are a synced projection layer for shared identity fields; world-only narrative state such as `context`, threads, and relationships remains canonical on the world graph
- Character, content, and environment workspaces render linked world context and relationships directly from the graph instead of duplicating relationship storage into `project_definitions`
- Thread search now incorporates linked entity names and aliases for better recall
- World Prompt canon creation is LLM-authored only; deterministic logic is limited to routing, retrieval, and safety checks
- Event timeline canon is graph-native: `event` nodes carry optional display hints, event-to-event temporal relationships carry ordering metadata, and deterministic timeline derivation/validation can skip invalid or cyclic temporal links without inventing replacement chronology
- Authored sequence canon is graph-native but separate from event chronology: `sequence_unit` nodes carry chapter/progression metadata, sequence-to-sequence relationships use verbs like `precedes`, `causes`, `complicates`, and `pays_off`, and they must not use event temporal relationship metadata.
- Story `sequence_unit` records are script-facing canon and must include `customProperties.sequence.ordinal`, `synopsis`, `dramaticQuestion`, `outcome`, at least one cause/effect consequence, and at least one character arc delta. Complete sequence units are marked `scriptExpansionReady`; incomplete ones should be repaired by the planner or streamed-seed repair pass rather than accepted as authored progression.
- Story sequence completion remains LLM-authored: deterministic logic may detect missing fields, provide recommended next ordinal, route context, and validate the result, but it does not invent synopsis, outcome, consequence, or character-arc canon itself.
- Wiki presentation is graph-native and derived at render/retrieval time. The graph remains canonical; wiki metadata only improves display, and gap-fill buttons call the existing `start-world-prompt-turn` flow with targeted context.
- Project-wide wiki presentation is metadata-only and low-cost: the planner may update it when retrieval marks wiki context as targeted or opportunistic, while backend validation caps and merges fields without deterministically writing replacement title/synopsis canon. Wiki display uses the generated metadata title as the content title; the GraphCore project name remains workspace/user-facing metadata and is not used as the world title fallback.
- Wiki gap tooling includes batch entity icon generation. The Wiki can start a protected `start-world-entity-icon-batch` job that selects up to 16 active world entities missing both `thumbnailAssetKey` and linked definition `iconAssetKey`, prompts Fal's `openai/gpt-image-2` endpoint for a row-major icon grid in the project art style, and lets the Fly worker crop the grid into per-entity Supabase Storage assets. The full grid is kept as a source asset, while each entity and linked definition gets its own cropped icon asset key so Wiki cards and Library entries use the normal project asset pipeline.
- Character-sheet imagery is separate from card icons. Durable high-resolution character sheets should use `metadata.visual.characterSheetAssetKey` on world entities, with `metadata.visual.characterSheetUrl` only as an external fallback; icon thumbnails must not be overwritten by character-sheet assets.
- World wiki metadata validation tolerates common streamed LLM shape drift for presentation-only fields: `genre` arrays are normalized into a compact string, and comma-separated theme/tone/motif strings are normalized into arrays before graph-op schema validation.
- Broad incremental world-prompt turns now use a token-efficient manifest-plus-ledger execution model. The manifest pass is the only broad source/retrieval read; each work item receives a compact build brief, canon ledger, direct dependencies, adjacent sequence stubs, and targeted excerpts instead of the full source text, full retrieval packet, full manifest, or growing graph prose.
- Incremental work-item responses use a narrow result contract: concise `assistantSummary`, focused `wave1Ops`, and final-pass thread/suggestion metadata only. The existing `PromptToWorldOp` apply path remains canonical for validation, persistence, linked definition repair, events, and graph merging.
- World-prompt token usage metadata now records per-call budget diagnostics such as source, retrieval, manifest, graph-state, and ledger character counts. When cumulative usage grows too high or a work-item prompt exceeds budget, work items degrade to ledger-only context instead of repeatedly resending verbose canon.
- Thread canon is also LLM-authored during world-prompt turns; the backend validates and persists planner thread actions but does not synthesize fallback threads like `Emerging Story Thread`
- Hosted planner output is retried once if it still contains placeholder entities or unresolved descriptor-only relationship endpoints, and mutating turns fail or degrade to non-mutating behavior instead of writing deterministic fallback canon
- The live chat no longer uses preview/apply-first-wave or manual approval as the default UX; risky unresolved ops are skipped with an immediate assistant note instead of creating a pending review queue
- Suggestion records can now carry view-targeting metadata (`suggestedViewKey`, `targetRootEntityKey`, `preferredViewKind`) so clicking a suggestion can continue from a more appropriate neighborhood or thread view
- Selecting a prompt suggestion is treated as an instruction to execute that suggestion as a compact world-building step by default, unless the suggestion is explicitly plan-only
- Count-explicit seed prompts now produce planner-side entity requirements from the user text, such as requested character, faction, place, and artifact counts. Direct-build scope caps expand only for those count-explicit world-seeding turns so a prompt like “three major characters, two rival factions, one artifact” can land as one coherent first wave instead of silently staging required entities into follow-up work.
- Incremental world-prompt execution is selected for broad regular seed-world requests, large source contexts, sequence-heavy prompts, and high explicit entity counts. Small follow-up edits keep the compact single-plan path for lower latency. First-run initial skeleton generation is excluded from this executor and uses the durable streamed job path instead.
- Incremental work emits `work_item_started`, `work_item_completed`, and `work_item_failed` events, plus per-op `planner_status` and `op_applied` events. Non-critical work items may be skipped after one repair attempt while already-applied graph records remain visible.
- Initial seed skeleton generation now uses a durable streamed generation job. `continue-world-seed-generation` completes the art-style inference turn, creates a separate generation turn, inserts a `world_prompt_generation_jobs` row, and returns immediately. The UI tracks `world_prompt_events` plus `world_prompt_generation_jobs` and polls `get-world-generation-status` as a recovery path.
- Streamed initial seed generation emits newline-delimited graph-op envelopes from bounded Responses API calls. Each completed op is validated through the canonical `PromptToWorldOp` schema, applied through the existing `applyPromptOp` persistence path, guarded by turn/op idempotency checks, and surfaced as normal prompt events so onboarding progress and graph merging do not depend on the original HTTP response staying open. Story `sequence_unit` envelopes receive a focused structured completion/repair pass before apply; if required synopsis, dramatic question, outcome, consequence, or character-arc fields are still missing, the op is skipped instead of persisting a thin beat.
- Low-level malformed streamed fragments are logged to worker/Edge diagnostics rather than written as user-facing assistant notes, so onboarding progress remains a clean creation log. Contract-valid graph ops, applied ops, deferred relationships, and terminal failures still emit normal prompt events.
- Onboarding generation progress keeps a single transient active "Generating" row pinned at the bottom while the durable generation job is non-terminal. Terminal detection is scoped to the actual generation turn from `world_prompt_generation_job_steps`, so the completed inference/art-style turn must not suppress the active spinner during skeleton generation.
- Streamed initial seed generation treats relationships as a dependent phase. The prompt contract asks the model to emit wiki metadata, entity nodes, sequence units, then relationships, and the backend also defers premature relationship ops until both endpoint entity keys exist. Deferred relationships are flushed after entity creation and at stream completion; any still-missing endpoints are skipped with an explicit note instead of failing the whole job.
- Streamed initial seed jobs record periodic OpenAI stream heartbeat metadata while the response is active, and the stream wrapper now treats a closed stream without a terminal Responses event as an explicit error. The generation stream timeout is kept below the observed Edge background lifetime so timeout failures can be caught and persisted before the platform can terminate the worker.
- `get-world-generation-status` performs stale heartbeat recovery for durable generation jobs. If a queued/running job stops heartbeating, polling marks it failed when no graph records landed or `completed_with_errors` when partial graph records landed, writes the terminal turn event, and lets onboarding exit the indefinite loading state.
- The legacy Supabase Queues-backed phased executor is kept as a fallback runtime. In that mode, `continue-world-seed-generation` creates the parent job and ordered `world_prompt_generation_job_steps`, enqueues the first `world_prompt_generation` queue message, and returns immediately. `process-world-generation-jobs` claims one queue message, runs one bounded streamed phase, applies completed graph ops, updates step/job heartbeat and token/count metadata, then enqueues the next phase.
- The fallback Supabase initial seed phases are `world_bible`, `core_entities`, `sequence_units`, `relationships`, and `finalize`. The default Fly runtime uses a single `full_stream` compatibility step with targeted continuation passes only when coverage is missing. Continuity is explicit in job metadata through the compact working snapshot/canon ledger; Responses API calls still use `store: false` and do not rely on hidden provider-side chat state or `previous_response_id`.
- `cancel-world-generation-job` marks the durable generation job and associated turn cancelled. The running worker checks job/turn state before applying each streamed op, so already-applied records remain visible while later records stop.
- During direct world-building, malformed `upsert_entity` ops that point at an existing entity key while carrying a different new entity name are treated as new additive entities when there is no clear same-name match. This avoids skipping simple seed-world creations as semantic rewrites while preserving approval pressure for explicit correction/replacement prompts.
- Temporary direct-apply behavior: ops annotated only as `Semantic rewrite of existing entity` are allowed to run instead of being skipped, so frustrating false positives do not drop entity creation/refinement turns. Other risky cases such as ambiguous matches, missing targets, canon-locked touches, and collapsed relationship endpoints remain skipped.
- World-prompt application now treats linked projections as an invariant for core authoring entity types: `actor` nodes must have `character` records, `place` nodes must have `environment` records, and `object` nodes must have `item` records. Prompt-created and prompt-touched entities are repaired after mutation if a linked definition is missing, and shared identity fields continue syncing through `linkedDefinitionKey`.
- World-prompt generated entities store canonical image guidance at `world_entities.metadata.visualDescription`. Linked definition projections now copy that value into render prompt components (`render_3d_binding.conceptPrompt` / `generationPrompt` or `environment_render_binding.generationPrompt`) so Library concept-image generation, Wiki cards, and graph entities read the same durable visual brief instead of diverging by browser/session.
- Initial onboarding world generation automatically queues a Fal/OpenAI GPT Image 2 icon-grid job when the first `sequence_unit` begins, using the first 16 already-created image-capable world entities and their `metadata.visualDescription` prompts. The Fly worker runs separate generation and icon-job loops so the icon batch can process while the text world seed continues streaming.
- Resetting a project world now also removes generated world-icon image assets for the reset draft from Supabase Storage and deletes their `project_assets` rows. This cleanup is scoped to generated world-icon storage paths for the draft so reset does not erase unrelated Library uploads, cinematic outputs, or mesh assets.
- Wiki icon batch generation targets visual world entities by default: actors, places, groups/factions, objects/artifacts, concepts/lore, and story `sequence_unit` beats. Event chronology nodes are not counted in the default Wiki gaps action. Generated sequence-unit images are stored as Library image assets, linked through the world entity `thumbnailAssetKey`, and rendered in the Wiki story-flow timeline.
- Initial world seed generation now runs through a Fly.io long-running worker by default instead of Supabase Edge/PGMQ phase execution. `continue-world-seed-generation` still creates the persistent session, generation turn, parent job, and realtime-visible compatibility step, but the `workers/world-generation` process claims queued Fly jobs from Supabase and streams the full OpenAI graph-op response directly into `world_prompt_events` and graph tables.
- Fly worker jobs use `world_prompt_generation_jobs.metadata.runtime = "fly"` and a single `full_stream` job step. The worker uses service-role-only claim/heartbeat/terminal RPCs, stable worker metadata, heartbeat-based stale retry, and the existing graph-op apply path so realtime, polling, cancellation, token usage, linked definitions, and graph landing remain compatible with the frontend.
- The Fly worker also claims `world_entity_icon_generation_jobs` for Wiki icon enrichment. These jobs are visual asset jobs, not world-prompt canon turns: they submit Fal queue requests to `openai/gpt-image-2`, poll the Fal request for completion, upload the generated grid and cropped icons to `project-assets`, update `world_entities.thumbnail_asset_key`, mirror the asset to linked `project_definitions.icon_asset_key`, and report job status through service-role-only claim/heartbeat/complete/fail RPCs.
- Generated world-icon Storage uploads use long-lived cache headers, while the frontend treats signed Supabase Storage URLs as session artifacts. Signed URLs are cached locally with expiry and generated image blobs are cached in browser Cache Storage by project/asset/storage path, so Wiki and Library can reuse icons across refreshes without persisting expiring signed URLs to the database.
- Initial seed stream retries use stable Story sequence-unit op IDs derived from sequence ordinal, such as `episode_01`, so retried streams update/skip already-applied beats instead of creating duplicate Episode 2/Episode 3 nodes with different generated titles.
- Initial seed streams prefer compact `wiki`, `entity`, `sequence_unit`, and `relationship` JSON records in addition to full `PromptToWorldOp` envelopes. The backend converts these compact records into canonical graph ops before validation and apply, reducing malformed nested JSON failures in long Story sequence-unit output while preserving the existing apply path, linked definition repair, turn lens, and graph merging.
- Streamed record handling uses a three-layer recovery path before skipping malformed output: conservative JSON cleanup for common syntax drift, schema normalization for near-valid aliases such as `sourceEntityKey`/`source` and string-list coercions, then a bounded small LLM repair call for at most five promising malformed records per job. Repair diagnostics, malformed/repaired/unrepaired counts, and coverage-continuation counts are stored in generation job/step metadata and worker logs instead of noisy user-facing assistant notes.
- Story initial seed streams enforce minimum skeleton coverage before terminal completion. If the first Fly stream lands core entities but misses required ordered sequence units or relationships, the same durable job runs targeted continuation passes for the missing sequence/relationship coverage before it can mark the turn complete.
- The legacy Supabase `process-world-generation-jobs` Edge/PGMQ phased executor remains available as fallback by setting `WORLD_PROMPT_GENERATION_RUNTIME=supabase`, but long first-world generation should use Fly to avoid Edge runtime and queue visibility timeouts.
- World-prompt relationship application now treats identical `source + verb + target` graph relationships as one semantic edge. Repeated planner or streamed relationship ops update/merge the existing edge instead of creating duplicate sequence links with suffixed keys, while entity records remain protected by the database-level `(draft_id, key)` uniqueness constraint.

### UGC Psychology Agent
**Purpose**: Applies research-backed psychological principles to optimize content for viral spread and user engagement.

**Capabilities**:
- Attention capture mechanisms
- Identity protection framing
- Knowledge gap creation
- Loss aversion messaging
- Vicarious skepticism handling

**Content Optimization**:
- Hook strength analysis
- Conversion funnel design
- Platform-specific adaptation
- A/B testing recommendations

## Agent Orchestration

### Service Layer Integration
AI agents are orchestrated through GraphCore's application services:

```typescript
// Example: Prompt generation service
export const promptGenerationService = {
  generate: (request: PromptPatchRequest) =>
    graphcoreWorkspaceAdapter.proposePatch(request),
}

// Example: Visual asset service
export const visualAssetGenerationService = {
  generateConceptImage: (request) =>
    visualAssetAdapter.generateConceptImage(request),
}
```

### Multi-Agent Coordination
Complex content generation involves coordinated agent execution:

1. **Planning Phase**: UGC Psychology Agent analyzes target audience and platform
2. **Content Phase**: Prompt-to-Patch Agent creates structured content
3. **Visual Phase**: Visual Asset Agent generates accompanying imagery
4. **Cinematic Phase**: Script Agent creates video content
5. **Optimization Phase**: Psychology Agent refines for maximum engagement

### Error Handling and Recovery
- Automatic retry logic for transient failures
- Fallback strategies for unavailable providers
- Partial result recovery and continuation
- User-friendly error messaging

## Agent Capabilities Matrix

| Agent | Text Generation | Image Generation | Structured Data | UGC Optimization | Real-time Processing |
|-------|----------------|------------------|-----------------|------------------|---------------------|
| OpenAI Agent | ✅ | ❌ | ✅ | ✅ | ✅ |
| Fal.ai Agent | ❌ | ✅ | ❌ | ❌ | ❌ (async) |
| Prompt-to-Patch | ✅ | ❌ | ✅ | ✅ | ❌ |
| Visual Assets | ❌ | ✅ | ❌ | ❌ | ❌ |
| Cinematics | ✅ | ✅ | ✅ | ✅ | ❌ |
| World Building | ✅ | ✅ | ✅ | ❌ | ❌ |
| UGC Psychology | ✅ | ❌ | ✅ | ✅ | ✅ |

## Configuration and Secrets

### Environment Setup
AI agents require provider credentials stored as Supabase secrets:

```bash
# OpenAI configuration
npx supabase secrets set OPENAI_API_KEY=your_key
npx supabase secrets set OPENAI_BASE_URL=https://api.openai.com/v1

# Fal.ai configuration
npx supabase secrets set FAL_KEY=your_fal_key

# Fly.io world generation worker configuration
fly secrets set SUPABASE_URL=your_supabase_url
fly secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
fly secrets set OPENAI_API_KEY=your_openai_key
fly secrets set FAL_KEY=your_fal_key
fly secrets set GRAPHCORE_WORKER_SECRET=your_worker_secret
```

### Model Selection
Agents support dynamic model selection based on task requirements:

- **Creative Tasks**: GPT-4 with high temperature for ideation
- **Structured Tasks**: GPT-4 with JSON schema for reliable outputs
- **Fast Tasks**: GPT-3.5 Turbo for quick iterations
- **Reasoning Tasks**: o1 models for complex planning

## Monitoring and Observability

### Usage Tracking
- Token consumption monitoring
- Request latency tracking
- Success/failure rate analysis
- Cost optimization insights

### Quality Metrics
- Content coherence scoring
- User engagement correlation
- Conversion rate tracking
- A/B test performance analysis

## Future Agent Developments

### Planned Enhancements
- **Multi-modal Agents**: Combined text + image + video generation
- **Real-time Collaboration**: Multi-user content co-creation
- **Personalization Agents**: User preference learning and adaptation
- **Quality Assurance Agents**: Automated content validation and improvement
- **Market Analysis Agents**: Competitive content analysis and optimization

### Research Areas
- Advanced prompt engineering techniques
- Cross-platform content adaptation
- Cultural context awareness
- Accessibility optimization
- Performance prediction models

## Agent Development Guidelines

### Adding New Agents
1. Define clear scope and capabilities
2. Implement proper error handling and recovery
3. Add comprehensive logging and monitoring
4. Include usage tracking and cost analysis
5. Provide fallback strategies for failures
6. Document integration patterns and APIs

### Testing Strategies
- Unit tests for agent logic
- Integration tests for provider APIs
- End-to-end tests for complete workflows
- Performance benchmarks and load testing
- Failure scenario simulation and recovery testing

## Troubleshooting

### Common Issues
- **Rate Limiting**: Implement exponential backoff and request queuing
- **Token Limits**: Chunk large requests and optimize prompt length
- **API Errors**: Provide user-friendly error messages and retry logic
- **Cost Control**: Monitor usage and implement budget limits

### Debug Tools
- Request/response logging in development
- Agent performance dashboards
- Error tracking and alerting
- Usage analytics and reporting

---

*This document is maintained alongside the GraphCore codebase. For implementation details, see the source code in `src/domain/`, `src/data/`, and `supabase/functions/`.*
