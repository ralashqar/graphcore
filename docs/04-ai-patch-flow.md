# AI Patch Flow

Prompt-based edits never write directly to authoring tables.

1. Generate a `PatchOperation[]` proposal.
2. Store it as a `patch_set`.
3. Review the diff in the editor.
4. Apply through a transactional patch function.
5. Recompile and publish a release bundle.

The initial edge functions in `supabase/functions/prompt-patch` and `supabase/functions/apply-patch` provide the first reviewable workflow foundation.
