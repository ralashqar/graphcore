# GraphCore Fly World Generation Worker

Runs initial world skeleton generation outside Supabase Edge runtime limits.

## Deploy

```powershell
npm run fly:worker:deploy
```

The Fly app defaults to `graphcore-world-generation` in `lhr`. The deploy command uses the root `fly.world-generation.toml` so Docker can copy the shared `src/` and `supabase/functions/_shared/` code into the worker image.

## Required Secrets

Set these on the Fly app. Do not expose them in frontend code.

```powershell
fly secrets set SUPABASE_URL="..."
fly secrets set SUPABASE_SERVICE_ROLE_KEY="..."
fly secrets set OPENAI_API_KEY="..."
fly secrets set FAL_KEY="..."
fly secrets set GRAPHCORE_WORKER_SECRET="..."
```

## Runtime

The worker polls Supabase for `world_prompt_generation_jobs` with `metadata.runtime = "fly"`, claims one queued `full_stream` step at a time, streams OpenAI graph-op records, applies them through the existing world-prompt persistence path, and writes progress events for realtime/polling UI recovery. It also claims `world_entity_icon_generation_jobs`, submits Fal `openai/gpt-image-2` queue requests, crops the returned icon grid, and stores per-entity icon assets back in Supabase.
