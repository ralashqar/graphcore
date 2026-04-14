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

## What Creates A Viral UGC Video

This section is the practical synthesis for GraphCore UGC script generation.

The consistent pattern across the reviewed UGC/ad/operator material is that viral UGC is usually not "random authenticity." It is engineered clarity plus engineered emotion inside a frame that feels native to the platform.

### Core mechanics

- The first second decides whether the rest of the video matters.
- One idea should dominate the clip.
- The viewer should understand the subject, tension, and payoff path almost immediately.
- The frame should feel native, but the persuasion structure should be deliberate.
- Product, proof, or outcome should arrive early enough to justify continued attention.
- Every strong clip has a readable emotional register:
  - curiosity
  - surprise
  - relief
  - desire
  - urgency
  - status
- The best-performing UGC usually feels like:
  - "I discovered something"
  - "I solved something"
  - "I am showing you something worth stealing"

### Viral UGC formula

For GraphCore purposes, high-performing UGC usually follows this sequence:

1. Hook
2. Claim or tension
3. Demonstration or mechanism
4. Proof or transformation
5. Payoff
6. CTA or implied next step

This does not mean every clip must be spoken to camera. It means the viewer needs those six jobs handled somehow, whether through face-led UGC, faceless demo, reaction framing, text overlays, or product-first visuals.

### What makes the hook work

- It creates an information gap immediately.
- It names a pain, desire, or unexpected result.
- It implies the video contains an unfair advantage, shortcut, reveal, or test.
- It is visually legible even with the sound off.
- It is specific enough to feel real, not generic.
- It often weaponizes contrast:
  - rich vs poor
  - success vs failure
  - easy vs hard
  - before vs after
  - hidden truth vs common mistake

Useful hook families for UGC generation:

- contrarian claim
- personal confession
- sharp before/after
- challenge or test
- mistake warning
- result reveal
- comparison
- social-proof/status signal
- reframe
- "you're doing it wrong"
- validation / permission

### The brain scans for disruption, not polish

Another supplied article adds a useful correction to "make the content better."
On fast-moving feeds, the viewer is usually not judging quality first. They are scanning for:

- is this familiar or surprising?
- does this involve me or someone like me?
- is there tension, danger, or social threat here?

That means highly polished content can underperform when it looks too normal, too resolved, or too safe.
For GraphCore, this matters because some formats should optimize for disruption before polish:

- lead with the most counterintuitive, uncategorizable, or tense thing
- avoid spending the opening on clean explanation
- treat the first three seconds as the cost of admission, not part of the body
- make the first frame readable without audio

### Additional viral mechanics from low-quality-winning formats

The article also sharpens three mechanics that should influence UGC planning.

#### 1. Pattern interruption

The winning move is often not "high quality."
It is mismatch:

- childish visual package with adult conflict
- soft aesthetic with sharp emotional language
- familiar format with unexpected subject matter

The interruption forces the brain to reconcile two things that do not belong together.
That pause becomes retention.

For GraphCore, this means the generator should sometimes ask:

- what expectation is the clip setting visually?
- what tension breaks that expectation immediately?
- is the contrast between package and payload strong enough to stop the scroll?

#### 2. Open loops

The article reinforces the value of unresolved tension:

- betrayal without immediate resolution
- conclusion stated before explanation
- a conflict that implies a next beat or next episode

This is especially relevant for:

- serialized creator content
- explanation-led faceless clips
- `contrast_narrative`
- dramatic visual-loop formats

The lesson is not "always leave the story unfinished."
It is "close the loop late enough that the viewer must stay."

#### 3. Negativity bias

Negative emotional signals often outperform neutral or wholesome ones because the viewer is more sensitive to:

- threat
- conflict
- betrayal
- embarrassment
- failure
- social danger

This does not mean every script should be dark.
It means the generator should understand that tension usually carries more stopping power than pleasantness alone.

### Two especially strong viral engines

The two additional articles sharpened two important ideas.

#### 1. Contrast is a distribution engine

Keeton's article argues that many breakout AI short-form formats are not winning because of their visuals alone. They win because they package a repeatable psychological trigger:

- extreme contrast forces comparison
- status/wealth/survival-coded imagery adds emotional charge
- the viewer stays to resolve the gap

That means a viral UGC generator should not just ask "what is the product?" It should ask:

- what contrast is the viewer instantly comparing?
- what status, pain, desire, or hierarchy signal is being activated?
- can that contrast stay readable throughout the clip?

This is especially useful for:

- `ugc_direct_response_ad`
- transformation UGC
- comparison UGC
- faceless visual-loop formats

#### 2. Script formulas outperform generic advice

Shalev's article is more directly useful for auto scripting. It claims that a small set of script formulas repeatedly outperformed hundreds of AI-character scripts.

The three strongest formulas from that article:

- `Reframe`
  - take something the audience already does
  - do not shame them for it
  - redirect it into a smarter or more empowering version
- `You're Doing It Wrong`
  - take a boring everyday behavior
  - claim they have misunderstood it
  - reveal mistakes and fixes
- `Validation`
  - do not teach something new
  - say what the viewer already feels but has not heard stated clearly
  - make them feel seen, permitted, or understood

These formulas matter because they explain why certain hooks outperform generic tips:

- they reduce resistance
- they create curiosity fast
- they feel emotionally personal
- they are easy to remix across niches

### Contrast narrative formats scale across niches

Another supplied guide sharpened a related but distinct point: some viral UGC formats are not just "good hooks." They are rigid multi-scene contrast engines.

The claimed pattern:

- strong comparison drives attention
- money/status/transformation acts as emotional payoff
- the story is broken into short scenes
- the same two characters or poles stay visually locked
- the structure is reusable across many niches

The important abstraction is not "copy this exact rich-vs-poor format."
It is:

- choose a primal comparison axis
- choose the emotional payoff
- keep the comparison legible in every beat
- make the story escalate
- port the same structure into adjacent niches

Example comparison axes:

- poor vs rich
- failure vs success
- before vs after
- pay-to-win vs skill
- masking vs healing
- quick fix vs discipline
- broke founder vs successful founder
- zero views vs millions

This is useful because it turns "viral storytelling" into a reusable planning pattern instead of a one-off creative idea.

### A reusable pattern for contrast-led scripts

For this family of UGC, the script usually works like this:

1. Establish two poles immediately
2. Repeat the comparison across short escalating scenes
3. Preserve identity and framing consistency
4. Increase the emotional gap each beat
5. End on the strongest contrast/payoff image
6. Loop cleanly or end on a sticky emotional image

This is not the same as normal creator UGC. It is closer to a visual story engine.

### Reference vaults are part of the script system

The supplied examples also show a practical prompt pattern worth keeping:

- define stable character/reference vault entries first
- map scenes back to those vault entries
- generate one image prompt and one video prompt per scene

That means GraphCore should eventually support not just:

- a script
- a storyboard

but also:

- a reusable reference vault for recurring roles, ages, looks, or states
- scene-level prompt kits derived from that vault

This is especially relevant for serialized UGC and recurring character formats.

### What makes the body hold attention

- Show, do not just tell.
- Keep one dominant subject per beat.
- Move from claim to evidence quickly.
- Change the frame or information density often enough to prevent scroll-drop.
- Use proof that feels concrete:
  - product in hand
  - visible workflow
  - side-by-side comparison
  - metric/result
  - testimonial or reaction
- Remove setup that does not increase curiosity or trust.

### What makes it feel authentic instead of scripted

- Creator-native phrasing rather than polished brand copy.
- Specific detail instead of vague superlatives.
- Imperfect but readable framing.
- Real use context.
- Emotional continuity between the creator persona and the claim.

Authenticity here should be treated as a stylistic wrapper around persuasion. The clip can be heavily structured as long as it does not read like formal ad copy.

### What makes it convert, not just entertain

- The mechanism is understandable.
- The benefit is concrete.
- The proof is early.
- The audience knows who the product is for.
- The CTA matches the format and energy of the clip.

For direct-response UGC, the most common failure mode is delaying proof/product visibility too long. For creator-style UGC, the most common failure mode is sounding promotional before earning trust.

### The brain is scanning for disruption, not quality

One additional guide sharpened an important point: on short-form feeds, the viewer is usually not evaluating "quality" first. They are scanning for something that feels surprising, self-relevant, or tense.

The useful framing is that the brain is rapidly checking:

- is this familiar or surprising
- does this involve me or someone like me
- is there tension, threat, conflict, or danger here

That helps explain why highly polished content often underperforms stranger, rougher, or more chaotic content. Clean execution can signal "normal." But a mismatched or emotionally loaded frame creates interruption.

