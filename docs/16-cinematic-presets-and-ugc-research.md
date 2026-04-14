# Cinematic Presets And UGC Research Base

Reviewed on April 14, 2026.

This document does three things:

1. Maps how GraphCore currently builds cinematic graphs from code.
2. Distills external research on AI video, UGC, short-form ads, and Seedance 2.
3. Turns both into concrete guidance for the next implementation phase:
   - separate cinematic preset families
   - stronger UGC-specific planning and graph generation
   - manual take-node image generation with Nano Banana first

Important note:

- The repo findings below come from code and internal docs.
- The external findings come from X posts/articles by operators and builders. Treat them as practitioner heuristics, not verified benchmarks.

## Current GraphCore Cinematic Flow

### Where the flow lives

- Planner routing and cinematic intent detection:
  - `supabase/functions/plan-world-build/index.ts`
  - `supabase/functions/_shared/world-build-cinematics.ts`
- Canonical cinematic schemas:
  - `src/domain/cinematics.ts`
  - `src/domain/worldBuild.ts`
- Cinematic script -> graph compilation:
  - `src/domain/cinematicScriptCompiler.ts`
- World-build execution and graph authoring:
  - `supabase/functions/start-world-build/index.ts`
  - `supabase/functions/poll-world-build/index.ts`
- Runtime still/video generation:
  - `supabase/functions/start-cinematic-run/index.ts`
  - `supabase/functions/poll-cinematic-run/index.ts`
- Frontend workspace and manual editing:
  - `src/features/cinematics/CinematicsWorkspace.tsx`

### Current build path

1. `plan-world-build` detects whether a prompt is a normal world-build request or a `cinematic_build`.
2. For cinematic requests, the planner resolves entity refs first:
   - characters
   - environments
   - items
3. The cinematic planner then produces a `CinematicPlan` with:
   - `entityRefs`
   - `scriptDoc`
   - `relationshipRefs`
   - `compositeRefPlans`
   - `storyboardPlan`
   - `shots`
   - `graphSettings`
4. `start-world-build` creates placeholder jobs for:
   - missing definitions
   - composite images
   - storyboard images
   - the cinematic graph itself
5. `poll-world-build` materializes the script, repairs weak plans when needed, and compiles the final cinematic graph.
6. `compileCinematicGraphFromScriptDoc` creates:
   - `asset_ref`
   - `composite_ref`
   - `storyboard_ref`
   - `cinematic_shot`
   - `cinematic_take`
7. `poll-cinematic-run` generates:
   - shot stills with Nano Banana on fal
   - shot videos with Seedance
   - take videos with Seedance

### Current graph semantics

GraphCore already has a good base model for cinematic authoring:

- `asset_ref` is the direct world/source reference.
- `composite_ref` is the continuity lock for unstable combinations such as character + prop.
- `storyboard_ref` is the sequence board or panel reference.
- `cinematic_shot` is the unit of authored beat, framing, motion, dialogue, action, audio, and reference packing.
- `cinematic_take` is the compiled output clip grouping one or more shots into a 4-15 second Seedance run.

### Current timing and execution behavior

- Shot duration is inferred when not explicitly authored.
- Takes are compiled from contiguous shots and clamped to Seedance limits.
- Seedance mode is chosen from shot/take inputs:
  - `reference-to-video` when multiple refs, storyboard refs, or composite refs are present
  - `image-to-video` when one strong primary image is enough
- Reference packing is already thoughtful:
  - storyboard first
  - composites next
  - then direct refs

### Current settings support

`cinematicSettingsSchema` and `cinematicGraphSettingsSchema` already support:

- aspect ratio
- still resolution
- video resolution
- clip seconds
- fps
- `specializationMode: 'story' | 'ugc'`

This is important: GraphCore already has the beginning of a specialization concept, but today it is only a light setting. It is not yet a full preset family that changes planning, script structure, graph shape, validation, or execution defaults.

## Current Gaps Relevant To The Next Phase

### 1. `story` vs `ugc` is a flag, not a true preset system

Today the code can store `specializationMode`, but the planner and compiler do not yet branch deeply enough to create meaningfully different outputs for:

