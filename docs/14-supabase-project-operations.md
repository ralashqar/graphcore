# Supabase Project Operations

This document captures the GraphCore-specific operational notes that are useful to keep in the repo for other developers.

## Hosted Project

- Project name: `GraphCore`
- Project ref: `znwdatidqdkzidempvkt`
- Supabase URL: `https://znwdatidqdkzidempvkt.supabase.co`

Frontend environment variables should stay in local `.env` files and must not be committed.

## Local Expectations

- The repo is already designed to work with the hosted Supabase project above.
- Use `npx supabase ...` in this repo unless the CLI is known to be globally available on your machine.
- The project is typically linked already, but confirm before deploy if something looks off.

Useful checks:

```powershell
npx supabase status
npx supabase functions list --project-ref znwdatidqdkzidempvkt -o json
```

## World-Build Rollout Notes

The async global world builder relies on:

- database migration: `20260411160000_async_global_world_builder.sql`
- edge functions:
  - `plan-world-build`
  - `start-world-build`
  - `poll-world-build`
  - `delete-world-build-placeholder`

Useful commands:

```powershell
npx supabase db push --linked --yes
npx supabase functions deploy plan-world-build --project-ref znwdatidqdkzidempvkt --no-verify-jwt
npx supabase functions deploy start-world-build --project-ref znwdatidqdkzidempvkt --no-verify-jwt
npx supabase functions deploy poll-world-build --project-ref znwdatidqdkzidempvkt --no-verify-jwt
npx supabase functions deploy delete-world-build-placeholder --project-ref znwdatidqdkzidempvkt --no-verify-jwt
```

## Secret Management

Provider secrets and service credentials must be configured in Supabase secrets or the dashboard, not committed into the repo.

Examples:

```powershell
npx supabase secrets list --project-ref znwdatidqdkzidempvkt
npx supabase secrets set --project-ref znwdatidqdkzidempvkt OPENAI_API_KEY=...
npx supabase secrets set --project-ref znwdatidqdkzidempvkt FAL_KEY=...
```

Optional world-build debug flag:

```powershell
npx supabase secrets set --project-ref znwdatidqdkzidempvkt WORLD_BUILD_DEBUG_OPENAI=true
```

Disable it when no longer needed:

```powershell
npx supabase secrets set --project-ref znwdatidqdkzidempvkt WORLD_BUILD_DEBUG_OPENAI=false
```

## Team Guidance

- Put reusable operational knowledge in `docs/`.
- Keep only machine-local scratch notes in `.vscode/`.
- If a private note becomes part of the team workflow, promote it into `docs/` instead of relying on hidden local files.
