# Seedance 2 Workflows

## Overview

GraphCore now treats Seedance 2 as the primary cinematic video target.

Use these endpoints:

- `bytedance/seedance-2.0/reference-to-video`
  - Best for multi-reference cinematic shots.
  - Supports up to 9 images, 3 videos, and 3 audio clips, with a 12-file total cap.
  - References are addressed in prompts with `@Image1`, `@Video1`, and `@Audio1`.
- `bytedance/seedance-2.0/image-to-video`
  - Best when one strong still image should drive the shot.
  - Supports `image_url` and optional `end_image_url`.

Current fal limits used by GraphCore:

- Resolution: `480p` or `720p`
- Duration: `4` to `15` seconds, or `auto`
- Aspect ratio: `21:9`, `16:9`, `4:3`, `1:1`, `3:4`, `9:16`, or `auto`
- Native audio: enabled when the shot includes dialogue or audio cues

## Recommended Workflow

1. Prompt a cinematic sequence in terms of characters, props, location, action, and tone.
2. Let the planner resolve existing world entities and create any missing ones.
3. Generate composite references for unstable subject-plus-prop combinations such as:
   - character with weapon
   - character with wardrobe
   - rider with mount
4. Generate a storyboard sheet and shot panels for continuity.
5. Review the cinematic graph:
   - `asset_ref` nodes for direct world references
   - `composite_ref` nodes for fused continuity references
   - `storyboard_ref` nodes for sequence board and shot panels
   - `cinematic_shot` nodes for sequence order and beat metadata
6. Run each shot or the full graph through Seedance.

## Reference Pack Priority

GraphCore packs Seedance inputs in this order:

1. Shot panel
2. Sequence board
3. Composite references
4. Primary character references
5. Environment or location references
6. Hero props
7. Optional style, audio, or video references

If a shot exceeds Seedance's 12-file total cap, lower-priority references are dropped first and the dropped ref ids are stored in the shot execution plan.

## Prompt Format

Seedance responds best to production-style prompts, not tag soup.

Use this structure:

1. Shot label
2. Main action
3. Main camera move
4. Composition or blocking note
5. Dialogue or sound cue when needed
6. Reference directives

Example:

```text
Shot 1: Character A draws Sword B and rushes Character C across the temple floor. Camera tracks left at waist height and then pushes in on the clash. Keep the lit doorway behind Character C and make the sword silhouette readable. Dialogue: "Move." @Image1 is the shot panel. @Image2 is Character A with Sword B. @Image3 is the temple environment.
```

## Reference-Led Prompt Contract

GraphCore prompts must describe only references that are actually submitted to the provider. The provider-facing reference legend is generated from the final input order, using one-based tags:

- `@Image1`, `@Image2`, etc. for images
- `@Video1`, `@Video2`, etc. for video references
- `@Audio1`, `@Audio2`, etc. for audio references

Do not hard-code `@Image1 is the storyboard` unless the storyboard sheet is actually the first submitted image. If a fallback run drops entity references, the prompt must be rebuilt so stale `@ImageN` labels do not remain.

For V3 storyboard-block videos, prefer this image order:

1. Storyboard sheet as the sequential visual keyframe source
2. Selected character or group variant reference sheets
3. Selected shot-location or environment variants
4. Hero props or continuity assets
5. Optional video/audio references through their own `@VideoN` / `@AudioN` tags

For V2 keyframe videos, keep the shot keyframe as `@Image1`; supporting entity, location, and prop references follow it.

The recommended compact Seedance prompt structure is:

1. Intent line: one clip, aspect ratio, and resolution. Timing comes from the provider duration parameter and shot call sheet, not a duplicated headline.
2. Reference legend: exact `@ImageN`, `@VideoN`, and `@AudioN` duties
3. Storyboard/keyframe instruction only when that reference exists
4. Directed controls: camera motion, subject motion, focus target, framing lock, visibility, performance, voice, and motion intensity
5. Short timestamped shot line with action and dialogue
6. One concise artifact/continuity constraint

For MUAPI VIP `seedance-2-vip-omni-reference`, keep the final provider prompt under 4000 characters. Preserve the reference legend and timed action first, then shorten identity guidance, drop lower-priority movement prose, and keep only one artifact ban. Do not send project briefs, long world summaries, or repeated continuity bans to the provider.

For sequence animatic per-shot videos, ignore rough screenplay marker timing when setting the shot take duration. Infer a realistic editorial duration from the shot action, dialogue length, camera movement, performance beats, and needed settle/hold, then use that inferred duration as the provider duration parameter and prompt shot range. The cropped panel remains `@Image1`; supporting refs must stay shot-scoped.

