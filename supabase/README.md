# Supabase workspace

This repo includes a local Supabase workspace for database and edge-function development.

## Common commands

- `npm run supabase:start` starts the local stack. Docker Desktop is required.
- `npm run supabase:status` shows the local API URL, anon key, and service role key.
- `npm run supabase:db:reset` rebuilds the local database from migrations and `supabase/seed.sql`.
- `npm run supabase:functions:serve` serves edge functions locally.
- `npm run supabase:link` links this repo to the hosted project `znwdatidqdkzidempvkt` after you log in.
- `npm run supabase:db:push` pushes local migrations to the linked hosted project.

## Recommended flow

1. Start the local stack.
2. Run `npm run supabase:status` and copy the local API URL and anon key into `.env.local`.
3. Edit SQL files in `supabase/migrations` and function code in `supabase/functions`.
4. Run `npm run supabase:db:reset` after schema changes.
5. When ready, authenticate with `npx supabase login`, then link and push to the hosted project.
