# Animation studio conversation

The animation studio has a persistent conversation rail alongside the graph and preview, with its composer at the bottom. `PromptMessage` and `PromptChoice` are extracted from the world-builder transcript markup and used by both editors. Existing world-builder labels, styling classes and suggestion handlers remain intact.

Saved animation planner jobs supply user/assistant turns, revision status, failure/review messages and links to changed states. The rail shows the recent jobs returned by the existing read endpoint; it is not a second conversation database. Prompt replies include question context and reuse `plan`, selected scope, ownership, design-credit admission and revision fencing. Undo/history remain available. Clicking a choice cannot generate motion or change gameplay bindings.

## Suggestions

Read-only graph analysis proposes optional questions for missing entry, unreachable states, an unmarked non-looping ending, declared capability gaps and missing clips. It understands machine entries, ancestor transitions and blend references. `terminal` and `standalone` tags record intentional choices; they do not change playback semantics. Suggestions are bounded to five at a time and are not claims of LLM inference. A declared unsupported requirement offers supported alternatives rather than implying provider capability.

Choices submit scoped follow-up prompts. Free text composes an answer with its question context. Use your judgment submits a bounded request to choose a suitable edit. Questions can be dismissed for the current revision and restored. Validation errors disable submission but still allow drafting. The missing-motion action opens the generation/review drawer only, preserving explicit cost/availability controls.

## Persistence and accessibility

Saved turns persist through existing server jobs; selected graph and unsent drafts are remembered locally per project/workspace. Per-revision dismissals are device-local and bounded to 100 records. Graph changes regenerate current questions, so unresolved questions remain until the graph resolves them or they are dismissed. Responses preserve question context in the saved user prompt. The transcript uses an accessible log and follows new turns only while the reader is near its bottom. Ctrl/Cmd+Enter submits the composer, and a synchronous lock prevents duplicate prompt submissions.

## Verification

Suggestion tests cover intentional endings, standalone branches, nested-machine/parent reachability, blend samples and missing entry/capability gaps. The browser fixture selects Hold the final pose, verifies a scoped plan and resolved question, reloads the saved conversation, then continues the existing authoring/preview acceptance flow. Planner responses are simulated and provider requests are blocked. Hosted LLM quality and new Kimodo inference remain outside this evidence.

This is a frontend-only change. No database, Edge or Fly redeployment is needed. Verification: final `npx tsc --noEmit` passed; `npm run build` passed, followed by a final Vite bundle after the preview-control layout correction. The existing suite passed 726 tests with 8 skipped, and all 20 focused studio/suggestion tests passed. Both ordinary and real-saved-motion browser fixtures passed choice replies, terminal gap resolution, conversation reload, unsent-draft recovery, free-text composition, dismissal restoration, scoped edits, undo/redo, nested machines, transition controls and mobile overflow, with no page exceptions. The dev server started at `http://127.0.0.1:5213/` without startup errors. Production builds retain existing large-chunk and landing-image warnings.