Offscreen speakers should not be sent as visual image references. Keep their name and voice/performance guidance in the speaker guide, but attach art references only for visible characters, the shot location, visible props, and the cropped panel/keyframe.

Prefer directed controls over verbose cinematic prose. Prompts should explicitly state the camera path, subject path, focus target, framing lock, visibility/reveal rule, visible performance, voice delivery, and motion intensity when those controls are relevant. Voice guidance should include available character context such as age/gender cue, accent, pitch, register, pace, and delivery quality without adding offscreen visual references.

Per-shot animatic videos should use narrow native audio: scripted dialogue plus direct diegetic sound effects caused by visible or explicitly offscreen shot action. Do not include music, score, audio beds, room tone, crowd wash, or general background ambience in shot-video prompts.

When a storyboard sheet is attached, treat it as a sequence of visual keyframes. Ask Seedance to follow panel order, action progression, body direction, camera rhythm, framing, lighting continuity, and pacing, while animating smoothly between poses.

Production-board markings are never final-video content. Prompts should ban arrows, handwritten notes, labels, panel numbers, borders, gutters, captions, UI, guide boxes, watermarks, and map/camera diagrams once, not repeatedly.

Use physics cues when they clarify motion: cloth inertia, hair/fabric lag, object weight, dust displacement, water ripple, prop bounce, impact sparks, motivated glow, or debris flow. Use Laban movement terms only for high-physicality action such as martial arts, fights, chases, staff/sword choreography, impacts, aerial turns, or parkour. Do not add Laban language to quiet dialogue, romance, investigation, or environmental establishing shots.

Compact example:

```text
Generate one Seedance 2 reference-to-video clip, 16:9, 720p.

[REFERENCE LEGEND]
@Image1: Storyboard block 3 sheet; primary sequential storyboard keyframe reference.
@Image2: Suri Samurai variant; character identity, wardrobe, and silhouette continuity.
@Image3: Pact Chamber shot-location variant; environment, lighting, and spatial continuity.

Treat @Image1 as sequential visual keyframes. Follow panel order, action progression, camera rhythm, framing, and pacing. Do not render storyboard markings, arrows, labels, borders, captions, UI, or watermarks.

[TIMESTAMPED SHOT CALL SHEET]
[00:00-00:03] Shot 8: Suri enters the chamber threshold. Camera: low wide push-in. Physics: cloth and hair settle after the step.
[00:03-00:07] Shot 9: Suri draws the blade and turns toward the blue light. Camera: orbit left. Physics: sleeve lag and controlled metal weight.
[00:07-00:12] Shot 10: Suri holds a heroic stance under warm light. Camera: slow pull-back. Physics: subtle breathing and lantern flicker.
```

## Directing Model, Not Description Model

Treat Seedance like a compact film set, not a text-to-video lottery box.

The model behaves best when GraphCore gives it:

- anchored subject identity
- one dominant action
- one dominant camera move
- clear visual styling
- explicit continuity guardrails

If GraphCore asks Seedance to invent identity, action, camera, mood, and pacing all at once from a loose paragraph, outputs drift. The more the system can lock visually before generation, the more usable the clip becomes.

This is especially important for:

- creator-led UGC
- product demos
- app proof shots
- emotional dialogue beats
- multi-beat takes that need continuity

## The Five-Layer Prompt Stack

The most reliable Seedance prompt structure is:

1. Subject
2. Action
3. Camera
4. Style
5. Constraints

This should increasingly become GraphCore's take-prompt assembly model.

### 1. Subject

The subject layer is the identity anchor.

It should specify:

- who or what is central
- the most important visual markers
- what part of the body or object is visible
- where the subject sits in frame

Good subject anchors reduce face drift, wardrobe drift, and prop substitution.

For GraphCore this means take outputs should preserve enough specific identity markers to survive generation:

- age range or life-stage when relevant
- hair silhouette
- signature accessories
- wardrobe state
- product or prop state
- readable screen role when a phone is the proof surface

### 2. Action

Seedance responds best to one dominant motion beat plus at most a small number of secondary micro-motions.

Good dominant actions:

- walks toward camera
- lifts the phone into frame
- turns to show the app screen
- pauses with hand over the drink
- sits down and exhales

Good micro-motions:

- subtle head turn
- small hand gesture
- fabric shift
- hair movement
- blink or tiny expression change

