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
