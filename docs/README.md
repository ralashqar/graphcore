# GraphCore Docs

This folder now contains two kinds of documents:

- historical design docs: the older numbered files (`01-08`) that capture earlier intent and planning
- current-state docs: the files below, which describe how the project is actually wired today

If you are an AI agent trying to understand the codebase, start with the current-state docs first.

## Read Order

1. [`09-current-architecture.md`](./09-current-architecture.md)
2. [`10-current-data-model.md`](./10-current-data-model.md)
3. [`11-live-workspace-and-game-flow.md`](./11-live-workspace-and-game-flow.md)
4. [`12-prompt-bootstrap-and-edge-functions.md`](./12-prompt-bootstrap-and-edge-functions.md)
5. [`13-supabase-edge-function-runbook.md`](./13-supabase-edge-function-runbook.md)
6. [`14-supabase-project-operations.md`](./14-supabase-project-operations.md)

## Important Note

Some older docs still describe earlier behavior that is no longer the main path, especially around:

- patch review being mandatory before apply
- onboarding auto-opening for empty drafts
- prompt flows being graph/content pass only without the newer orchestrator framing

Those older docs are still useful as background, but when they disagree with the code, trust the current-state docs and the implementation in `src/` and `supabase/functions/`.