GraphCore should avoid prompting a take as a pile of events. A take should usually have one main motion arc, with the authored `actions` list supporting that arc rather than competing with it.

### 3. Camera

Camera is first-class instruction, not decorative phrasing.

Each shot or take should prefer one primary move:

- locked tripod
- static handheld
- slow push-in
- orbit
- pan
- dolly follow

If the take output mixes several camera intentions without a clear lead instruction, the result is less stable.

For GraphCore this means authored fields like:

- `framing`
- `cameraAngle`
- `cameraMovement`
- `lensPreference`

should resolve to one coherent movement grammar, not several competing ideas in one take.

### 4. Style

Style should be concrete and visual, not abstract mood language.

Prefer:

- lighting direction
- palette
- texture
- environmental particles or haze
- realism level

Avoid relying on vague words like:

- cinematic
- epic
- beautiful
- stunning
- lots of movement

Those words do not tell the model what pixels to render.

### 5. Constraints

Constraints are what stop drift.

Useful constraints include:

- exact duration
- realism level
- stable face and wardrobe
- no jitter
- no morphing
- smooth pacing
- readable product or screen
- continuity of prop position

GraphCore should treat constraints as part of the take package, not as optional suffix text.

## How This Should Change GraphCore Take Outputs

The final take output is not just script metadata. It is the basis of the generation prompt that will be sent into Seedance. That means take authoring should increasingly package each take as a directable generation unit.

Recommended translation from GraphCore fields into the Seedance mental model:

- `beat`
  - summarize the dominant visual event, not every event that happens
- `dialogue`
  - keep lines spoken and shootable, not essay-like
- `actions`
  - support one dominant motion beat plus a few micro-motions
- `framing`, `cameraAngle`, `cameraMovement`, `lensPreference`
  - resolve into one clear camera plan
- `visualPrompt`
  - carry subject, action, camera, and style in that order
- `compositionGuide`
  - carry continuity, readability, and blocking constraints
- `audio`
  - stay concrete and physical rather than abstract

Practical take-writing guidance:

- one take should usually revolve around one dominant action
- one take should usually have one dominant camera move
- style should decorate the motion, not replace it
- prompts should explicitly protect identity and prop continuity
- the system should avoid overloading a take with too many action changes

## Reference-Led Generation

The cleanest Seedance results usually come from reference-led prompting.

References should carry most of the burden for:

- identity
- wardrobe
- prop continuity
- composition
- motion rhythm
- mood

Then the text prompt can act more like direction than invention.

GraphCore should keep pushing toward reference-first generation for:

- characters
- products
- app screens
- storyboard layouts
- composite subject-plus-prop packs

## Character Concept Art Should Be Reference-Ready

Character concept art for Seedance-adjacent workflows should not default to poster art.

For video continuity, the most useful character reference set is:

- neutral front or three-quarter portrait
- side profile
- full-body view
- stable wardrobe state
- clean or low-noise background
- consistent lighting and lens feel

The goal is not just "beautiful character art." The goal is a reusable identity lock that can survive into:

- take stills
- shot stills
- storyboard panels
- composite refs
- final video generation

For GraphCore this implies:

- character concept prompts should preserve a small set of signature markers
- wardrobe and accessories should stay stable unless a change is intentional
- backgrounds should not overpower the subject when the image is meant to act as a reference
- a concept image intended for continuity should prefer clarity and reuse over spectacle

## Product, App, And Proof-Surface References

For product or app-led takes, GraphCore should treat proof surfaces as dedicated subject anchors.

Examples:

- product in hand with label readable
- phone screen in over-shoulder orientation
- app UI in a believable hand-held context
- receipt, package, or countertop proof framed for legibility

The take prompt should be explicit about whether the proof surface is:

- the hero subject
- a secondary subject
- a continuity prop
- an insert proof beat

## Prompt Hygiene And Failure Modes

Words that often degrade output unless qualified:

- fast
- epic
- beautiful
- stunning
- cinematic
- lots of movement

Instead of those labels, specify:

- what moves
- how fast it moves
- what the camera does
- what the lighting looks like
- what must stay stable

If a phrase does not help Seedance decide visible pixels, motion, or continuity, it is probably noise.

## Storyboard Guidance

Use a sequence board when:

- the sequence has more than one shot
- continuity matters across cuts
- the camera language needs to stay close to a planned structure

Use shot panels when:

- a specific shot needs tighter framing control
- action blocking is complex
- you need Seedance to preserve a precise beat or composition

