# 20. World Prompt Architecture

This document explains the current world prompt builder for a new engineer taking over the system.

## Summary

As of April 24, 2026, the system is in a v2 transition:

- conservative mutation is enforced server-side
- normal mutating turns apply immediately instead of entering preview / approval queues
- abrupt prompt shifts auto-pivot focus instead of letting stale thread context dominate
- session continuity uses structured JSON memory in `world_prompt_sessions.last_context.memoryState`
- turn resolution is explicit before planning:
  - `resolvedMode`
  - `resolvedIntent`
  - `resolvedFocus`
- retrieval diagnostics are persisted for debugging relevance decisions
- suggestion rows now carry machine-readable targeting metadata, not just prompt text
- entity summaries, contexts, and relationship notes reconcile new detail into compact canon text while preserving prior phrasing in append-only `metadata.refinementHistory`

The world prompt system is not a generic chatbot. It is a world-authoring pipeline that:

1. receives a user prompt plus current world workspace context
2. retrieves the most relevant graph context for that turn
3. asks the LLM for structured planning or advisory output
4. classifies the result into apply / preview / advisory / blocked behavior
5. applies safe graph mutations or persists guidance and suggestions
6. stores the entire turn as session, message, event, and suggestion state

## Creativity Policy

Canon content is LLM-authored only.

That means:

- node names, summaries, lore, factions, groups, and other creative canon must come from the hosted planner
- the backend must not deterministically invent fallback canon if hosted planning fails
- if the planner cannot return valid structured canon after one repair retry, the turn fails or degrades to non-mutating advisory / preview behavior rather than writing deterministic placeholder content

Deterministic logic still exists, but only for orchestration:

- intent routing
- focus and continuity detection
- retrieval anchoring and reranking
- mutation safety checks
- approval gating

Those heuristics decide what context the planner sees and whether an op is safe to apply. They do not author canon names or world facts.

The main backend lives in:

- `supabase/functions/_shared/world-prompt.ts`
- `supabase/functions/start-world-prompt-turn/index.ts`

The main frontend surfaces are:

- `src/features/worldGraphPage.tsx`
- `src/features/world/worldPresentation.ts`

The request/response/event types live in:

- `src/domain/worldPrompt.ts`

## High-Level Turn Flow

For each prompt turn:

1. The client calls `start-world-prompt-turn` with:
   - current world prompt session key
   - prompt text
   - selected suggestion id if any
   - selected root entity / selected view / selected thread
   - current project snapshot

2. The backend:
   - ensures or creates a prompt session
   - loads existing session messages
   - compacts long message history into rolling session memory
   - inserts a `world_prompt_turn`
   - inserts the user message
   - starts writing `world_prompt_events`

3. Before the LLM call, the backend builds a retrieval packet from the graph.

4. The LLM receives:
   - planner instructions
   - project context guidance
   - graph diagnostics
   - the compact retrieval packet

5. The LLM returns strict structured JSON only.

6. The backend:
   - validates the planner response
   - repairs underspecified descriptor references so direct world-building turns reuse a strong existing match or require a concretely named new entity instead of writing placeholder canon
   - retries the hosted planner once if it still emits placeholder entities or unresolved descriptor-only relationship endpoints
   - fails the mutating path if hosted planning still cannot return canon-ready structured output instead of inventing deterministic fallback canon
   - sanitizes ops
   - classifies execution mode
   - applies safe ops immediately for actionable turns
   - skips risky unresolved ops with an assistant note instead of sending them into a manual approval queue
   - persists suggestions, assistant message, turn metadata, session memory, and planner events

7. Realtime events update the chat UI.

## Core Mental Model

The graph is the source of truth. Chat history is continuity only.

That means:

- do not assume the LLM "remembers" the world from prior turns
- do not treat session memory as factual canon
- rebuild relevant graph context fresh on every turn
- keep canonical node/edge text compact for retrieval, but preserve refinement history in metadata instead of losing older detail

The current priority order is:

1. current prompt
2. current UI focus
3. recent working set
4. older session context

## Planner Modes

The planner currently has internal execution modes:

- `direct_build`
- `refinement`
- `advisory_diagnosis`

These are chosen deterministically before the OpenAI call.

### `direct_build`

Used for straightforward create / expand prompts.

Typical outputs:

- `classification`
- `assistantSummary`
- `wave1Ops`
- `threadCandidates`
- `suggestionCandidates`

### `refinement`

Used when the prompt is mainly enriching existing world facts.