- movie or TV storytelling
- creator-style UGC
- direct-response ads
- short-form organic faceless formats

### 2. Storyboards are cinematic-first, not UGC-first

The current pipeline naturally favors:

- sequence boards
- shot panels
- continuity across cuts

That is correct for film or trailer work, but many UGC formats want:

- hook card
- beat card
- creator pose references
- product hold/demo references
- CTA ending reference

### 3. Manual shot still generation exists, but take still generation does not

Current runtime behavior:

- shot stills are generated via Nano Banana
- take videos are generated via Seedance

What is missing:

- a manual button on `cinematic_take` to generate a first image or board for the whole take
- a preset-aware still prompt for UGC vs movie-TV

### 4. UGC script structure is not explicit enough yet

Current `scriptDoc` is good for cinematic beats, but high-performing UGC often needs first-class fields for:

- hook type
- persona
- pain point
- proof type
- offer or CTA intent
- platform-native delivery style

Those can be encoded into current text fields, but should become structured preset behavior.

## Research Plan Completed

I reviewed all unique links supplied by the user and grouped them into four buckets:

1. Seedance and AI-video production workflows
2. UGC ad systems and performance marketing workflows
3. Virality and short-form retention mechanics
4. Content-system and feedback-loop infrastructure

The most relevant sources for GraphCore preset design were:

- `starks_arq`
- `vadimstrizheus`
- `adriansolarzz`
- `alessandrolavis`
- `mho_23`
- `pounddz`
- `vibemarketer_`
- `sanjaybuilds_`

The other links still added useful signal around:

- consistency techniques
- content engine design
- multi-account scale
- operator heuristics for AI-native content pipelines

## Condensed External Learnings

### A. Effective AI video generation is a loop, not a single prompt

Repeated across the strongest sources:

- The unit of advantage is iteration speed.
- Generate, evaluate against explicit criteria, fix one failure, regenerate.
- Do not regenerate the entire shot if only one variable failed.
- Save every successful character/style/camera output as a reusable reference asset.

Implication for GraphCore:

- presets should define scoring criteria before generation, not only prompt templates
- each shot/take should carry evaluation axes and reusable references

### B. High-performing prompts are highly directed, not vague

Strong repeated patterns:

- micro-actions outperform adjectives
- timestamps outperform broad scene descriptions
- one emotional register per clip beats mixed tone
- specify the role of each reference input
- good starting images and good audio matter more than prompt cleverness

Implication for GraphCore:

- UGC presets should generate timestamped beat plans by default
- movie/TV presets should generate stronger blocking, framing, and continuity notes
- reference roles should be explicit in UI and prompt assembly

### C. Continuity comes from references and chaining, not from luck

Repeated ideas:

- objects anchor continuity better than faces alone
- last-frame-to-first-frame chaining improves sequence coherence
- identity lock and reusable character refs matter a lot for scale
- product refs and product-hold refs matter as much as face refs in UGC

Implication for GraphCore:

- `composite_ref` is the right abstraction and should expand for UGC
- product-hold or demo-state composites should become common in UGC presets
- take-level still generation should reuse connected refs plus prior shot outputs

### D. Short-form winners have predictable structural mechanics

Repeated across virality/ad posts:

- hook must land in the first 1.5-2 seconds
- motion must start immediately
- cuts should feel rhythmic, often around 2-3 seconds
- each frame should have one dominant visual idea
- payoff should land before the very end
- audio and visual beats must align

Implication for GraphCore:

- UGC presets should validate hook timing, payoff timing, and dominant-frame clarity
- movie presets can tolerate slower setup; UGC presets usually cannot

### E. UGC is persuasion design, not just "realistic talking head"

Repeated across ad-focused posts:

- strong hooks are built from pain, curiosity, direct benefit, or social proof
- believable imperfection matters
- scripts should sound like spoken phone language, not ad copy
- one winning concept should fan out into many variations quickly
- performance marketing values speed, cost, and refresh cadence over artisanal perfection

Implication for GraphCore:

- UGC presets need structured hook families
- persona and delivery style should be first-class preset inputs
- graph generation should optimize for variation and testing, not only continuity

### F. Winning systems connect generation to distribution feedback

Repeated operating-system themes:

- monitor niche trends continuously
- use performance data to decide which style, topic, and angle to scale
- reuse winners across paid, organic, influencer, and creator workflows
- treat each output as training data for the next batch

Implication for GraphCore:

- long term, cinematic presets should connect to performance memory
- short term, docs and schema should reserve a place for:
  - hook family
  - winning angle
  - source trend
  - variation lineage

## What This Means For Preset Families

GraphCore should move from one cinematic planner to a preset family model.

Recommended top-level preset families:

### 1. `story_movie_tv`

Goal:

- cinematic sequence authoring for films, TV scenes, trailers, cutscenes

Default behavior:

- favors multi-shot continuity
- favors storyboard sequence board plus panels
- stronger environment and blocking emphasis
- composite refs for wardrobe, weapon, pairings, mounts, hero props
- slower pacing allowed
- aspect ratio defaults to `16:9` or `21:9`

Script bias:

- dramatic beat
- scene continuity
- emotional progression
- action and dialogue beats
- camera grammar

Graph bias:

- more `storyboard_ref`
- more `composite_ref`
- richer `cinematic_take` grouping

### 2. `ugc_creator`

Goal:

- organic creator-style short-form videos

Default behavior:

- 9:16 first
- talking-head or selfie-first framing
- fewer location dependencies
- stronger face/product continuity
- simple beat cards instead of full cinematic storyboard by default

Script bias:

- hook
- pain
- personal claim
- quick demo
- soft CTA

Graph bias:

- product refs are high priority
- creator identity lock is high priority
- storyboards optional or replaced by hook/proof/end cards

### 3. `ugc_direct_response_ad`

Goal:

- conversion-focused paid creative

Default behavior:

- 6-20 second clips
- many hook variants
- explicit CTA intent
- proof and objection handling
- rapid refresh and batch variation

Script bias:

- hook family
- problem framing
- product mechanism
- proof
- CTA

Graph bias:

- same actor/product system reused across many shot/take variants
- stronger variation metadata
- less cinematic continuity, more testing continuity

### 4. `ugc_faceless_format`

Goal:

- AI-native short-form where face realism is optional or secondary

Examples:

- product demo
- satisfying process
- podcast clips
- visual explainers
- animated memes

Graph bias:

- environment or object-driven refs
- rhythm and payoff matter more than face continuity

## Recommended Schema / Planner Direction

### Keep the current shared core

Do not throw away the current cinematic model. The base abstractions are good:

- `entityRefs`
- `compositeRefPlans`
- `storyboardPlan`
- `shots`
- `takes`

### Add a real preset layer above it

Add a preset field to the cinematic plan and graph metadata, for example:

- `presetFamily`
- `presetId`

Good initial values:

- `story_movie_tv`
- `ugc_creator`
- `ugc_direct_response_ad`
- `ugc_faceless_format`

### Add preset-specific structured fields

Suggested additions for UGC-oriented script docs:

- `hookType`
- `targetEmotion`
- `painPoint`
- `proofType`
- `ctaType`
- `personaStyle`
- `platformTarget`
- `variationGroupId`

These should influence:

- planner prompts
- script repair rules
- compile-time validation
- still/video prompt assembly

## Manual Take-Node Image Generation With Nano Banana

### Current state in code

GraphCore already has a useful still-generation path:

- shot stills use Nano Banana in `poll-cinematic-run`
- if source images exist, it uses the edit model
- otherwise it falls back to text-to-image

This means the first manual take-node image feature can reuse the same provider path instead of inventing a new one.

### Recommended v1 behavior

Add a manual action on `cinematic_take`:

- `Generate Take Still`
- optional later: `Generate Take Board`

Inputs for the take still prompt:

- connected character refs
- connected environment refs
- connected item refs
- connected composite refs
- connected storyboard refs if present
- first shot still if one already exists
- previous take end frame when continuity matters

Prompt behavior by preset:

- `story_movie_tv`
  - keyframe or storyboard-panel language
  - continuity, blocking, dramatic staging
- `ugc_creator`
  - believable phone-camera creator frame
  - creator holding/using product
  - natural imperfection
- `ugc_direct_response_ad`
  - strongest scroll-stopping hook frame
  - product readable in first glance
  - ad-native framing