Sequence boards and panels should be clear, high-contrast, and easy to read. Avoid heavy text overlays.

## Composite Reference Guidance

Use `composite_ref` nodes when subject continuity is likely to drift.

Good cases:

- hero with signature weapon
- hero in final costume state
- rider on mount
- duo pairing that must read as one stable unit

Composite references should be generated as clean continuity frames, not poster art.

When a take needs strong identity retention, it is often better to use:

- neutral subject refs
- composite subject-plus-prop refs
- storyboard layout refs

than to rely on descriptive prompt text alone.

## Dialogue And Audio

Dialogue and audio are now first-class shot data.

Use dialogue beats for:

- speaker
- line
- delivery
- lip-sync intent

Use audio beats for:

- ambience
- SFX
- music
- offscreen sounds
- intentional silence

Keep audio direction concrete. Seedance generates native audio, so prompts like `metal scrapes on stone`, `wind through broken arches`, or `breathing close to mic` work better than abstract mood labels.

For creator-led UGC specifically, prefer audio cues like:

- close mic room tone
- soft breath before speaking
- thumb tap on phone glass
- distant kitchen ambience
- bedding rustle

over abstract mood labels like `cozy`, `emotional`, or `cinematic tension`.

## Integration Checklist For GraphCore

When GraphCore prepares a take for Seedance, the system should increasingly ensure:

- the take has one clear subject anchor
- the take has one dominant action
- the take has one primary camera move
- style language is concrete and visual
- continuity constraints are explicit
- proof surfaces are named and readable when required
- reference roles are clear:
  - subject lock
  - prop lock
  - environment lock
  - storyboard/layout lock
  - style lock

This should influence not only final take prompt assembly, but also:

- character concept art generation
- product concept and proof still generation
- storyboard layout generation
- composite reference generation
- preset-specific UGC capture recommendations

## GraphCore Example

Prompt:

```text
Character A uses Sword B to fight Character C in Location D.
```

Expected planning outcome:

- entity refs: `A`, `B`, `C`, `D`
- relationships:
  - `A equip B`
  - `A targets C`
  - `A located_in D`
- composite ref:
  - `A with B`
- storyboard:
  - sequence board
  - per-shot panels if multiple shots
- shots:
  - establishing or setup shot
  - action clash shot
  - insert or reaction shot when useful

Expected graph shape:

- direct refs for `A`, `B`, `C`, `D`
- composite ref for `A with B`
- storyboard refs for sequence board and shot panel
- shot nodes connected in flow order
- reference edges from direct refs, composite refs, and storyboard refs into each shot

## Current Practical Notes

- `preview_still` remains a fallback still-generation path.
- `preview_video` and `graph_run` are Seedance-first.
- Execution plans are stored on shot metadata so the exact packed reference set can be inspected and replayed.

## Cinematic Storyboard And Still Polling Notes

GraphCore cinematic preview images now follow an asset-first async queue pattern.

For `preview_storyboard_still` and other cinematic preview image jobs:

1. `start-cinematic-run` reserves the final asset key immediately.
2. The take or storyboard node is bound to that same key immediately.
3. The Fal job is submitted and the job stores:
   - `provider_request_id`
   - `statusUrl`
   - `responseUrl`
4. `poll-cinematic-run` uses those exact provider URLs to fetch completion state.
5. On success, `poll-cinematic-run` updates the reserved asset row in place with final `sourceUrl` and `previewUrl`.

GraphCore now also passes Fal `webhook_url` on these queue submissions.

Current completion order is:

1. Fal webhook posts a terminal result to `fal-webhook`
2. `fal-webhook` verifies the Fal signature and finalizes the reserved asset when the payload is usable
3. `poll-cinematic-run` remains the fallback path if webhook delivery fails or the webhook payload is not sufficient to materialize the asset

Treat polling as recovery, not the only completion mechanism.

Do not change this back to a blocking one-shot subscribe flow for slow storyboard edit jobs. The request can exceed Supabase edge idle limits before the provider completes.

### Fal Nano Banana Edit Notes

For reference-driven storyboard generation:

- use `fal-ai/nano-banana-2/edit`
- pass resolved image references as `image_urls`
- do not rely on reconstructed queue URLs when polling; use Fal's returned URLs from submit

If a storyboard run submits successfully but polls forever:

- confirm the job has `provider_request_id`
- confirm `statusUrl` and `responseUrl` are present in `result_context`
- inspect server-side polling logs before changing prompt logic
