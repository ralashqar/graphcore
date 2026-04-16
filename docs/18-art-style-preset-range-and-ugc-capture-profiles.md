# Art Style Preset Range And UGC Capture Profiles

This document records the current direction for expanding GraphCore's art style preset system, especially for photoreal UGC where "style" is really a mix of rendering language, capture profile, camera behavior, and realism guardrails.

## Why The Old System Was Too Shallow

The earlier preset system mostly stored:

- `label`
- `promptLabel`
- `description`
- `group`

That was enough for broad CG and illustration direction, but it was too coarse for photoreal UGC. Realistic people content is much more sensitive than stylized CG because small prompt mistakes immediately produce:

- over-polished ad lighting
- beauty-filter skin
- fake lens behavior
- unnatural field of view
- too much depth of field blur
- "CG person pretending to be a creator" energy

## New Direction

Art style presets now support richer prompt metadata:

- modality
- sensitivity
- best-for guidance
- capture medium
- camera profile
- lens profile
- lighting profile
- texture profile
- color profile
- negative guardrails

This lets a preset describe not only the visual look, but also the capture logic.

## UGC Capture Profiles Added

The preset catalog now includes a broader `Photoreal UGC` range, including:

- `ugc_lifestyle_people`
- `ugc_phone_selfie_soft_daylight`
- `ugc_phone_rear_28_home_demo`
- `ugc_phone_35_testimonial`
- `ugc_car_confessional_soft`
- `ugc_bathroom_mirror_get_ready`
- `ugc_creator_desk_windowlight`
- `ugc_tabletop_daylight_demo`
- `ugc_app_demo_over_shoulder_phone`
- `ugc_receipt_proof_countertop`
- `ugc_founder_softbox_clean`
- `ugc_unboxing_handheld_home`

These are not just naming variants. Each one encodes a different camera-and-lighting assumption.

## Key UGC Principles

### 1. Treat photoreal UGC as capture profiles, not just art styles

For social-native realism, "phone selfie" and "rear-camera home demo" are meaningfully different presets even if both are photoreal.

### 2. Use phone-native lens language

GraphCore should prefer realistic smartphone-equivalent framing guidance for UGC people rather than vague "photoreal mobile photo" wording.

Examples:

- selfie-wide social framing
- 28mm-equivalent rear-camera demo look
- 35mm-equivalent testimonial crop

### 3. Encode realism through negatives

For photoreal UGC, negative guardrails matter as much as positive style direction.

Examples:

- avoid cinematic rim light
- avoid poreless skin
- avoid impossible shallow depth of field
- avoid luxury campaign polish
- avoid hyper-symmetric CG faces

### 4. Keep prompt builders responsible for applying the style package

The preset system should not only power dropdown labels. The cinematic prompt builders should inject the richer camera, lighting, texture, and guardrail directives into prompt assembly.

## Integration Notes

The current integration path is:

- `src/domain/artStylePresets.ts`
  - richer preset metadata, prompt directive helpers, and subtype-aware recommended capture-profile resolution
- `supabase/functions/_shared/cinematics.ts`
  - inject preset-owned style directives into still and storyboard prompt assembly
  - resolve an effective cinematic art style so UGC graphs can use subtype-appropriate capture presets without changing the project-global style
- global workspace and onboarding
  - show richer "best for" guidance when selecting presets
- cinematics workspace
  - show the effective art style and whether GraphCore is using a recommended capture override
  - allow graph-level and shot/take-level art style preset overrides without changing the project-global style
  - store a separate inferred graph capture preset plus a `useInferredArtStyle` toggle so users can disable subtype-driven capture overrides and fall back to the project-global art style

## Recommended Future Improvements

### 1. Map cinematic preset families to recommended art styles

Examples:

- `ugc_creator`
  - default toward selfie, rear-camera home demo, desk windowlight
- `ugc_direct_response_ad`
  - default toward rear-camera demo, 35mm testimonial, tabletop daylight, receipt proof
- `ugc_faceless_format`
  - default toward tabletop daylight, app-demo over shoulder, receipt proof, unboxing

### 2. Add style examples or reference boards

High-sensitivity photoreal presets will improve further if each preset eventually has:

- one or more reference stills
- negative examples
- short prompt exemplars

### 3. Split project-global style from per-graph capture profile

Longer term, it may make sense to separate:

- universal world style
- cinematic capture style

This is especially useful for projects that combine:

- stylized game worlds
- photoreal UGC ads
- product tabletop shots
- surreal faceless formats

## Practical Default

If GraphCore needs one strong default for photoreal person-led UGC, the safest preset is:

- `ugc_phone_rear_28_home_demo`

It is the most broadly useful compromise between:

- believable phone-native realism
- flattering perspective
- product readability
- creator-plus-product composition
