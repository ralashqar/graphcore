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

#### Shared AI Provider Gateway
**Purpose**: Centralizes server-side AI provider execution, normalized usage accounting, cost estimates, and ledger writes for Supabase Edge Functions and Fly workers.

**Capabilities**:
- Shared wrapper at `supabase/functions/_shared/ai-provider-gateway.ts` for OpenAI Responses, streaming/background Responses, OpenAI Images compatibility, and Fal queue-style media requests
- Normalized usage and pricing types in `src/domain/aiUsage.ts`
- Canonical `ai_usage_events` ledger with idempotency keys, provider request/response IDs, workflow/run/step links, world-prompt/job links, visual-job links, usage JSON, pricing snapshots, estimated/actual USD, and charged credits
- `ai_pricing_catalog` seed data for current OpenAI text rates and Fal image/video fallback rates, with room for runtime Fal pricing refreshes when `FAL_KEY` is available
- Existing public endpoints remain compatibility wrappers; provider-specific logic should move through the gateway rather than being reimplemented per endpoint

#### `ai-openai` Function
**Purpose**: General-purpose LLM interactions for content generation, reasoning, and structured data extraction.

**Capabilities**:
- OpenAI Responses API integration
- JSON schema validation and structured outputs
- Multi-modal content processing
- Reasoning effort control (low/medium/high)
- Tool calling and function execution
- Token usage tracking and optimization
- Ledger-backed usage/cost metadata via the shared AI provider gateway instead of endpoint-local price tables

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
- Durable visual generation through `visual_generation_jobs`, with Fly worker handlers for brand atlases and batch world-entity icon grids using Fal `openai/gpt-image-2`. Icon prompts use compact row-major grid prompts built from each entity's `metadata.visualDescription` and the project art style. Prompts must stay visual-only and avoid GraphCore, project, schema, node-type, or internal ID wording.

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
- Durable queued visual jobs for `world_entity_icon_grid`, `brand_atlas`, `screen_mockup`, `character_sheet`, `wiki_visual`, and `app_screen_mockup`
- Durable queued `entity_reference_sheet` jobs generate GPT Image 2 low-quality WebP production reference sheets for world entities. The legacy `character_sheet` job kind is a compatibility alias for the same worker path.
- Entity reference sheets use neutral visual identity metadata (`metadata.visual`, `metadata.visualDescription`, traits, trait maps), project art style, project tone, and summary/context. They must be generated from text only and must not pass the previous thumbnail/reference sheet as a GPT Image 2 edit/reference input. They are stored as `project_assets`, linked through `world_entities.metadata.referenceSheetAssetKey`, and become the entity's main visual binding by updating `world_entities.thumbnail_asset_key`, linked `project_definitions.icon_asset_key`, and the linked definition preview-image component binding.
- Sheet contracts are entity-type specific: characters use simplified 4:3 turnaround sheets optimized for GPT Image 2 low quality, with four large neutral standing views, a small silhouette strip, a few head/identity detail panels, stable feature callouts, color swatches, and one cinematic profile/portrait close-up. Character sheets must avoid expression grids, micro-expressions, hand gesture studies, complex fingers, combat poses, and tiny crowded panels. Locations use 2048×2048 environment sheets with multiple views, key feature highlights, scale/material/lighting callouts, and map or spatial-zone view when useful; groups use faction identity sheets with emblem, uniforms, representative silhouettes, roles, territory cues, palette, and cinematic symbol/member close-up; items use prop sheets with hero render, rotation views, scale, material/function callouts, in-use view, and cinematic close-up.
- Service-role worker claim, heartbeat, complete, fail, and cancel flows through `visual_generation_jobs`
- Standardized generated asset metadata including `generatedBy`, `visualJobId`, `jobKind`, `provider`, `model`, `prompt`, `storageBucket`, `storagePath`, and `generation.state`

**Integration**:
- Public Edge Functions such as `start-visual-generation-job`, `get-visual-generation-status`, and `cancel-visual-generation-job`
- Compatibility wrappers such as `start-world-entity-icon-batch` and `start-world-brand-atlas-image` enqueue generic visual jobs and return immediately
- Provider calls, downloads, crops, uploads, and graph/wiki target updates run on the Fly worker, not inside browser-held Edge requests
- Entity icon jobs crop a generated grid into per-entity assets and update `world_entities.thumbnail_asset_key` plus linked definition icon keys
- GPT Image 2 entity icon grid requests use low quality by default. Grids up to 2x2 request Fal `image_size = "square_hd"`; 3x3 and larger grids request custom `{ width: 2048, height: 2048 }` before worker-side cropping to per-entity WebP icons.
- Brand atlas jobs update `project_drafts.metadata.worldWiki.brandAtlasAssetKey` after the generated atlas asset is uploaded

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

### Output Workflow Agent (`output-workflow`)
**Purpose**: Generates durable artifacts from the canonical world graph without mixing output execution state into `world_entities`.