### Three viral levers called out explicitly

The guide breaks recurring virality into three mechanisms:

#### 1. Pattern interruption

- a mismatch between what the frame suggests and what the content delivers
- example: childlike visuals with adult conflict
- example: calm aesthetic with aggressive emotional stakes

For GraphCore, this means the generator should sometimes optimize for contrast between packaging and payload, not just for clean coherence.

#### 2. Open loops

- unresolved conflict keeps attention alive
- identity plus betrayal plus unfinished outcome creates compulsion
- serial continuation can outperform standalone closure

For GraphCore, this means some subtypes should deliberately support:

- unresolved endings
- episode chains
- “stay to understand why” structure
- conclusion first, explanation later

#### 3. Negativity bias

- threat, betrayal, anger, tension, or complaint often outperform wholesome clarity
- not because audiences are inherently toxic, but because negative information gets prioritized more aggressively

For GraphCore, the lesson is not "make everything negative." It is:

- conflict often outperforms niceness
- tension usually beats neutrality
- cost, risk, violation, or stakes make clips harder to ignore

### Additional practical heuristics worth using

- Spend disproportionate effort on the first 1-3 seconds.
- Lead with the most counterintuitive claim, not the most complete explanation.
- State the conclusion before the reasoning when you want retention.
- Sound-off clarity is mandatory.
- A useful review test:
  - mute the video and watch the first second
  - if the hook is not visually legible, it is weak

### Why copying visible formats fails

The guide also reinforces a useful distinction:

- most people copy the aesthetic
- the winners copy the mechanism

That means "cartoon fruit drama" is not the insight. The insight is:

- mismatch
- open loop
- tension
- unresolved social threat

GraphCore should therefore generate from mechanism-first subtypes and formulas, not from surface trend labels.

### What this changes in prompt guidance

The UGC prompt guidance should explicitly allow:

- counterintuitive opening statements
- open-loop hooks
- conclusion-first structure
- slight tension or disagreement when the format supports it
- high visual legibility in the first second

This is especially relevant for:

- `contrast_narrative`
- `ad_comparison`
- `faceless_explainer`
- creator story or drama-like subtypes if they are added later

## Script Generation Rules For GraphCore UGC Presets

These rules should shape planner prompts and script writing.

### Global rules for all UGC generators

- Start from a formula, not from a blank script.
- Choose one dominant emotional trigger per clip.
- Choose one dominant contrast if the format is visually comparative.
- Keep one core idea per video.
- Prioritize interruption and tension over generic "quality" in the opening beat.
- Move from hook to proof faster than a typical brand script would.
- Prefer native phrasing over polished ad phrasing.
- If a script teaches, it must do so through curiosity, reframe, or validation rather than lecture.
- When appropriate, prefer mechanism-level disruption over surface polish.
- Use open loops intentionally when the format is serial, contrast-led, or explanation-led.
- Check whether the hook still works with sound off.
- If the visual alone does not explain the first-second tension, the hook is weak.
- Do not copy visible aesthetics without copying the underlying psychological mechanism.
- When useful, allow mild disagreement, friction, or counterintuitive framing to create comments.

Suggested formula enum for auto generation:

- `contrast_comparison`
- `contrast_narrative`
- `reframe`
- `doing_it_wrong`
- `validation`
- `mistake_warning`
- `result_reveal`
- `challenge_test`
- `before_after`
- `personal_confession`
- `open_loop_conflict`
- `counterintuitive_claim`

Suggested future UGC metadata for evaluation and iteration:

- `patternInterruption`
- `openLoopType`
- `negativityLoad`
- `visualHookReadableMuted`
- `counterintuitiveClaimStrength`

### `ugc_creator`

- Start with a creator-native hook.
- Follow with a personal claim or observed problem.
- Move into live demo or use-case quickly.
- Use soft proof and a soft CTA.
- Prefer vertical/mobile-native framing and believable spoken phrasing.
- Prefer these formula families:
  - `reframe`
  - `validation`
  - `personal_confession`
  - `challenge_test`

Default beat path:

1. Hook
2. Personal angle
3. Demo
4. Small proof
5. Soft CTA

### `ugc_direct_response_ad`

