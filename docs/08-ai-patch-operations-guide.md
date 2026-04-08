# AI Patch Operations Guide

## Purpose
This document captures the current GraphCore AI request/response and patch-application flow, plus the failure modes that repeatedly appeared during implementation.

Use it when extending:
- prompt-to-graph generation
- prompt-to-content generation
- patch validation and repair
- Edge Function auth/CORS
- frontend prompt/apply UX

## Current Architecture

### Request path
1. The frontend builds a `PromptPatchRequest`.
2. The frontend calls the hosted `prompt-patch` Edge Function.
3. `prompt-patch` runs one or more OpenAI Responses API calls.
4. The model returns JSON text representing a `PromptPatchResponse`.
5. The backend repairs common model mistakes.
6. The backend validates operations against the current snapshot.
7. The proposal is stored in `patch_sets`.
8. The frontend shows the proposal for review.
9. The frontend calls `apply-patch` only after explicit review.

### Apply path
1. The frontend sends `draftId`, optional `patchSetId`, and `PatchOperation[]` to `apply-patch`.
2. `apply-patch` executes the operations against Supabase tables.
3. If `patchSetId` is provided, the patch set status is updated to `applied`.
4. The frontend reloads the live snapshot and re-renders the graph/content state.

## Important Files

### Frontend
- [App.tsx](c:/Users/daruk/Projects/GraphCore/graphcore/src/App.tsx)
- [graphcoreRepository.ts](c:/Users/daruk/Projects/GraphCore/graphcore/src/data/graphcoreRepository.ts)
- [prompting.ts](c:/Users/daruk/Projects/GraphCore/graphcore/src/domain/prompting.ts)
- [patchUtils.ts](c:/Users/daruk/Projects/GraphCore/graphcore/src/domain/patchUtils.ts)

### Backend
- [prompt-patch/index.ts](c:/Users/daruk/Projects/GraphCore/graphcore/supabase/functions/prompt-patch/index.ts)
- [apply-patch/index.ts](c:/Users/daruk/Projects/GraphCore/graphcore/supabase/functions/apply-patch/index.ts)
- [bootstrap-workspace/index.ts](c:/Users/daruk/Projects/GraphCore/graphcore/supabase/functions/bootstrap-workspace/index.ts)
- [prompt-patch.ts](c:/Users/daruk/Projects/GraphCore/graphcore/supabase/functions/_shared/prompt-patch.ts)
- [auth.ts](c:/Users/daruk/Projects/GraphCore/graphcore/supabase/functions/_shared/auth.ts)
- [http.ts](c:/Users/daruk/Projects/GraphCore/graphcore/supabase/functions/_shared/http.ts)

## Request Contract

### Prompt request
`PromptPatchRequest` currently includes:
- `prompt`
- `snapshot`
- `context`
- `targetMode`
- `graphType`
- `model`

### Prompt response
`PromptPatchResponse` currently includes:
- `summary`
- `operations`
- `diagnostics`
- optional `assistantNotes`
- optional `debugRawOutput` for developer troubleshooting only

The UI should not surface `debugRawOutput`. It should log it to the console for developer inspection and keep the user-facing diagnostics concise.

## Generation Strategy

### Current model strategy
Prompt generation is split into smaller passes:

1. Content pass
- Only content support operations
- Reuses existing archetypes whenever possible
- Creates missing items or archetypes only when needed

2. Graph pass
- Only graph operations
- Uses content keys created or reused in the content pass
- Builds graph structure, choices, conditions, effects, and edges

### Why this split exists
One-shot graph generation was unreliable because the model often:
- returned truncated JSON
- mixed content scaffolding and graph scaffolding together
- invented unsupported patch shapes
- used too many output tokens on prose instead of operations

## Baseline Seeding

Fresh live projects should not require the model to invent the base item archetypes every time.

Baseline archetypes are seeded during live bootstrap and healed on live snapshot load:
- `item.consumable`
- `item.utility`
- `item.progression_token`

Seed definitions live in:
- [bootstrapSeeds.ts](c:/Users/daruk/Projects/GraphCore/graphcore/src/domain/bootstrapSeeds.ts)

If prompt generation starts creating these archetypes repeatedly, first check whether seeding failed or the snapshot being sent to the model is stale.

## Validation and Repair

### Repair layer
The repair layer exists because models frequently drift into near-correct but invalid patch dialects.