**Architecture**:
- Dedicated workflow tables: `output_workflows`, `output_workflow_nodes`, `output_workflow_edges`, `output_workflow_runs`, `output_workflow_run_steps`, and `output_artifacts`
- Product-facing prompt requests are tracked separately in `output_requests`. A request stores the original user prompt, source surface, lightweight intent classification, selected world scope, chosen output kind, planner notes, linked workflow/run IDs, status, and errors. Workflows remain execution internals; requests are the Output Studio inbox rows.
- Binary/media files remain in `project_assets`; workflow provenance is stored in asset/artifact metadata with `workflowId`, `runId`, `nodeId`, source world keys, provider/model details, and `metadata.generatedBy`
- Output deletion is backend-destructive for completed/cancelled/failed requests: `delete-output-request` verifies draft access, then uses the shared output cleanup helper to remove the request, owned workflow graph, run rows, output artifacts, generated output-owned `project_assets`, and matching Supabase Storage objects. Active output runs must be cancelled before individual deletion. `ai_usage_events` remain as audit/cost history.
- Shared TypeScript node registry in `src/domain/outputWorkflow.ts` validates approved node types for frontend previews, Edge Functions, and workers
  - Shared Output Skill registry in `src/domain/outputSkills.ts` provides curated, versioned guidance bundles for writing, cinematic, UGC, visual, provider hygiene, and anti-AI-telltale output behavior. Fiction prose skills explicitly favor restrained, human-scaled prose with sparse figurative language, minimal exact adjectives, and no purple-prose or stock AI noir/dystopian phrasing.
  - Durable worker execution claims runs through service-role RPCs, heartbeats progress, executes the DAG with dependency-aware ready-node scheduling, records per-node step output hashes, and completes/fails/cancels the run
  - Workflow execution metadata supports dependency levels, `resourceClass`, `groupKey`, `maxConcurrency`, `continueOnError`, `skillKeys`, `guidanceHash`, and `guidanceMode`; unchanged nodes complete with `metadata.skipped = true`
  - Retry behavior is hash-based: rerunning a failed workflow against the same persisted workflow/input skips completed nodes whose `inputHash` still matches, retries failed nodes, and unblocks downstream nodes. Longform prose nodes persist provider request IDs so a stale worker can resume provider polling instead of creating duplicate OpenAI requests.
  - Targeted node reruns are supported through run metadata `runScope`, `targetNodeKeys`, `forceNodeKeys`, `reuseExistingUpstreamOutputs`, and `allowStaleUpstreamOutputs`. Supported scopes are `node_only`, `upstream_to_node`, `node_and_downstream`, and `artifact_rebake`. The worker can hydrate required upstream inputs from cached `output_workflow_nodes.outputs`, fail fast when a required cached parent is missing, and record reused/stale upstream provenance on run-step metadata. The Outputs graph inspector exposes these scopes as local test actions so a single script, prompt, image page, or PDF/artifact can be tested without rerunning unrelated expensive nodes.
  - Long-running text nodes use OpenAI Responses background mode from the Fly worker. Steps store `provider_request_id`, `metadata.providerMode = "background"`, `metadata.providerStatus`, and `metadata.lastProviderPollAt`; cancellation attempts to cancel the OpenAI response when a provider handle exists.
  - Provider-backed workflow nodes record normalized `metadata.aiUsage` and `metadata.aiUsageLine` on completed run steps. Output plans include `usageEstimate` before execution, and prompt-first output requests persist that estimate onto request, workflow, run, and queued step metadata.
  - `video_generation` nodes now have a worker-side Fal queue executor path for Seedance-style reference-to-video jobs. Video outputs are uploaded to `project-assets`, registered as `output_artifacts.kind = "video"`, and accounted through the same usage summary path as text and image nodes.

**Supported Node Types**:
- `world_context_query`: resolves entities, relationships, sequence units, threads, wiki metadata, and visual references from the world graph
- `skill_context_query`: resolves selected or auto-tagged Output Skills into a deterministic `guidance_bundle`
- `text_llm`: generates text or structured intermediate outputs from prompt plus world context
- `image_generation`: runs worker-side Fal `openai/gpt-image-2` image nodes, stores generated image assets in `project_assets`, registers image artifacts, and records provider request/provenance metadata on workflow steps
- `video_generation`: runs worker-side Fal Seedance 2 reference-to-video nodes. Cinematic defaults are storyboard-grid-first with `@Image1` as the generated beat-sheet timing/continuity board, then atlas/entity refs; explicit `cinematicReferenceMode = "keyframes"` keeps the legacy opening/midpoint/ending keyframe route. Video nodes enforce 4-15 second duration, 480p/720p/1080p resolution controls, optional native audio, usage estimates, and generated video assets/artifacts.
- `document_render`: renders manuscript Markdown/HTML into document artifacts
- `utility_transform`: splits or transforms sequence units into chapters, shots, panels, prompts, or asset packs
- `output_artifact`: registers final artifacts and links them to `project_assets`

**V1 Presets**:
- Prompt-first Output Studio requests can route to approved templates only. V1 output kinds include `concept_art_image`, `poster_image`, `story_bible_from_world`, `world_reference_document`, `lore_guide`, `character_dossier_pack`, `short_story`, `narrative_chapter_or_ebook`, `ebook_from_world`, and `comic_issue_from_sequence`. The prompt planner returns a structured approved-template plan with intent, output kind, confidence, selected world scope, document mode, selected entities/sequences, planned sections, visual reference policy, and confirmation state; it must ask for confirmation on ambiguous/low-confidence prompts instead of silently falling back to an ebook. Prompt-first image requests run an LLM world-scope resolver before the workflow is persisted, using the user prompt plus a compact world-entity/sequence catalog to choose only the explicitly requested or visually required entities. Deterministic name matching is a safety fallback only; image workflows must not broaden empty selections to first-N world entities, chapter casts, or unrelated relationship neighbors. Concept/poster requests use a compact `world_context -> skill_context -> visual_prompt + image_references -> image_generation` workflow backed by the existing Fal GPT Image 2 image node. When a prompt binds world entities such as characters, places, or items, the workflow must build an `asset_pack` from those entities and pass available thumbnail/image project assets into the image node `references` input so Fal uses the edit/reference route instead of relying on text-only descriptions.
- `story_bible_from_world`: world context query -> reference skills -> section plan -> parallel approved reference-section nodes -> reference assembly -> document render -> output artifact.
  - Story bible/reference outputs are canon documentation, not fiction prose. Approved sections include core premise, world overview, main characters, locations, factions/groups, objects/concepts, timeline/chronology, sequence/story arc overview, lore constraints, visual style/tone, and open questions/continuity notes.
  - Document-mode skills include `story_bible_structure`, `canon_reference_voice`, `continuity_documentation`, and `world_lore_clarity`. These skills require concise current-canon documentation and require missing areas to be labeled as not yet defined in canon rather than invented.
  - Reference PDFs use worker-side document rendering with companion Markdown and HTML artifacts, while preserving the same workflow/run/artifact provenance contract as ebooks. Prompt-first reference requests default to `documentMode = "designed_reference"` with `pageSize = "a4"` and `imagePolicy = "inline_entity_images"` unless the user asks for text-only/plain reference output. Designed reference rendering is generalized for story bibles, brand bibles, lore guides, character dossiers, and similar world-derived documents: section nodes generate canon-safe Markdown, deterministic assembly preserves section order, and the Fly renderer embeds available source-entity image assets as sanitized A4 visual reference grids/cards. The `html` artifact is a safe renderer-generated page with embedded data-url images for inspection or web-style delivery; it is not arbitrary untrusted LLM HTML. Section prompts must curate and synthesize high-signal canon for the requested section instead of dumping raw world context or repeating the same synopsis. The renderer should place each visual reference once by section relevance, with compact labels by default rather than duplicated image captions. The LLM may write copy that sits beside visual references, but renderer-owned HTML/CSS controls layout and no arbitrary LLM HTML/CSS is trusted as executable document source.
