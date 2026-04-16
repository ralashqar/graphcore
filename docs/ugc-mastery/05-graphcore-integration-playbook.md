# GraphCore Integration Playbook

This document translates the UGC mastery docs into implementation-facing guidance for GraphCore presets, prompt guidance, and script generation.

## Start With Existing Fields

GraphCore already has the right first-pass metadata model for UGC. Use it consistently before adding more schema.

## Preset Family Selection

### `story_movie_tv`

Use when the output depends on:

- scene continuity
- dramatic progression
- richer environment blocking
- film or TV camera grammar

### `ugc_creator`

Use when the output depends on:

- parasocial trust
- creator voice
- identity validation
- believable handheld or phone-native delivery

### `ugc_direct_response_ad`

Use when the output depends on:

- pain to product to proof
- visible mechanism
- explicit persuasion
- stronger CTA intent

### `ugc_faceless_format`

Use when the output depends on:

- process
- object clarity
- screens
- visual explanation
- aesthetic or satisfying motion without heavy face performance

## Format Subtype Selection

Use `formatSubtype` to describe the delivery pattern, not just the topic.

Recommended mapping:

- `creator_problem_solution`
  - creator explains pain, use case, and practical relief
- `creator_reframe`
  - creator redirects a judged behavior
- `creator_validation`
  - creator says what the viewer already feels
- `ad_problem_solution`
  - direct pain to solution with clear proof
- `ad_mechanism_proof`
  - show why the product works and what it visibly changes
- `ad_before_after`
  - transformation with strong state contrast
- `ad_comparison`
  - option A vs option B, one clear winner
- `faceless_demo`
  - product or object visibly doing the job
- `faceless_explainer`
  - belief reset or "you are doing it wrong" format
- `faceless_process`
  - satisfying progression and reveal
- `contrast_narrative`
  - multi-beat escalating split-screen or status comparison engine

## Formula Family Selection

Choose `formulaFamily` before writing the shots.

Recommended defaults:

- `problem_solution`
  - most direct-response and creator utility clips
- `reframe`
  - identity-protective behavior redirects
- `validation`
  - emotional resonance and save/share content
- `doing_it_wrong`
  - hidden mistake explainers
- `mechanism_proof`
  - why-it-works plus demo
- `mistake_warning`
  - mild danger hook plus correction
- `before_after`
  - clear transformation
- `contrast_comparison`
  - side-by-side choice logic
- `contrast_narrative`
  - status and tension escalation across many beats
- `personal_confession`
  - trust-earning vulnerable opener

## Dominant Trigger Selection

Choose one dominant trigger per clip unless there is a very clear stacked design.

Useful defaults:

- `curiosity_gap`
  - hidden mistake, missing variable, unexplained mechanism
- `status_comparison`
  - contrast narratives, option-vs-option, aspirational splits
- `belief_reset`
  - wrong-belief or myth-busting hooks
- `social_proof`
  - community interest, visible adoption, shared validation
- `parasocial_reassurance`
  - creator intimacy and emotional safety
- `transformation_desire`
  - beauty, wellness, glow-up, performance improvement
- `guilt_pressure`
  - use carefully, mainly when responsibility is real and not shaming
- `defiance_trigger`
  - "this is not for everyone" or "most people ignore this"

## Hook Role Guidance

Use `hookRole` to keep the script legible:

- `hook`
  - first stop-scroll image or line
- `setup`
  - problem context, identity setup, or situation framing
- `proof`
  - mechanism, demo, evidence, comparison
- `payoff`
  - relief, reveal, winner frame, transformed state
- `cta`
  - next action, soft ask, or stronger direct-response close

Recommended shot logic:

1. hook
2. setup
3. proof
4. payoff
5. CTA

Add extra proof or escalation beats only when they truly widen the argument.

## Reference Strategy

GraphCore's existing ref types should be used more deliberately.

### `creator_identity_ref`

Use for:

- creator-native UGC
- persona stability
- consistent look and feel across variants

### `product_hold_ref`

Use for:

- creator plus product continuity
- app-in-hand or product-in-hand proof
- beauty, wellness, supplement, tool, and device demos

### `demo_proof_ref`

Use for:

- before/after proof
- visible mechanism
- screen plus result
- product plus transformed object

### `sequence_board_ref` and `shot_panel_ref`

Use more aggressively for:

- contrast narratives
- before/after structures
- faceless process formats
- any format where the visual progression matters more than actor dialogue

## What The Planner Should Explicitly Decide

Before generating a UGC script, the planner should explicitly decide:

1. preset family
2. format subtype
3. formula family
4. dominant trigger
5. target emotion
6. proof type
7. proof moment
8. CTA style
9. contrast axis if relevant
10. persona style if creator-led

If those are left implicit, the script tends to collapse into generic short-form copy.

## Prompt Guidance Upgrades

The planner and repair prompts should continue enforcing these rules:

1. First shot must read as a stop-scroll frame.
2. UGC descriptions must stay literal and on-screen.
3. Proof beats should show evidence, not abstract emotion.
4. Product shots should show the product working.
5. Middle beats should escalate through different dimensions, not repeat one idea.
6. Endings should land as proof, payoff, or CTA, not decorative filler.

## Suggested Near-Term Metadata Additions

Only add these if the team needs them for iteration memory:

- `winningAngle`
- `variationGroupId`
- `trendSource`
- `performanceHypothesis`
- `lineageParentId`

These are useful, but they are second-order improvements after better prompt guidance.

## Evaluation Checklist

Before approving a generated UGC script, check:

1. Does frame one deploy a real attention mechanism?
2. Does the script protect identity instead of blaming the viewer?
3. Is the formula family intentional?
4. Is there a clear dominant trigger?
5. Is the proof visible on screen?
6. Does the middle escalate instead of repeating?
7. Does the ending land as proof, payoff, or CTA?
8. Do the refs support the intended continuity?

## Recommended Immediate Product Work

The fastest practical improvements are:

1. Teach preset selection to be more deliberate.
2. Tighten prompt guidance for hook image, visible proof, and persona selection.
3. Expand preset docs so humans and future agents choose `formulaFamily` and `dominantTrigger` intentionally.
4. Use the new UGC mastery docs as the reference source for future preset and scripting changes.