- Start with the strongest hook frame available.
- Name the pain or desire quickly.
- Show the mechanism fast.
- Bring product and proof in early.
- End with a direct CTA.
- Prefer these formula families:
  - `contrast_narrative`
  - `doing_it_wrong`
  - `mistake_warning`
  - `result_reveal`
  - `before_after`
  - `contrast_comparison`

Default beat path:

1. Hook
2. Pain
3. Mechanism
4. Proof
5. Payoff
6. CTA

### `ugc_faceless_format`

- Use object, screen, workflow, or process as the subject.
- Make the value proposition readable without needing a face.
- Bias toward comparison, workflow revelation, or transformation.
- Let motion and text overlays do more of the explanatory work.
- Prefer these formula families:
  - `contrast_narrative`
  - `doing_it_wrong`
  - `contrast_comparison`
  - `before_after`
  - `result_reveal`

Default beat path:

1. Pattern interrupt or curiosity hook
2. What is being shown
3. Process or mechanism
4. Result or proof
5. CTA or implied action

## UGC Evaluation Checklist

Before a generated UGC script is considered good enough, it should pass these checks:

- Hook is visible and understandable inside the opening beat.
- The hook belongs to a recognizable formula family.
- One emotional register dominates the clip.
- If contrast is used, the contrast is immediately legible.
- Product, proof, or payoff appears early enough.
- The clip has one clear core idea.
- The viewer can understand the mechanism without extra explanation.
- The voice matches the intended persona.
- The CTA fits the preset and does not feel pasted on.
- The visual plan supports sound-off comprehension.
- If it relies on a loop, the unresolved question is obvious.
- If it relies on disruption, the disruption is visible immediately rather than explained later.

## Auto-Generator Guidance

For GraphCore's future UGC auto-script generator, the planner should explicitly choose:

1. Preset family
2. Formula family
3. Dominant emotional trigger
4. Dominant visual contrast, if any
5. Proof type
6. CTA style
7. Whether this is a contrast-led narrative sequence or a single-beat UGC script

Recommended generated metadata additions for UGC scripts:

- `formulaFamily`
- `dominantTrigger`
- `contrastAxis`
- `statusPayoffType`
- `narrativeArcTemplate`
- `sceneCount`
- `referenceVault`
- `openLoopType`
- `disruptionType`
- `proofMoment`
- `proofType`
- `ctaStyle`

That would let GraphCore generate UGC scripts intentionally rather than producing generic short-form copy.

## Post-Generation Workflow Matters As Much As Prompting

One additional guide sharpened an important operating principle: strong teams are not just better at prompting. They are better at what happens after generation.

The useful model is:

1. Brief
2. Generate
3. Evaluate against explicit criteria
4. Diagnose the single failure
5. Iterate only that failure
6. Finish quickly
7. Archive winning assets into a reusable library

### Evaluation should be criterion-based, not emotional

Before generation, define:

- hook objective
- visual objective
- camera objective

Then score the generation against those three criteria instead of reacting with:

- "looks cool"
- "doesn't feel right"

This matters for GraphCore because the workspace should eventually make these criteria visible and inspectable at shot and take level.

### Fix only what failed

The best practical insight from the workflow article is that most operators waste time by regenerating everything when only one variable failed.

If:

- character is right
- lighting is right
- camera motion is wrong

then the next generation should preserve the good references and swap only the camera reference or motion instruction.

For GraphCore, this reinforces:

- take stills and storyboards are not just previews
- they are reusable references for later generations
- execution plans should make it obvious which ref controls which job

### The asset library is part of the product

Every successful output should be saved as a reusable asset:

- anchor character still
- winning camera-motion clip
- mood board
- style reference
- proof/demo composition

This turns the system from "generate from scratch every time" into "compound what already worked."

For GraphCore, this strongly supports:

- making ref packs visible
- storing winning shot/take stills as deliberate future references
- keeping storyboard panels, take stills, and compiled ref sources inspectable

## Video AGI Means Cheap Experimentation, Not One Perfect Output

Another guide makes the core mechanic even clearer: the main shift is not a single perfect model. It is the collapse in cost and time between idea and execution.

The strategic consequence:

- test more directions
- test more styles
- test more hooks
- test more aesthetics
- let performance data select winners instead of taste alone

### Practical learnings for AI video creation

- emotional specificity beats adjectives
  - sequential micro-actions work better than vague emotional labels
- one impossible thing in one normal place is a strong scroll-stopper
  - ordinary x extraordinary contrast is cheap and memorable