- `ebook_from_world`: world context query -> outline/TOC -> chapter plan -> one full prose node per selected sequence unit/chapter, plus a parallel cover prompt -> GPT Image 2 cover image branch -> global chapter assembly -> consistency editor -> front/back matter -> document render -> output artifact
  - Inputs are project wiki metadata, selected sequence units, cast/places/items/concepts, style/tone, target format, prompt, and resolved Output Skills for prose voice, scene structure, continuity, and provider hygiene
  - Fiction ebook generation uses `worldWiki.narrationPov` as the project-level narration contract and `sequence.povCharacterKey` / `povCharacterName` / `povNotes` as the chapter focal-character contract. Chapter prose prompts must preserve POV, avoid head-hopping, and balance concrete action, dialogue/subtext, and selective internal reflection.
  - Each selected sequence unit maps to one full chapter prose node. Chapter nodes can still run in parallel across chapters under the default output workflow global cap of 8, LLM cap of 8, and ebook chapter group cap of 8, but a chapter is not split into independently generated sections because prose continuity inside a chapter is more important than intra-chapter parallelism.
  - Full chapter prose nodes use OpenAI Responses background mode with long polling from the Fly worker, persisted provider request IDs, and hash-based retry/skip behavior so long chapters do not depend on a short request timeout. New executor versions must be bumped when prompt or node shape changes enough that old prose hashes should not be reused.
  - Ebook cover generation uses a text LLM cover-prompt node followed by an `image_generation` node using Fal `openai/gpt-image-2` at a 2:3 book-cover ratio. The cover image is a first-class `project_assets.kind = "image"` asset and `output_artifacts.kind = "image"` artifact with workflow provenance. Cover failures are treated as optional V1 branch failures so the PDF can still render without a cover.
  - Output is a complete trade-ebook PDF plus companion Markdown manuscript stored as `project_assets.kind = "document"` and indexed in `output_artifacts`. PDF rendering is worker-only: the Fly worker passes a `documentRenderer` callback into the shared workflow executor, converts manuscript Markdown into sanitized semantic HTML/CSS, and renders with system Chromium/Playwright at 6in x 9in with cover page when available, title page, chapter page breaks, serif book typography, margins, and footer page numbers. Supabase Edge Functions must not import browser rendering dependencies.