### Recommended v1 output model

Store on take metadata:

- `outputStillAssetKey`
- `takeStillPrompt`
- `takeStillPreset`
- `takeStillSourceRefIds`

This keeps take still generation inspectable and replayable, just like shot execution plans.

## Concrete Implementation Recommendations

### Phase 1: Documentation and preset scaffolding

- Add preset family metadata to cinematic settings and graph metadata.
- Split planner prompts into preset-aware variants.
- Keep one shared schema, but make planner behavior preset-sensitive.

### Phase 2: UGC-specific script generation

- Generate different default script structures for:
  - movie/TV
  - creator UGC
  - direct-response UGC
- Add UGC validation rules:
  - hook appears immediately
  - one dominant emotional register
  - product or proof appears early enough
  - CTA fits the format

### Phase 3: Preset-aware graph authoring

- Movie/TV:
  - storyboard-heavy
  - continuity-heavy
- UGC:
  - creator/product/proof-heavy
  - variation-heavy
  - fewer cinematic support refs by default

### Phase 4: Manual take still generation

- Add a take-node button in the UI.
- Reuse Nano Banana still generation infrastructure.
- Use connected asset refs and preset-aware prompt assembly.

## Source Index

Most relevant practitioner sources:

- Amir D: AI video as fast iteration + experimentation loop
  - https://x.com/starks_arq/status/2043007296477823216
- Vadim Strizheus: product-page-as-brief, multi-format ad generation, cheap variation testing
  - https://x.com/vadimstrizheus/status/2043841279037988990
- Adrian Solarz: psychological levers behind UGC hooks and persuasion
  - https://x.com/adriansolarzz/status/2043751295572742448
- Alessandro Lavis: repeatable UGC-ad workflow from hook to creator identity to assembled ad
  - https://x.com/alessandrolavis/status/2042946012268875917
- Miko: Seedance 2 omni-reference workflow, timestamps, extension chaining, reference roles
  - https://x.com/mho_23/status/2043060741616603442
- Pounds: structural virality patterns for short-form videos
  - https://x.com/pounddz/status/2042725150534328421
- J.B.: evaluate-diagnose-iterate workflow and reusable reference library
  - https://x.com/vibemarketer_/status/2042311561113415888
- Sanjay: content-channel compounding loop and UGC/pre-test system
  - https://x.com/sanjaybuilds_/status/2043124366884712488

Supporting sources reviewed:

- Alex Nguyen: distribution and geo-targeting setup for TikTok
  - https://x.com/alexcooldev/status/2043742702349758728
- demonugc: Seedance 2 workflow for viral short-form niches
  - https://x.com/demonugc/status/2043788243473445077
- zero / twoclipping: short-form psychology and comparison/status narrative structures
  - https://x.com/twoclipping/status/2043383780963143715
- kai: burst-frame consistency technique
  - https://x.com/kaigani/status/2043046509449736338
- Will: app-growth/ad-system perspective
  - https://x.com/athcanft/status/2042794694560879061
- Bella: neural-response analysis as a content optimization idea
  - https://x.com/growthsuck/status/2042243621668188183
- Ronin: content-engine architecture and knowledge-file workflows
  - https://x.com/deronin_/status/2042604279077237170
- f*ckgrowth: TRIBE v2 / neural-virality angle
  - https://x.com/fuckgrowth/status/2041580077826371733
- Cas.Fyn: automated AI ad pipeline at scale
  - https://x.com/fyncas/status/2041879422878232629
- ViralOps: podcast/faceless workflow
  - https://x.com/viralops_/status/2044029013388382327
- Simone Ferretti: AI content machine and input-quality discipline
  - https://x.com/sferro21/status/2043685806443773988
- Sharbel: content systems and agentized production
  - https://x.com/sharbel/status/2044055375612133727

## Bottom Line

GraphCore already has the right core cinematic primitives.

What it needs next is not a brand-new cinematic system. It needs:

- a real preset family layer
- UGC-native planning and validation
- preset-aware still and board generation
- manual take-node still generation built on the existing Nano Banana path

That is the shortest path from the current cinematic graph model to movie/TV presets, UGC presets, and usable node-level visual generation.