- objects often carry continuity better than faces
  - useful for multi-shot AI sequences
- pain beats spectacle
  - give the character a problem or cost, not just beauty
- chain shots instead of treating each clip as isolated
  - each generation should feed the next one

### What this means for GraphCore

GraphCore should increasingly think in terms of:

- iterative experiments
- ref libraries
- continuity through chained generations
- style testing
- feedback loops from published performance back into prompt and preset selection

This also supports the current design direction:

- storyboard images
- shot stills
- take stills
- explicit Seedance prompt packs

Those are not side features. They are the infrastructure for faster experimentation.

## The Psychology Layer Behind UGC

One supplied guide went deeper into the psychological mechanisms underneath UGC hooks and conversion.

The useful takeaway is not to copy manipulative language blindly. It is to understand which human mechanism a script is activating so the generator can do it deliberately and responsibly.

### Mechanisms repeatedly used in strong UGC

- `paltering`
  - selective truth-telling that highlights real positives while omitting less helpful context
- `exploitation`
  - targeting an insecurity, fear, desire, or vulnerability that already exists
- `gaslighting / belief reset`
  - making the viewer question what they thought they knew
- `love_bombing / parasocial reassurance`
  - building trust through care, empathy, and shared struggle
- `triangulation / social proof`
  - invoking other people, the community, or followers as validation
- `guilt_tripping`
  - making inaction feel irresponsible
- `defiance_trigger / reverse psychology`
  - creating a desire to prove the framing wrong
- `negging`
  - introducing mild insecurity that the product resolves

### Why this matters for script generation

Most hooks are not just "interesting." They are triggering one or more of these mechanisms.

Examples:

- "you've been doing this wrong" -> belief reset + curiosity
- "most people ignore this" -> defiance trigger + status anxiety
- "hey mama, you deserve to feel good too" -> parasocial reassurance + guilt relief
- "everyone asked me what changed" -> triangulation + social proof

### Responsible use

For GraphCore, the right lesson is:

- understand the mechanism
- use it in service of a real product or real value
- avoid false claims
- avoid deception as a dependency

The generator should know why a hook works, not just imitate surface wording.

## Recommended Additions To The UGC Generator Spec

Given the newer research, the auto-generator should eventually choose and persist not just a formula family, but also:

- `psychologyMechanism`
- `secondaryMechanism`
- `cameraObjective`
- `visualObjective`
- `hookObjective`
- `referenceRoleMap`
- `iterationDiagnosis`

Useful enums:

- `psychologyMechanism`
  - `curiosity_gap`
  - `belief_reset`
  - `status_comparison`
  - `parasocial_reassurance`
  - `social_proof`
  - `guilt_pressure`
  - `defiance_trigger`
  - `insecurity_resolution`

- `iterationDiagnosis`
  - `hook_failed`
  - `proof_failed`
  - `camera_failed`
  - `continuity_failed`
  - `emotion_failed`
- `cta_failed`

This would let GraphCore move from "generate script" to "generate, evaluate, diagnose, and improve script and visual package."

## Seedance 2 Guidance For GraphCore

One additional supplied guide was much more model-specific and is useful for Seedance-oriented prompt and storyboard generation.

### Why operators like Seedance 2

The repeated claims in the guide are:

- strong prompt adherence
- smoother and more realistic motion control
- good fit for image-plus-prompt workflows
- strong results when the clip is tightly structured before generation

Even if individual performance claims vary by niche, the workflow advice is useful.

### Recommended Seedance workflow

The guide's practical flow is:

1. Create stable character images first
2. Write or adapt dialogue
3. Convert dialogue into visual scene description
4. Turn the scene into storyboard layout images
5. Use those storyboard layouts as Omni Reference inputs
6. Generate tightly timed Seedance prompts that map shot-by-shot across the layout

This reinforces GraphCore's current direction:

- storyboard refs should not be treated as optional decoration
- they can be active generation assets for Seedance
- take generation should be grounded in previsualized boards and stable refs

### Character setup before video

The strongest practical point in the guide is to establish characters in neutral reusable reference views before any video generation:

- front profile
- side profile
- back profile
- full-body
- clean background
- stable style and lighting

For GraphCore, this supports the idea that character refs should be more reusable and more explicit as reference packs, not just one-off assets.

### Dialogue -> scene description -> storyboard layout

The workflow converts:

1. dialogue
2. into cinematic scene description
3. into storyboard layout images
4. into timestamped Seedance prompts

That chain is directly relevant to GraphCore because it suggests a stronger planning path for UGC and scripted short-form:

- dialogue is not the video prompt
- scene description is not the final video prompt
- storyboard layout is the bridge between script and generation

This is especially useful for:

- family-drama UGC
- serialized character content
- emotional story shorts
- multi-beat 8-15 second takes

### Storyboard layout images are active generation inputs

The guide recommends multi-panel vertical storyboard layouts where:

- the same character appears consistently across all panels
- each panel is a different beat in the scene
- the image flows top to bottom
- the layout itself becomes the reference for the generated clip

That means GraphCore's storyboard generation should support not only:

- single panel boards
- sequence boards

but also:

- stacked vertical multi-panel layouts optimized for Seedance-style prompting

### Omni Reference is the important mode

The strongest model-specific recommendation in the guide is:

- use `Omni Reference`
- do not default to first/last frame or scene builder when the goal is coherent storyboard-driven generation

For GraphCore this implies:

- take execution planning should favor Omni-style reference packaging when a storyboard layout is present
- the prompt pack should indicate why a take is using that mode

### Prompt structure should be timed and explicit

The guide's prompt structure is important:

- split the clip into timestamped shots
- specify exact total duration
- specify shot duration
- specify camera movement
- specify lighting and mood
- specify whether dialogue belongs in a given shot
- explicitly avoid transitions when the board already defines shot order

For GraphCore, this means Seedance prompt builders should increasingly output:

- exact shot timestamps
- exact clip length
- explicit global settings
- one camera movement per shot or per clip
- reference-role-aware instructions

### Duration discipline matters

The guide stresses that generation settings should exactly match the prompt structure:

- if the prompt is 8 seconds, render 8 seconds
- if the prompt maps 4 panels at 2 seconds each, do not ask the model for another duration

This is simple but important. GraphCore should avoid loose duration selection when a take already has a structured shot map.

### What this means for GraphCore

Recommended implications:

- add a dedicated `seedance_storyboard_layout` style for storyboard image generation
- support top-to-bottom multi-panel boards as first-class storyboard outputs
- make take prompt builders derive timed shot segments from storyboard panels when present
- keep reference roles explicit:
  - character lock
  - style lock
  - board layout
  - mood board
- favor Omni-style prompt packing when storyboard layouts exist

## Seedance-Specific Generator Guidance

If GraphCore is generating for Seedance, the planner and runtime should prefer:

- reusable neutral character sheets
- storyboard-first take planning for multi-beat clips
- timed prompt segments
- explicit camera directions
- exact duration matching
- one dominant motion instruction per beat
- continuity through layout boards and still refs, not only text

Suggested extra metadata for Seedance-oriented takes:

- `seedancePromptStyle`
- `storyboardLayoutStyle`
- `timedShotPlan`
- `referenceMode`
- `durationLocked`

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
- Keeton: contrast-driven viral format as scalable distribution system
  - https://x.com/keetonny/status/2044081697688289565
- Shalev: repeatable viral script formulas (`reframe`, `doing it wrong`, `validation`)
  - https://x.com/shalevhvs/status/2044099931494068455

Additional supplied guide text incorporated in this document:

- Post-generation workflow:
  - evaluate against brief, fix only what failed, build the asset library
- Video AGI / experimentation loop:
  - cheap iteration, style testing, chained shots, object-led continuity, data-guided refinement
- Dark psychology in AI UGC:
  - explicit mapping between hooks and psychological mechanisms such as social proof, belief reset, defiance triggers, and parasocial reassurance
- Seedance 2 workflow:
  - character sheets first, dialogue to scene descriptions, storyboard layout images, Omni Reference, exact timed prompts, duration matching
- Contrast-led viral scripting:
  - primal comparison axes, status/money payoffs, multi-scene escalation, reference-vault prompt structure, and niche-portable contrast narratives

## Bottom Line

GraphCore already has the right core cinematic primitives.

What it needs next is not a brand-new cinematic system. It needs:

- a real preset family layer
- UGC-native planning and validation
- preset-aware still and board generation
- manual take-node still generation built on the existing Nano Banana path

That is the shortest path from the current cinematic graph model to movie/TV presets, UGC presets, and usable node-level visual generation.
