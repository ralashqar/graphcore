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
7. [`23-supabase-db-performance-and-security-runbook.md`](./23-supabase-db-performance-and-security-runbook.md)

## Important Note

Some older docs still describe earlier behavior that is no longer the main path, especially around:

- patch review being mandatory before apply
- onboarding auto-opening for empty drafts
- prompt flows being graph/content pass only without the newer orchestrator framing

Those older docs are still useful as background, but when they disagree with the code, trust the current-state docs and the implementation in `src/` and `supabase/functions/`.

## Research And Planning Docs

- [`16-cinematic-presets-and-ugc-research.md`](./16-cinematic-presets-and-ugc-research.md)
  - Research base for cinematic preset families, UGC workflows, Seedance 2 patterns, and manual take-node still generation planning.
- [`17-world-build-context-and-ugc-current-state.md`](./17-world-build-context-and-ugc-current-state.md)
  - Current-state study of how GraphCore turns prompts into characters, environments, items, graphs, and cinematics, plus where UGC support already exists in code.
- [`18-art-style-preset-range-and-ugc-capture-profiles.md`](./18-art-style-preset-range-and-ugc-capture-profiles.md)
  - Current direction for expanding art style presets, especially photoreal UGC capture profiles, camera assumptions, and realism guardrails.
- [`21-prompt-to-app-preview-pipeline.md`](./21-prompt-to-app-preview-pipeline.md)
  - Recommended graph-first Prompt-to-App pipeline from initial app graph through readiness repair, screen designs, Expo code generation, and sandbox iframe preview.
- [`24-spatial-world-integration.md`](./24-spatial-world-integration.md)
  - Provider-neutral workstream for World Labs, SpAItial, Spark, PlayCanvas splat processing, collision assets, and explorable environment generation.
- [`ugc-mastery/README.md`](./ugc-mastery/README.md)
  - Distilled GraphCore-owned knowledge base for UGC psychology, virality mechanics, script formulas, format systems, and preset integration guidance.