Current repairs normalize mistakes like:
- `definitionKey` instead of `key`
- malformed `create_graph`
- malformed `create_node`
- malformed `connect_edge`
- `kind: "token"` instead of `kind: "item"`
- flat `add_archetype_field` payloads

### Validation layer
Validation should reject:
- unsupported ops
- missing graph/node references
- incompatible templates
- missing archetype references
- missing asset references
- oversized per-pass proposals

Validation should not reject a patch only because the model returned informational `diagnostics`.

## Edge Function Rules

### Auth
For the current hosted setup:
- `prompt-patch`
- `apply-patch`
- `bootstrap-workspace`
- `ai-openai`
- `ai-fal`

should use the shared auth helper and hosted deployment settings intentionally.

Important pattern:
- use [auth.ts](c:/Users/daruk/Projects/GraphCore/graphcore/supabase/functions/_shared/auth.ts)
- validate the bearer token with a service-role client
- create a user-scoped client for actual reads/writes

### JWT verification
Some hosted functions are deployed with `verify_jwt = false` and `--no-verify-jwt`.
This is not “public access”. It is used because the Supabase relay JWT verification was blocking requests before in-function auth ran.

If a function suddenly starts returning `401` before your code runs, verify:
- the function is deployed with the intended JWT verification mode
- the client is explicitly passing `Authorization: Bearer <access_token>`

### CORS
Browser-called functions must use the shared HTTP helpers:
- `maybeHandleOptions`
- `json`
- `errorResponse`

If a function returns raw `Response.json(...)` in some paths and helper-wrapped JSON in others, preflight or error flows will eventually break.

## Common Failure Modes

### 1. Model returned invalid JSON
Typical causes:
- output truncated mid-object
- output wrapped in prose or code fences
- too many operations in one pass

Preferred fixes:
- reduce verbosity requirements
- split generation further
- keep ops compact
- increase `maxOutputTokens` only when necessary

### 2. Prompt misclassified as content instead of graph
Typical cause:
- frontend sent `target: "content"` and left `targetMode` ambiguous

Preferred fixes:
- infer graph intent from the prompt text
- infer `new_graph` and `graphType` server-side as a fallback

### 3. Edge Function 401
Typical causes:
- bearer token not attached
- function relay JWT verification blocking before in-function auth
- function still using ad hoc auth logic instead of shared helper

### 4. CORS preflight blocked
Typical cause:
- function not using shared HTTP helpers

### 5. Choice node branches exist but no choice rows render
Typical cause:
- branch edges created, but `body.choices` did not round-trip

Current mitigation:
- `apply-patch` now updates choice node rows when branch edges are connected
- snapshot loading now heals missing choice rows from ports and outgoing edges

## Recommendations For Future Prompt Work

### Prefer compact ops
Use:
- `set_node_choices`
- `set_condition`
- `set_effects`
- `set_node_media`

instead of bloated full-node payloads whenever possible.

### Keep effect nodes narrow
Prefer one or two effects per node unless a multi-effect payload is clearly necessary.

### Keep graph text short
Generated story nodes should use brief placeholder narrative text, not full authored scene prose.

### Prefer deterministic structure over creative narration
The model’s first job is to produce valid patch ops. Rich authored prose can be a later prompt/edit step.

### If truncation returns even with high token budgets
Do not keep increasing output size indefinitely.
Instead split graph generation further:
1. graph skeleton
2. graph wiring
3. optional narrative text polish

## Operational Checklist

When adding or changing AI patch behavior:

1. Update the prompt examples in [prompt-patch.ts](c:/Users/daruk/Projects/GraphCore/graphcore/supabase/functions/_shared/prompt-patch.ts).
2. Confirm the op exists in [graphcore.ts](c:/Users/daruk/Projects/GraphCore/graphcore/src/domain/graphcore.ts).
3. Confirm it can be applied in [apply-patch/index.ts](c:/Users/daruk/Projects/GraphCore/graphcore/supabase/functions/apply-patch/index.ts).
4. Confirm local optimistic application works in [patchUtils.ts](c:/Users/daruk/Projects/GraphCore/graphcore/src/domain/patchUtils.ts).
5. Confirm live snapshot loading can round-trip the resulting data shape.
6. Rebuild.
7. Redeploy the touched functions.

## Deployment Reminder

If a fix touches Supabase Edge Functions, the repo change alone is not enough.

You must redeploy the relevant function:
- `prompt-patch`
- `apply-patch`
- `bootstrap-workspace`
- provider relays as needed

If the frontend behavior changed, also restart local dev or redeploy the frontend bundle.