- `comic_issue_from_sequence`: one selected `sequence_unit` -> world context -> output skills -> relevant entity selector -> rich dramatic scene script -> fixed page plan -> structured comic script -> comic atlas prompt -> GPT Image 2 atlas image -> deterministic page-prompt splitters and one full-page comic image per planned page -> full-bleed comic PDF render -> output artifact.
  - Comic issue V1 uses a fixed planned fan-out at workflow planning time. Page count defaults to 8 and is capped at 12. Comic adaptation is staged: `comic_scene_script` creates rich dramatic material, `comic_page_plan` compresses it into exact page rhythm, and `comic_script` converts that plan into final page/panel JSON. `comic_page_prompt` nodes remain deterministic `utility_transform` adapters that extract one page from the validated JSON script, merge page-specific entities/guidance, and build the GPT Image 2 prompt without asking another LLM to reinterpret the story. Page image nodes run independently after the script and atlas dependencies with the default output workflow image/Fal cap set to 8 concurrent image nodes and `comic_pages` group concurrency set to 8, while the PDF render waits for all page image nodes and preserves page order from node config instead of completion order.
  - Output workflow text LLM nodes default to `gpt-5.4`, including script, prose, plan, prompt-adapter, storyboard, comic, and cinematic text nodes. `OUTPUT_WORKFLOW_TEXT_MODEL` can override this globally, and comic LLM nodes may use `OUTPUT_WORKFLOW_COMIC_TEXT_MODEL` when configured, falling back to the same GPT-5.4 default. Do not fall back script-writing nodes to mini-class models unless a deployment explicitly opts into that tradeoff.
  - Comic writing skills include `comic_scene_dramatization`, `comic_page_pacing`, `comic_panel_storytelling`, `comic_dialogue_lettering`, and `comic_adaptation_compression`. Comic LLM nodes use `OUTPUT_WORKFLOW_COMIC_TEXT_MODEL` when configured, falling back to `OUTPUT_WORKFLOW_TEXT_MODEL`.
  - Comic script generation must produce a complete production script, not a loose outline. The `comic_script` node uses strict structured JSON output, validates exact page count, 3-6 panels per page, usable shot/action text, enough dialogue/caption text, and rejects repeated placeholder panel descriptions so downstream page art cannot silently proceed from a thin script. If the first comic-script pass returns incomplete page/panel JSON, the worker runs one bounded LLM repair pass with validator diagnostics and the upstream scene/page plan before failing. Page continuity notes are requested and normalized from the selected sequence outcome when missing, but absence of explicit notes must not block an otherwise complete script.
  - Comic entity relevance is hybrid: deterministic graph/context prefiltering chooses likely cast, places, objects, concepts, and existing visual refs for the selected sequence unit from explicit sequence metadata such as `povCharacterKey`, `actorKey`, `affectedEntityKeys`, relationship links, and normalized name mentions. The `comic_entity_selector` text node narrows that into an `asset_pack` with entity roles, visual descriptions, image asset keys, and missing-reference notes, but deterministic thumbnail/image asset keys must be merged back in so the model cannot accidentally drop available reference images.
  - Comic atlas and page image nodes use Fal `openai/gpt-image-2`; atlas/page image nodes switch to the reference/edit route when atlas or project-asset reference images are available. Project-asset references should be passed to Fal as temporary signed Supabase URLs when possible, with Base64 data URIs only as a fallback, to avoid large queue payloads and make provider failures easier to diagnose. Fal queue status/result polling must prefer canonical model-qualified URLs such as `/openai/gpt-image-2/edit/requests/...` over provider-returned URLs because provider URLs can omit `/edit` and return misleading transient 500s. Custom image dimensions are normalized to provider-safe multiples of 16 before submission so stale workflow nodes with older page sizes can be retried without recreating the workflow. Generated atlas/page images are stored as `project_assets.kind = "image"` and `output_artifacts.kind = "image"` with `role = "comic_atlas"` or `role = "comic_page"`.
  - Output workflow GPT Image 2 quality and output-format defaults are centralized in `src/config/aiGenerationSettings.ts`. Defaults are low quality for character concept art, medium quality for posters, comics, and ebook covers, and WebP output format for generated images. Prompt-first clients may pass `imageQuality` (`low`, `medium`, or `high`) and `imageOutputFormat` (`webp`, `png`, or `jpeg`) to override preset defaults for the generated workflow; the Fly worker still honors `OUTPUT_WORKFLOW_IMAGE_QUALITY` and `OUTPUT_WORKFLOW_IMAGE_OUTPUT_FORMAT` as fallback overrides for stale nodes without persisted config.
  - Comic PDF rendering is worker-only and uses generated page images full-bleed on US comic page size `6.625in x 10.25in`. The worker prepares large generated PNG pages into PDF-safe JPEG page embeds before pdf-lib assembly to avoid OOMs during multi-page comic registration, and the Fly worker should run with enough memory headroom for image/PDF assembly. The final artifact is registered as `output_artifacts.kind = "comic_pdf"` with companion script Markdown for debugging and later page regeneration.
- `cinematic_episode_from_sequence`, `cinematic_trailer`, and `ugc_episode`: one selected `sequence_unit` -> world context -> cinematic/UGC/Seedance skills -> cinematic entity asset pack -> `cinematic_script_authoring` GPT-5.4 script document -> deterministic `cinematic_sequence_compile` using the legacy Cinematics compiler -> cinematic reference atlas prompt -> GPT Image 2 low-quality WebP atlas -> `cinematic_dynamic_take_fanout` materializes one beat-sheet prompt, storyboard-grid image, Seedance prompt, and video node per compiled take by default -> worker-side ffmpeg stitch -> final video artifact. Keyframe prompt packs and three clean GPT Image 2 keyframes are generated only when a request explicitly sets `cinematicReferenceMode = "keyframes"` or `"keyframes_and_storyboard"`.
  - Cinematic outputs are script-first and dynamic. New workflows do not force `videoBlockCount` or `durationPerBlockSeconds`; those values are compatibility hints only. The authored `cinematicScriptDoc` determines total runtime, shot count, and shot durations, then `buildCinematicSequenceFromScriptDoc()` groups shots into natural 4-15 second takes. The worker persists generated take nodes with deterministic keys such as `take_001_beat_sheet_prompt`, `take_001_beat_sheet`, `take_001_video_prompt`, and `take_001_video`; optional keyframe modes add `take_001_keyframe_prompt_pack` and `take_001_keyframe_001`, then the worker reloads the graph and continues the same run.
  - Dynamic fan-out is capped at 6 takes and 60 seconds total in V1. Takes should usually fill 10-15 seconds when continuity allows, but the compiler must not pad runtimes; a short prompt can produce a single short take, and the last take may be shorter when the script naturally ends.
  - Cinematic defaults are `16:9`, `720p`, and `generateAudio: true`; UGC-oriented prompts default to `9:16`. Every compiled take is capped to Seedance's 4-15 second duration range.
  - Cinematic workflows consolidate relevant entity references into one square `cinematic_atlas_image` node, similar to comic atlas generation. The atlas uses readable entity-name labels/captions and neutral continuity views of relevant characters, places, props, palettes, and material cues. Storyboard-grid image nodes consume the atlas plus available original entity references so a weak atlas does not become the only visual anchor.
  - Beat sheets use `openai/gpt-image-2` through Fal at low quality and WebP output. They are required planning/QA artifacts and the default primary video reference, marked `planningOnly` / `planning_only` and `usedAsVideoReference` / `used_as_video_reference`. They use clean black-canvas timed panels with short caption bands, no title/footer/table columns, exact take timing, and final-video aspect-ratio panels. Seedance receives the beat sheet as `@Image1` in default `storyboard_sheet` mode and is instructed to follow panel order without reproducing captions, borders, gutters, UI, or grid artifacts.
  - Keyframes use `openai/gpt-image-2` through Fal at low quality and WebP output only for explicit fallback modes. In `keyframes` mode, each take generates three clean standalone keyframes for opening, midpoint, and ending composition and Seedance reference order is keyframes first (`@Image1` opening, `@Image2` midpoint, `@Image3` ending), then the cinematic atlas and any entity/environment refs. `keyframes_and_storyboard` keeps the storyboard grid as `@Image1` and adds keyframes after it.
  - Seedance prompts use a compact call-sheet structure: truth source mode, reference legend, timestamped timeline, consistency lock, and positive constraints. They must not include dense beat-sheet text, workflow/guidance wording, or instructions for Seedance to read a storyboard table.
  - Cinematic video execution has a debug cost-control flag, `debugSkipVideoGeneration`, defaulting to `aiGenerationSettings.outputWorkflow.debugSkipVideoGenerationDefault` and currently enabled by default. When enabled, `video_generation`, `video_stitch`, and final cinematic video artifact nodes complete as skipped placeholders after scripts, beat sheets, optional keyframes, and prompts are generated. Set the client/request flag to `false` to submit real Seedance jobs.
  - Seedance 2 execution uses `bytedance/seedance-2.0/fast/reference-to-video` by default for 720p/480p and `bytedance/seedance-2.0/reference-to-video` for 1080p unless `OUTPUT_WORKFLOW_VIDEO_MODEL` or node config overrides it. The worker enforces up to 9 images, 3 videos, 3 audio clips, and 12 total reference files before submission.
  - Final stitching is worker-only and requires `ffmpeg` in the Fly image. The worker first tries concat copy and falls back to H.264/AAC re-encode, then uploads the final MP4 to `project-assets` and registers `output_artifacts.kind = "video"` with role `cinematic_sequence_final`. Individual block videos remain registered as `cinematic_block` artifacts.
