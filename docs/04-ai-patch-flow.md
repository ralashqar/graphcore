# AI Patch Flow

Prompt-based edits never write directly to authoring tables.

1. Generate a `PatchOperation[]` proposal.
2. Store it as a `patch_set`.
3. Review the diff in the editor.
4. Apply through a transactional patch function.
5. Recompile and publish a release bundle.

The initial edge functions in `supabase/functions/prompt-patch` and `supabase/functions/apply-patch` provide the first reviewable workflow foundation.

Provider-backed AI transport now lives behind `supabase/functions/ai-openai` and `supabase/functions/ai-fal`, so prompt-based graph generation can call models without exposing API keys in the client.

The current prompt-to-graph flow uses `prompt-patch` as the domain-aware orchestration layer. It builds a graph/content-aware system prompt, calls OpenAI Responses through the shared transport, validates the returned `PatchOperation[]`, stores the proposal in `patch_sets`, and only then exposes it for manual review and apply.