Typical outputs:

- `update_entity`
- `update_relationship`
- compact assistant summary

### `advisory_diagnosis`

Used for questions and gap-analysis prompts such as:

- "what should we add?"
- "what locations fit this world?"
- "what is weak here?"

Typical outputs:

- `answer`
- `answerMode`
- `optionCandidates`
- `diagnosticFindings`
- optional `wave1Ops` if the user clearly asked for applied change

## Retrieval Layer

This is the most important part of the current design.

Earlier versions sent broad snapshot slices into the planner and let the model infer relevance. That caused drift, stale-thread contamination, and poor advisory answers.

The current system builds a retrieval packet first.

### Retrieval Phases

Retrieval is done in this order:

1. intent + focus detection
2. deterministic anchor retrieval
3. graph-local expansion
4. Postgres FTS retrieval
5. score + rerank
6. compact context packet assembly

### Intent / Focus Detection

For each turn, the backend resolves:

- `promptIntent`
  - `graph_build`
  - `refinement_only`
  - `advisory_question`
  - `graph_diagnosis`

- `focusLayer`
  - `actor`
  - `group`
  - `place`
  - `concept`
  - `event`
  - `object`
  - `general`

- `continuityMode`
  - `follow_up`
  - `topic_shift`
  - `fresh_question`

- `resolvedIntent`
  - `graph_build`
  - `refinement`
  - `advisory`
  - `diagnosis`

- `resolvedMode`
  - `answer_only`
  - `preview_first_wave`
  - `apply_compact_wave`
  - `blocked`

- `resolvedFocus`
  - `current_focus`
  - `pivot_focus`
  - `background_focus`

The point of `continuityMode` is to stop older thread context from dominating when the user changes topic mid-chat.

The point of the resolved turn contract is to make the backend decide the conservative behavior before the planner call, instead of inferring execution mode only after model output.

### Deterministic Anchors

Before anything semantic, the system anchors on:

- explicitly mentioned entities
- selected root entity
- selected view root entity
- selected thread and linked entities
- selected suggestion target entity keys / thread keys
- active structured session focus
- recent touched entities only when the turn is a real follow-up

### Graph-Local Expansion

From the anchors, the system expands by graph structure:

- 1-hop neighboring entities
- strong relationships
- unresolved linked threads
- type-aware nearby structures

Examples:

- location questions prefer `place -> group / concept / event`
- character questions prefer `actor -> group / place / relationship`
- concept questions prefer `concept -> group / event / place`

### Postgres FTS Retrieval

v1 uses deterministic retrieval plus server-side Postgres full-text search.

Searchable text is stored on:

- `world_entities`
- `world_relationships`
- `world_threads`

The migration is:

- `supabase/migrations/20260424095004_world_prompt_search_documents.sql`

It adds:

- `search_document` columns
- refresh triggers
- GIN indexes
- `public.world_prompt_search_resources(...)`

FTS is used as a semantic fallback and supplement, especially for:

- broad advisory prompts
- fresh chats over large graphs
- prompts with no explicit entity names

Thread search is also expanded by linked entity names and aliases, not just thread titles, summaries, and raw linked keys.

### Retrieval Scoring

After anchors and FTS hits are gathered, the backend scores and reranks:

- anchor hits
- selected root / selected thread
- active focus memory
- background focus memory
- frontier entities from recent turns
- FTS hits
- relationship strength / confidence
- focus-layer type fit
- thread priority

The planner packet now also separates:

- answer context
- mutation context
- background context

This keeps advisory turns narrower when the user suddenly asks about a different world area.

## Retrieval Packet Shape

The planner does not receive a raw graph dump anymore. It receives a compact retrieval packet that includes:

- `promptIntent`
- `plannerMode`
- `focusLayer`
- `continuityMode`
- `selectedRootEntity`
- `selectedView`
- `selectedThread`
- `relevantEntities`
- `relevantRelationships`
- `relevantThreads`
- `graphSignals`
- `recentMessages`
- `sessionMemory`

Important detail:

- recent chat messages are continuity support only
- world facts should come from retrieved graph context, not from message history

## Session Memory

Rolling prose memory is stored on `world_prompt_sessions.summary_memory`, but it is no longer used as the primary structured continuity layer.

Structured continuity lives in `world_prompt_sessions.last_context.memoryState`.

It tracks:

- `activeFocus`
- `backgroundFocus`
- `frontierEntityKeys`
- `recentThreadKeys`
- `recentTurnSummaries`
- `lastContinuityMode`
- `lastPlannerMode`
- `lastRetrievedKeys`

The important rule is unchanged:

- graph facts come from fresh graph retrieval
- structured session memory helps continuity and scoping
- raw chat history is support context only

Turn metadata also stores retrieval diagnostics:

- `focusLayer`
- `continuityMode`
- `retrievedEntityKeys`
- `retrievedThreadKeys`
- `resolvedMode`
- `resolvedIntent`
- `resolvedFocus`
- `retrievalDiagnostics`

These are useful for debugging bad relevance decisions.

## Classification and Execution

After the planner returns, the backend classifies the result into execution behavior:

- direct apply
- preview
- blocked / clarification
- advisory

### Direct Apply

Safe ops are applied immediately.

Examples:

- `upsert_entity`
- `update_entity`
- `upsert_relationship`
- `update_relationship`

### Preview

Broad requests can stage a first wave and persist a preview instead of applying everything immediately.

### Blocked / Clarification

If the request is contradictory or unclear, the turn persists repair / clarification suggestions instead of mutating the graph.

### Advisory

Questions can return:

- short answer
- diagnostic findings
- options / suggestions

without mutating the graph by default.

## Conservative Mutation Rules

The v2 default is conservative mutation.

Auto-apply is only for compact additive ops that:

- resolve targets cleanly
- do not touch canon-locked entities or relationships
- do not rename or semantically rewrite existing canon
- do not widen scope too far for one turn

Anything riskier is either:

- held in preview, or
- emitted as `op_needs_approval`

The execution path no longer force-coerces approval-needed ops back to auto-apply.

## Suggestions

Suggestions are persisted rows, not just transient UI buttons.

They can represent:

- next moves
- clarification options
- diagnostic gaps
- advisory options

If a suggestion is selected:

- the next turn carries `selectedSuggestionId`
- scope is intentionally narrower
- suggestion-driven turns are treated as a compact fast path

If the user ignores suggestions and types freeform text:

- the session still continues normally
- the graph retrieval layer rebuilds context fresh from graph truth

## Events and UI

The UI is event-driven.

Important event types include:

- `turn_started`
- `planner_status`
- `assistant_note`
- `op_applied`
- `queue_started`
- `turn_completed`
- `turn_failed`

Planner progress shown in the UI is currently synthetic and phase-based, not raw token streaming.

That is intentional:

- safer
- cheaper
- easier to replay from persisted events

## Safety Rules

The system tries to stay additive by default.

Key rules:

- new proper nouns usually become new nodes
- refinement should prefer updating summary / context / notes
- `replace_entity` is for explicit correction flows, not incidental inference
- risky semantic rewrites can still require approval

Advisory prompts are now also instructed to treat graph names as original project canon by default.

The planner should not speculate that your characters or places map to external IP unless the user explicitly asks for that.

## Where To Debug First

If a turn feels wrong, debug in this order:

1. turn metadata
   - `focusLayer`
   - `continuityMode`
   - `retrievedEntityKeys`
   - `retrievedThreadKeys`

2. session memory
   - look for stale working-set carryover

3. retrieval packet assembly in `generatePromptPlan(...)`

4. planner instructions and prompt payload

5. emitted `world_prompt_events`

6. only then the frontend rendering

Most "bad answer" issues are now retrieval or classification issues, not UI issues.

## Current Limitations

This is still retrieval v2 without embeddings.

Important limitations:

- no embeddings yet
- no model reranker yet
- client still sends the current snapshot, even though the backend now narrows it aggressively before the LLM call
- the client snapshot is still the request contract, although apply paths now refresh touched entities / threads from live DB before mutating
- retrieval is world-chat only for now

The next likely evolution would be:

- move more retrieval fully server-side against DB state
- add embeddings or reranking if FTS proves too weak for large worlds
- reuse the same retrieval core for other authoring surfaces

## File Map

Main files to understand:

- `supabase/functions/_shared/world-prompt.ts`
- `supabase/functions/start-world-prompt-turn/index.ts`
- `src/domain/worldPrompt.ts`
- `src/features/worldGraphPage.tsx`
- `src/features/world/worldPresentation.ts`
- `supabase/migrations/20260424095004_world_prompt_search_documents.sql`

If you are taking over this system, start in `world-prompt.ts`. That file owns almost all of the backend planning, retrieval, sanitization, execution, and suggestion lifecycle.
