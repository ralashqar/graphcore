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
8. [`24-synarc-technical-infrastructure-spec.md`](./24-synarc-technical-infrastructure-spec.md)

## Important Note

Some older docs still describe earlier behavior that is no longer the main path, especially around:

- patch review being mandatory before apply
- onboarding auto-opening for empty drafts
- prompt flows being graph/content pass only without the newer orchestrator framing

Those older docs are still useful as background, but when they disagree with the code, trust the current-state docs and the implementation in `src/` and `supabase/functions/`.

## Research And Planning Docs

- [`25-vibe-director-h3-workspace.md`](./25-vibe-director-h3-workspace.md) — H3 workspace architecture, saved takes/branching/export, gated live capture, deployment, and release checks.

- [`16-cinematic-presets-and-ugc-research.md`](./16-cinematic-presets-and-ugc-research.md)
  - Research base for cinematic preset families, UGC workflows, Seedance 2 patterns, and manual take-node still generation planning.
- [`17-world-build-context-and-ugc-current-state.md`](./17-world-build-context-and-ugc-current-state.md)
  - Current-state study of how GraphCore turns prompts into characters, environments, items, graphs, and cinematics, plus where UGC support already exists in code.
- [`18-art-style-preset-range-and-ugc-capture-profiles.md`](./18-art-style-preset-range-and-ugc-capture-profiles.md)
  - Current direction for expanding art style presets, especially photoreal UGC capture profiles, camera assumptions, and realism guardrails.
- [`21-prompt-to-app-preview-pipeline.md`](./21-prompt-to-app-preview-pipeline.md)
  - Recommended graph-first Prompt-to-App pipeline from initial app graph through readiness repair, screen designs, Expo code generation, and sandbox iframe preview.
- [`ugc-mastery/README.md`](./ugc-mastery/README.md)
  - Distilled GraphCore-owned knowledge base for UGC psychology, virality mechanics, script formulas, format systems, and preset integration guidance.

- [26. Director runtime and rollout](26-director-runtime.md) — isolated workers, durable recovery, compatibility boundaries, and release gates.
- [27. Prompt-to-game architecture review](27-prompt-to-game-architecture-review.md) — repository findings, contracts, engine and asset-pipeline recommendations.
- [28. Game workspace implementation](28-game-workspace-implementation.md) — adventure template, scoped planners, runtime, workers, migration, deployment and verification.
- [29. Fabric gameplay reuse review](29-fabric-gameplay-reuse-review.md) — source findings and selective gameplay transfer recommendations.
- [30. Gameplay module implementation](30-gameplay-modules-implementation.md) — combat/traversal nodes, procedural poses, durable workflows, deployment and acceptance.
- [31. Spatial interactions](31-spatial-interactions-implementation.md) — reusable contacts, quadruped mounting, seating, vehicle control, mechanisms and interaction acceptance.
- [32. Unified gameplay](32-unified-gameplay-implementation.md) — reviewed plans, reusable actor instances, objective graphs, independent recipes and scenario-driven acceptance.