- Story subtypes now include `fiction_novel` and `nonfiction_ebook`; seed profiles should create usable chapter-oriented `sequence_unit` nodes and wiki metadata for downstream ebook generation

**Integration**:
- Public Edge Functions: `start-output-request`, `get-output-request-status`, `cancel-output-request`, `plan-output-workflow`, `start-output-workflow`, `start-output-workflow-run`, `get-output-workflow-status`, `cancel-output-workflow-run`, `get-output-artifact`, `update-output-workflow-node`, and `upgrade-output-workflow-preset`
- `start-output-request` is the prompt-first entry point. It runs the structured output planner to classify whether a prompt is output generation, world mutation, answer-only, or ambiguous; output prompts select an approved preset/template, bind mentioned world entities/sequence units, persist a workflow and queued run, and link both back to the request. For concept/poster image requests, it also runs an OpenAI Responses JSON-schema scope resolver before workflow creation so prompts such as “Ilya saluting to Anya” bind only the Ilya and Anya entity keys and their available visual assets. The resolver uses `OUTPUT_REQUEST_PLANNER_MODEL` when configured, falls back to `OUTPUT_WORKFLOW_TEXT_MODEL`, and otherwise defaults to `gpt-5.4`; it stores scope provenance in request/workflow/run metadata. Non-output/ambiguous/low-confidence prompts remain request rows awaiting confirmation rather than mutating world canon or defaulting to the wrong artifact type.
- `upgrade-output-workflow-preset` patches stale saved preset instances in place instead of creating a fresh workflow. V1 uses it to add the ebook cover branch to older ebook workflows, preserving completed prose node hashes and dirtying only new cover nodes plus downstream document/artifact nodes.
- The Fly worker claims one output workflow run at a time, then runs independent ready nodes in parallel subject to global and resource-class concurrency caps. Worker images must include Chromium, usable serif fonts, and Deno `--allow-run` permission so Playwright can launch the system Chromium binary for ebook PDF rendering.
- The Outputs workspace owns preset selection, prompt composition, dependency-level workflow preview, fullscreen React Flow/ELK workflow graph visualization, node guidance inspection, prompt editing for provider-backed nodes, targeted per-node reruns, run timeline, skipped/blocked status display, retry-from-failed controls, and artifact gallery
- Output artifact status responses hydrate temporary signed URLs into artifact metadata so newly generated images/PDFs can be opened before a full project snapshot reload includes their `project_assets` rows.
- `update-output-workflow-node` is the only client-facing workflow graph edit endpoint in V1. It validates draft/workflow access, persists node `position`, allows `inputs.prompt` only on provider-backed nodes, and dirty-propagates prompt changes to descendants while layout-only changes do not mark execution dirty.
- `CinematicsWorkspace` remains available as an Outputs sub-mode while cinematic graphs are migrated into workflow presets
- Future presets should wrap existing visual/app/cinematic systems rather than replacing their durable job pipelines

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
- Records OpenAI Responses API token usage for each world-prompt LLM call into turn metadata, including input, output, total, cached input, reasoning tokens, provider response id, and request id. Incremental progress events also carry the latest cumulative turn token usage so onboarding and graph prompt meters update during each work item instead of waiting for a final turn refresh. The frontend session token meter uses this exact cached usage when available and falls back to an approximate visible-text estimate for older turns. The graph prompt token meter is clickable and shows session, current turn, last-step, and per-call token details; cost/credit rows should hydrate from `ai_usage_events` as world-prompt provider calls are migrated through the shared gateway.
- Initial seed generation now keeps onboarding open until the skeleton generation turn completes. The inferred project context is supplied to the planner immediately but is not persisted with `onboardingCompletedAt` until the full initial skeleton turn finishes, and the frontend keeps an explicit active seed-session latch so partial first-wave entities cannot briefly open the graph view before the turn is done.
- Exposes linked world context and world-graph relationships inside the specialized definition workspaces through the `linkedDefinitionKey` bridge, including deep links back into the graph and across linked records
- Uses planner-authored thread lifecycle actions so world-prompt turns can create, deepen, reprioritize, resolve, park, or relink story threads without backend-invented fallback thread canon
- Uses planner-authored temporal event relationships so event chronology is stored as graph canon on `world_relationships.metadata.temporal` instead of chat order or prompt event sequence
- Maintains lightweight wiki presentation hints during prompt turns when canon naturally supports them, including loglines, synopsis text, role labels, short summaries, tone tags, and wiki section metadata
- Maintains project-wide wiki overview metadata with planner-authored `update_world_wiki_metadata` ops in the same prompt turn, storing generated content title, logline, synopsis, themes, tone tags, genre, core conflict, visual motifs, project-specific art style description, brand atlas image prompt, optional app color scheme, and freshness fingerprints in `project_drafts.metadata.worldWiki`
- Uses an incremental manifest-and-work-item executor for initial seed generation and broad/sequence-heavy prompt turns. The agent first plans small ordered work items, emits the full manifest outline for progress UI, then generates and applies each item through the normal graph mutation path so entity, sequence-unit, and relationship progress is visible before the full turn completes.
- Includes wiki gap diagnostics in prompt retrieval so empty or weak wiki sections can be filled through targeted prompt turns without extra background LLM passes on every normal authoring turn
- Uses authored sequence retrieval for Story project plot and chapter prompts. Sequence units carry synopsis, dramatic question, story function, outcome, consequences, character arc deltas, open/resolved loops, and script-expansion readiness metadata.
- Enforces Story sequence-unit completeness before writing chapter canon. Story planner JSON schema requires `sequence_unit` ops to carry strict `customProperties.sequence` metadata, including ordinal, synopsis, dramatic question, outcome, at least one cause/effect consequence, and at least one character arc delta; still-incomplete sequence ops are repaired or skipped with an explicit note instead of persisting thin chapter nodes.
- Runs a focused Story sequence completion pass when the main planner or durable streamed seed worker emits thin chapter ops, using current sequence context, relevant graph entities, relationships, and threads to fill required `customProperties.sequence` metadata before validation and apply.
- Stores canonical neutral visual identity on world entities at `world_entities.metadata.visual`, with `description`, `traits`, optional `traitMap`, `descriptionMode = "neutral_identity"`, and `transientStateExcluded = true`. The legacy compatibility field remains `world_entities.metadata.visualDescription` and is composed as `<neutral description> Traits: ...`. World-prompt entity generation must describe stable silhouette, face/hair/clothing/materials/palette/marks and must not overwrite identity with temporary combat poses, injuries, crying, lighting, camera angle, weather, or event-specific damage. Dynamic scene visuals belong on `event` and `sequence_unit` nodes, not actor/place/object identity traits.
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
- App Wiki presentation splits product graph sections by app ontology, including separate `Code Towers` and `Code Files` sections for `tower` and `code_file` nodes once the approved design enters implementation planning.
- App projects can opt into shared interactive-system graph canon when the app needs executable stateful mechanics such as credits, inventories, collectibles, numeric player stats, progression tokens, gated choices, marketplaces, barter, travel, dialogue choices, session bootstrapping, or save state. These systems are declared through `customProperties.app.interactiveSystems` or `customProperties.interactive.requiredSystems`, use shared nodes such as `player_initial_config`, `player_stat`, `inventory`, `inventory_item`, `currency`, `shadow_token`, `marketplace`, `trade_offer`, `dialogue_node`, `choice`, `choice_condition`, `choice_outcome`, `state_variable`, `travel_link`, `location_spot`, and `save_state`, and compile into runtime contracts rather than hardcoded app templates.

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
- App seed profiles are design-first: require app identity, personas, business goals, features, user flows, screens, components, data models, actions, API endpoints, capabilities, and design system nodes, but do not require implementation towers or code-file plan nodes until the visual prototype is approved for build.
- App UX flows must be represented as `user_flow` nodes, not story `sequence_unit` nodes.
- App entities are not linked into character, item, or environment projection records. Linked definition repair remains limited to narrative/media node types such as `actor`, `place`, and `object`.
- Normal follow-up app turns use a project-type prompt strategy layer. The shared `world-prompt` endpoints still orchestrate turns, but App strategy owns app planner guidance, app suggestion filtering, app readiness diagnostics, wiki gap wording, incremental manifest guidance, and incremental work-item guidance.
- App incremental work items may carry `projectType: "app"` and `appSlice` values such as `product`, `flows`, `screens`, `components`, `data_api`, `capabilities`, `design_system`, and `relationships`. App broad design builds must not create `sequence_unit`, `tower`, or `code_file` work items; implementation planning is a separate approved-design pass.
- App readiness diagnostics must use product/UX/prototype language such as screen contracts, API contracts, capability constraints, design system readiness, brand atlas, screen art, and static prototype readiness. Tower ownership and code-file planning belong to the approved implementation pass. Story-shaped diagnostics such as threats, villains, protagonists, lore, kingdoms, hidden truths, or motives must be filtered out for app contexts.
- Targeted app wiki metadata actions such as setting `metadata.colorScheme`, defining `metadata.artStyleDescription`, or drafting `metadata.brandAtlasPrompt` use a limited-context fast path before broad graph retrieval. These turns must emit a single `update_world_wiki_metadata` operation and must not attach story diagnostics, thread actions, or unrelated graph expansion.
- App preview readiness is iterative and split into design/prototype and implementation/build tracks. The App Wiki exposes `Refine Design Graph`, `Generate Screen Art`, `Analyze Screen Art`, `Preview Static Flow`, `Approve Design For Build`, `Generate Implementation Plan`, and `Build Preview App` actions. Code generation remains disabled until `Visual Prototype Ready` is approved and `Implementation Plan Ready` is true.
- App screen art is a dedicated visual stage after `design_graph_refined`. The App Wiki can enqueue `visual_generation_jobs.kind = "app_screen_mockup"` once route-bearing screens and a brand atlas exist. The Fly visual worker generates one screen mockup asset per screen and upserts a `screen_mockup` graph node linked to the source `screen`.
- App screen analysis is also durable visual work. `Analyze Screen Art` enqueues `visual_generation_jobs.kind = "app_screen_analysis"` so the Fly worker writes `screen_mockup.customProperties.app.visualSpec` plus `image_region` hotspot/layout nodes for static prototype navigation and CSS/React Native implementation guidance.
- Brand atlas images are generated as `visual_generation_jobs.kind = "brand_atlas"`. The protected `start-world-brand-atlas-image` Edge Function creates a pending `project_assets` row, links `worldWiki.brandAtlasAssetKey`, enqueues the generic job, and returns immediately; the Fly worker then calls Fal `openai/gpt-image-2`, uploads the image, and marks the asset completed.
- Long-running image generation must use the generic durable visual pipeline: enqueue quickly, process provider calls outside the user-facing request path, heartbeat from the worker, persist assets in `project_assets`, expose status metadata, and have the UI poll/refresh instead of holding a Supabase Edge request open.

