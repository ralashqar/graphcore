---
name: supabase-fly-deploy
description: Deploy and verify GraphCore changes that touch shared Supabase Edge Function code, Fly world-generation worker code, or output workflow execution. Use when editing supabase/functions/_shared files, Edge Functions, workers/world-generation, output-workflow.ts, workflow factories, provider/image generation helpers, or any code path executed by both Supabase and Fly.
---

# Supabase + Fly Deploy

GraphCore has two production execution surfaces for generation code:

- Supabase Edge Functions create, ensure, start, and inspect requests.
- The Fly world-generation worker executes long-running output workflow runs and visual/generation jobs.

If shared workflow code changes, deploying only Edge Functions is incomplete.

## Runtime Decision

Before finishing any change, classify the touched files:

- `supabase/functions/<function>/...`: deploy that Edge Function.
- `supabase/functions/_shared/...`: deploy every Edge Function that imports the changed shared module, and deploy the Fly worker if the shared module is imported by `workers/world-generation/main.ts` or any worker-executed path.
- `supabase/functions/_shared/output-workflow.ts`: deploy `start-output-workflow-run`, any ensure/get functions that bundle workflow metadata, and the Fly worker.
- `supabase/functions/_shared/sequence-animatic-workflow-factory.ts`: deploy ensure functions that create workflow nodes and the Fly worker if runtime policies are read during execution.
- `workers/world-generation/...`: deploy the Fly worker.
- `src/domain/...` imported by Edge or Fly shared code: deploy the affected Edge Functions and Fly worker.

## Required Sequence

1. Run local verification first:

```powershell
npx tsc --noEmit
npm test
npm run build
```

2. Deploy affected Supabase functions, for example:

```powershell
npx supabase functions deploy ensure-sequence-animatic-continuity-asset-workflow start-output-workflow-run ensure-sequence-animatic-zone-coverage-boards --project-ref znwdatidqdkzidempvkt
```

3. Deploy the Fly worker whenever shared execution code changed:

```powershell
npm run fly:worker:deploy
```

4. If a final shared-code patch lands after either deploy, redeploy both affected surfaces so Edge-created workflow config and Fly-executed workflow behavior stay aligned.

## Output Workflow Rule

For output workflow prompt/image/provider changes, assume Fly is the runtime of truth. Edge may enqueue or start the workflow, but the prompt/image node is often executed by `processFlyOutputWorkflowRuns`.

Common symptoms of missing Fly deploy:

- New Edge deploy succeeds but generated prompts still contain removed strings.
- Old image dimensions or quality settings persist.
- New workflow metadata is present, but prompt/image execution uses old wording.
- Provider jobs continue to show old policy names, prompt footers, or fallback behavior.

## Compatibility Rule

Do not rely only on new metadata fields in materialized workflow nodes. Existing queued/running nodes may lack them.

When changing behavior, add fallback inference from stable fields such as:

- `assetKind`
- `batchKind`
- `purpose`
- `node.key`
- `screenplayAnimaticRole`

Then bump deterministic policy/hash identifiers so old child workflows are not silently reused.

## Production Safety

- Do not kill broad local or production worker processes unless explicitly asked.
- Check for stale or already-materialized runs before assuming new code is wrong.
- For prompt fixes, inspect both the ensure path that creates config and the worker path that builds the actual provider prompt.
- Include the Fly worker code version in `workers/world-generation/main.ts` when a worker behavior change matters for logs.