### Game Prompt Agent (`game-prompt`)
**Purpose**: Extends game projects with executable game-system graph authoring. Narrative RPG Mobile projects keep characters, locations, inventory, economy, travel, branching dialogue, conditions, outcomes, and progression state as game canon before any app/mobile shell is generated.

**Supported Project Type**:
- `projectType: "game"`
- `brainProfile: "game"`
- New subtype: `narrative_rpg_mobile`

**Narrative RPG Mobile Ontology**:
- Content identity nodes continue to use existing world types: `actor`, `place`, `object`, `group`, and `concept`.
- Executable game-system nodes include `player_profile`, `player_initial_config`, `player_stat`, `inventory`, `inventory_item`, `currency`, `shadow_token`, `location_spot`, `travel_link`, `marketplace`, `trade_offer`, `quest`, `quest_step`, `narrative_arc`, `narrative_scene`, `dialogue_node`, `choice`, `choice_condition`, `choice_outcome`, `state_variable`, `game_rule`, `encounter`, and `save_state`.
- Shared interactive structured fields should live under `world_entities.custom_properties.interactive`; `world_entities.custom_properties.game` remains accepted for backward compatibility and game-specific authoring hints.

**Relationship Verbs**:
- `contains`, `uses`, `located_in`, `available_at`, `travels_to`, `starts_at`, `speaks_to`, `offers`, `costs`, `trades_for`, `requires_item`, `requires_token`, `requires_currency`, `grants_item`, `removes_item`, `grants_token`, `sets_state`, `unlocks`, `branches_to`, `fails_to`, `owned_by_player`, `represented_by`, and `depends_on`.

**Generation Behavior**:
- Initial `narrative_rpg_mobile` seed generation creates a playable graph foundation instead of generic story/game canon.
- Branching dialogue must not be stored as lore-only text. Choices should connect to executable conditions and outcomes that mutate inventory, currency, progression tokens, state, quest progress, travel access, or branch targets.
- `sequence_unit` may describe high-level quest order, but executable branching belongs in `quest`, `narrative_scene`, `dialogue_node`, `choice`, `choice_condition`, and `choice_outcome` nodes.
- Readiness checks validate missing endpoints, unreachable required items/tokens/currency, travel links, markets, dialogue choices, outcomes, progression-token usage, and save-state coverage.
- The Wiki exposes game-specific sections for world content, inventory, economy, travel, quests, narrative arcs, dialogue choices, progression tokens, and rules/validation.
- Mobile shell generation remains downstream and should consume the approved playable game graph after static playability is reliable.

**Codegen Direction**:
- Dedicated app modules define the Expo React Native target contract, base file plan, tower ownership, preview targets, and native capability constraints.
- Generated apps should target Expo, React Native primitives, Expo Router, TypeScript, a mock backend adapter for preview, and later managed/Supabase backend adapters.
- Apps that use shared interactive systems should include generated runtime files such as `lib/interactive/InteractiveRuntime.ts`, `lib/interactive/MockInteractiveAdapters.ts`, and `lib/interactive/interactiveManifest.ts` so generated screens can present app-specific UX while relying on common condition, outcome, inventory, currency, token, player stat, dialogue branch, trade, travel, session initialization, and save-state primitives.
- Web preview, GitHub export, EAS, and App Store publishing remain separate downstream app-generation stages after the App Graph is stable.
- App preview generation now has dedicated job APIs and storage contracts separate from world seed jobs: `start-app-code-generation`, `get-app-generation-status`, `cancel-app-generation-job`, and `get-app-preview-session`, backed by `app_generation_jobs`, `app_generation_job_steps`, and `app_generated_files`.
- App preview generation is durable: `start-app-code-generation` enqueues quickly, the Fly worker claims jobs through `claim_app_generation_job`, heartbeats through `heartbeat_app_generation_job`, writes generated file records, and completes/fails through the app-generation RPCs. The first worker implementation creates deterministic Expo-oriented source files plus a sandbox HTML iPhone preview; the next implementation stage should replace that deterministic preview with the full install/typecheck/build/export repair loop while preserving the same job/status/session API.
- `Approve Design For Build` stores a design approval fingerprint with approved screens, screen mockups, visual specs, design system, brand atlas, and transition keys. If relevant design artifacts change later, implementation planning and codegen must require reapproval.
- Implementation planning must consume the approved design bundle and create/repair only `tower` and `code_file` nodes plus implementation relationships. It must not rewrite product, UX, screen, component, visual, or design-system canon during the code-plan pass.
- App preview code generation is contract-first: shared route/action contracts, backend adapters, capability adapters, mock auth/AI/payment/native providers, design tokens, and mock data are generated before tower-owned screen/component files.

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
- Fiction story projects should also set project-level `worldWiki.narrationPov` and chapter-level `customProperties.sequence.povCharacterKey` when a focal character exists, with optional `povCharacterName` and `povNotes`, so downstream ebook generation can preserve narration style and focal perspective.
- Story sequence completion remains LLM-authored: deterministic logic may detect missing fields, provide recommended next ordinal, route context, and validate the result, but it does not invent synopsis, outcome, consequence, or character-arc canon itself.
- Wiki presentation is graph-native and derived at render/retrieval time. The graph remains canonical; wiki metadata only improves display, and gap-fill buttons call the existing `start-world-prompt-turn` flow with targeted context.
- Project-wide wiki presentation is metadata-only and low-cost: the planner may update it when retrieval marks wiki context as targeted or opportunistic, while backend validation caps and merges fields without deterministically writing replacement title/synopsis canon. Wiki display uses the generated metadata title as the content title; the GraphCore project name remains workspace/user-facing metadata and is not used as the world title fallback.
- Project-wide Wiki visual-system metadata now includes `artStyleDescription`, `brandAtlasPrompt`, optional `brandAtlasAssetKey`, and `colorScheme`. Story/world projects use these fields as a world bible art direction and visual atlas prompt; app projects use them as app brand/UI direction with primary, secondary, and tertiary colors. Wiki gaps can target missing art style, brand atlas prompt, and app color scheme fields through normal `start-world-prompt-turn` metadata updates.
- Targeted Wiki visual-system gap turns are metadata tasks, not graph audits. Requests to set app colors, art style descriptions, or brand atlas prompts should route as direct `update_world_wiki_metadata` operations and must not emit generic weak-context/world-core diagnostic findings unless the user explicitly asks for a graph diagnosis.
- Wiki gap tooling includes batch entity icon generation. The Wiki can start a protected `start-world-entity-icon-batch` request that selects up to 16 active world entities missing both `thumbnailAssetKey` and linked definition `iconAssetKey`, then enqueues a generic `visual_generation_jobs.kind = "world_entity_icon_grid"` job. The Fly worker prompts Fal's `openai/gpt-image-2` endpoint for a row-major icon grid in the project art style and crops the grid into per-entity Supabase Storage assets. The full grid is kept as a source asset, while each entity and linked definition gets its own cropped icon asset key so Wiki cards and Library entries use the normal project asset pipeline.
- Character-sheet imagery is separate from card icons. Durable high-resolution character sheets should use `metadata.visual.characterSheetAssetKey` on world entities, with `metadata.visual.characterSheetUrl` only as an external fallback; icon thumbnails must not be overwritten by character-sheet assets.
- World wiki metadata validation tolerates common streamed LLM shape drift for presentation-only fields: `genre` arrays are normalized into a compact string, and comma-separated theme/tone/motif strings are normalized into arrays before graph-op schema validation.
- Prompt suggestion generation is project-type aware. App projects should receive product/UX/design-prototype suggestions such as UX flows, screens, components, data/API contracts, capabilities, design systems, brand atlas, and screen-art readiness; story suggestions such as main threats, villains, protagonists, chapters, lore layers, factions, kingdoms, or inciting events are filtered out for app contexts.
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
- World-prompt generated entities store structured neutral visual identity in `world_entities.metadata.visual` and keep the composed `world_entities.metadata.visualDescription` compatibility string. Linked definition projections copy the composed neutral brief into render prompt components (`render_3d_binding.conceptPrompt` / `generationPrompt` or `environment_render_binding.generationPrompt`) so Library concept-image generation, Wiki cards, graph entities, prose prompts, and output workflows read the same durable appearance anchor instead of diverging by browser/session.
- Initial onboarding world generation automatically queues a Fal/OpenAI GPT Image 2 icon-grid job when the first `sequence_unit` begins, using the first 16 already-created image-capable world entities and their `metadata.visualDescription` prompts. The Fly worker runs separate generation and icon-job loops so the icon batch can process while the text world seed continues streaming.
- Resetting a project world now also removes generated world-icon image assets for the reset draft from Supabase Storage and deletes their `project_assets` rows. It also cancels and deletes all Output Studio requests/workflows/artifacts for the draft, including generated output-owned assets and storage objects, while preserving usage ledger history. This cleanup is scoped to generated world-icon paths and output-owned artifacts so reset does not erase unrelated Library uploads, cinematic outputs, or mesh assets.
- Wiki icon batch generation targets visual world entities by default: actors, places, groups/factions, objects/artifacts, concepts/lore, and story `sequence_unit` beats. Event chronology nodes are not counted in the default Wiki gaps action. Generated sequence-unit images are stored as Library image assets, linked through the world entity `thumbnailAssetKey`, and rendered in the Wiki story-flow timeline.
- Initial world seed generation now runs through a Fly.io long-running worker by default instead of Supabase Edge/PGMQ phase execution. `continue-world-seed-generation` still creates the persistent session, generation turn, parent job, and realtime-visible compatibility step, but the `workers/world-generation` process claims queued Fly jobs from Supabase and streams the full OpenAI graph-op response directly into `world_prompt_events` and graph tables.
- Fly worker jobs use `world_prompt_generation_jobs.metadata.runtime = "fly"` and a single `full_stream` job step. The worker uses service-role-only claim/heartbeat/terminal RPCs, stable worker metadata, heartbeat-based stale retry, and the existing graph-op apply path so realtime, polling, cancellation, token usage, linked definitions, and graph landing remain compatible with the frontend.
- The Fly worker also claims generic `visual_generation_jobs` for Wiki icon enrichment, brand atlases, and future screen mockups. Legacy `world_entity_icon_generation_jobs` are still drained for compatibility, but new icon requests use the generic table. These visual asset jobs are not world-prompt canon turns: they submit Fal queue requests to `openai/gpt-image-2`, poll for completion, upload generated assets to `project-assets`, update graph/wiki targets, and report job status through service-role-only claim/heartbeat/complete/fail RPCs.
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
