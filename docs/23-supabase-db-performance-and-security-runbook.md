# Supabase DB Performance and Security Runbook

This runbook documents the database optimization pass that was first applied
directly in the Supabase dashboard and then reconciled into migrations. It also
records the checks to run before future schema/performance work so Supabase does
not drift ahead of Git again.

## What The Supabase Agent Optimized

The dashboard agent was addressing three practical production problems:

1. Hot foreign-key lookups were missing indexes.
2. Some live status values and legacy error fields were accepted by runtime code
   but not fully represented in schema/source.
3. Several RLS and `SECURITY DEFINER` advisor warnings remained.

The direct DB changes have now been captured in migrations:

- `20260611214204_capture_hot_fk_indexes_from_dashboard.sql`
  - Captures 44 FK indexes on hot output workflow, output request, world prompt,
    `user_workspace_state`, and `world_threads` tables.
- `20260611214849_capture_status_error_compat_from_dashboard.sql`
  - Captures enum compatibility values:
    - `output_workflow_run_status.succeeded`
    - `cinematic_run_job_status.completed`
    - `cinematic_run_job_status.completed_with_errors`
  - Captures `output_workflow_runs.error` and `output_workflow_runs.last_error`.
  - Backfills both from `error_message`.
  - Captures `sync_output_workflow_run_error_fields()` and
    `trg_sync_output_workflow_run_error_fields`.
- `20260611215350_drop_duplicate_dashboard_fk_indexes.sql`
  - Drops exact duplicate non-unique indexes after the canonical names were
    captured.

Related source compatibility changes:

- `src/domain/outputWorkflow.ts`
- `src/domain/cinematics.ts`
- `supabase/functions/_shared/cinematics.ts`
- `supabase/functions/fal-webhook/index.ts`

## Rules For Future Supabase Fixes

Treat Supabase dashboard SQL as a scratchpad, not source of truth.

After any direct dashboard change:

1. Copy the exact successful SQL from the dashboard agent.
2. Verify the live object exists with `npx supabase db query --linked`.
3. Create a migration with `npx supabase migration new <name>`.
4. Make the migration idempotent when production already has the change.
5. Push it with `npx supabase db push --linked --include-all`.
6. Run advisors and a targeted verification query.
7. Update TypeScript schemas when DB enum values or columns change.

Do not rely on `supabase db diff` in this Windows environment unless Docker is
running. The CLI uses a shadow database and fails without Docker.

## FK Index Playbook

Foreign keys should have an index on the referencing columns when the table is
large, frequently joined, frequently deleted from the parent side, or used by
RLS/helper functions. Missing FK indexes can create slow cascades, blocked
deletes, expensive joins, and statement timeouts.

Use this query to find FK indexes that are not covered by a valid index prefix:

```sql
with fk as (
  select
    n.nspname as schema_name,
    c.relname as table_name,
    con.conname as fk_name,
    array_agg(u.attnum order by u.ord)::int[] as fk_cols,
    array_agg(a.attname order by u.ord) as fk_col_names
  from pg_constraint con
  join pg_class c on c.oid = con.conrelid
  join pg_namespace n on n.oid = c.relnamespace
  join lateral unnest(con.conkey) with ordinality as u(attnum, ord) on true
  join pg_attribute a on a.attrelid = con.conrelid and a.attnum = u.attnum
  where con.contype = 'f'
    and n.nspname = 'public'
  group by 1,2,3
), idx_cols as (
  select
    i.indrelid,
    i.indexrelid,
    i.indisvalid,
    i.indisready,
    array_agg(k.attnum order by k.ord)::int[] as ind_cols
  from pg_index i
  join lateral unnest(i.indkey) with ordinality as k(attnum, ord) on k.attnum > 0
  group by i.indrelid, i.indexrelid, i.indisvalid, i.indisready
)
select fk.schema_name, fk.table_name, fk.fk_name, fk.fk_col_names
from fk
where not exists (
  select 1
  from idx_cols idx
  where idx.indrelid = (quote_ident(fk.schema_name) || '.' || quote_ident(fk.table_name))::regclass
    and idx.indisvalid
    and idx.indisready
    and idx.ind_cols[1:cardinality(fk.fk_cols)] = fk.fk_cols
)
order by fk.table_name, fk.fk_name;
```

Rank by current table size before adding indexes:

```sql
select relname, n_live_tup, n_dead_tup
from pg_stat_user_tables
order by n_live_tup desc;
```

Decision rule:

- Add the index immediately for hot job/workflow/event tables.
- Defer indexes on empty or tiny tables unless they are about to become hot.
- Prefer `CREATE INDEX CONCURRENTLY` in a non-transactional SQL session for
  large production tables. Supabase dashboard SQL may wrap statements in a
  transaction, so use a maintenance window or the SQL editor path that supports
  non-transactional execution when needed.
- After adding indexes, run a duplicate-index check and drop exact duplicates.

Duplicate check:

```sql
with indexes as (
  select
    tbl.relname as table_name,
    idx.relname as index_name,
    i.indkey::text as indkey,
    i.indclass::text as indclass,
    i.indcollation::text as indcollation,
    i.indoption::text as indoption,
    i.indpred is not null as is_partial,
    i.indexprs is not null as is_expression,
    i.indisunique as is_unique
  from pg_index i
  join pg_class idx on idx.oid = i.indexrelid
  join pg_class tbl on tbl.oid = i.indrelid
  join pg_namespace ns on ns.oid = tbl.relnamespace
  where ns.nspname = 'public'
)
select table_name, indkey, array_agg(index_name order by index_name) as indexes
from indexes
where not is_partial and not is_expression and not is_unique
group by table_name, indkey, indclass, indcollation, indoption
having count(*) > 1
order by table_name, indkey;
```

Current state after reconciliation: the exact duplicate-index query returned no
rows.

## RLS Initplan Playbook

Supabase advisor warning: `auth_rls_initplan`.

Problem: policies such as `auth.uid() = user_id` may re-evaluate `auth.uid()` for
each row. Supabase recommends wrapping auth helpers in a scalar subquery so
Postgres can initialize the value once:

```sql
-- Before
using (auth.uid() = user_id)

-- After
using ((select auth.uid()) = user_id)
```

Current targeted query found these policies still using direct `auth.*` calls:

- `ai_usage_events`: `ai usage read`
- `credit_purchases`: `Service role can manage all purchases`,
  `Users can view own purchases`
- `credit_transactions`: `Service role can view all transactions`,
  `Users can view own transactions`
- `draft_presence`: `presence write`
- `subscriptions`: `Service role can manage all subscriptions`,
  `Users can view own subscription`
- `user_credits`: `Service role can manage all credits`,
  `Users can view own credits`
- `user_workspace_state`: `user workspace state read`,
  `user workspace state write`
- `workspace_memberships`: `membership insert`
- `workspaces`: `workspace insert`

Recommended next migration:

- Patch these direct calls first because they are small, easy to verify, and
  advisor-backed.
- Keep the policy logic identical; only wrap `auth.uid()` and `auth.jwt()` calls.
- Do not rewrite ownership semantics in the same migration.

Example migration style:

```sql
drop policy if exists "Users can view own credits" on public.user_credits;
create policy "Users can view own credits" on public.user_credits
for select
using ((select auth.uid()) = user_id);
```

## Multiple Permissive Policy Playbook

Supabase advisor warning: `multiple_permissive_policies`.

Problem: multiple permissive policies for the same role/action are ORed together
and each policy can be evaluated for each relevant query. This is both a
performance issue and a readability issue.

Common GraphCore pattern:

- A `read` policy grants `SELECT`.
- A broad `write` or `ALL` policy also implicitly applies to `SELECT`.

Preferred pattern:

- Split broad `ALL` policies into explicit `INSERT`, `UPDATE`, and `DELETE`
  where possible.
- Keep one `SELECT` policy per role/action on hot tables.
- Avoid service-role policies with `roles = {public}` when a service-role-only
  RPC or Edge Function path already handles writes.

Do this table-by-table. It is easy to accidentally remove `SELECT` permission
needed for `UPDATE` under RLS.

## SECURITY DEFINER Grant Playbook

Supabase security advisors flagged public or authenticated execution of some
`SECURITY DEFINER` functions.

Important distinctions:

- Trigger functions do not need to be exposed as REST RPCs.
- Service-role worker/admin RPCs should generally revoke `anon` and
  `authenticated`, then grant only `service_role`.
- User-facing RPCs may intentionally grant `authenticated`, but should never
  grant `anon` unless explicitly public.
- Helper functions in `app_private` are not in the exposed `public` schema, but
  still show broad execute privileges. Tightening them requires care because RLS
  policies call them.

Security advisors currently flag these public-schema functions:

- `ensure_sequence_animatic_child_workflow(...)`
- `refresh_output_request_status_projection(uuid)`
- `refresh_output_request_status_projection_for_artifact_trigger()`
- `refresh_output_request_status_projection_for_request_trigger()`
- `refresh_output_request_status_projection_for_run_trigger()`
- `refresh_output_request_status_projection_for_step_trigger()`
- `cancel_output_workflow_run(uuid)`
- `get_draft_delta(uuid, bigint, text)`

Recommended next migration:

- Revoke `anon` from all listed functions.
- Revoke `authenticated` from trigger-only projection functions.
- Keep `authenticated` on intentionally user-facing RPCs only when there is no
  Edge Function wrapper and the function validates access internally.
- Leave `get_draft_delta` and `cancel_output_workflow_run` for a separate review
  because the frontend/Edge paths may intentionally use authenticated access.

Example:

```sql
revoke all on function public.refresh_output_request_status_projection_for_step_trigger() from public, anon, authenticated;
grant execute on function public.refresh_output_request_status_projection_for_step_trigger() to service_role;
```

## Current Follow-Up Findings

As of June 11, 2026:

- Hot FK index batch has been captured and pushed.
- Exact duplicate non-unique indexes have been removed.
- Status/error compatibility drift has been captured and pushed.
- Full test suite and production build pass after source compatibility updates.
- Remaining FK-index candidates are on tables with `n_live_tup` at 0 or 1 in the
  current project, so they are not urgent. Revisit when those tables grow.
- Highest-value remaining work:
  1. Patch RLS initplan warnings for the 14 policies listed above.
  2. Tighten `SECURITY DEFINER` execute grants, starting with trigger-only
     projection functions.
  3. Reduce multiple permissive policies on hot tables by splitting `ALL`
     policies into explicit commands.

## Verification Commands

Run after any migration touching indexes, policies, functions, or enums:

```powershell
npx supabase migration list --linked
npx supabase db advisors --linked --type performance --level warn --fail-on none -o json
npx supabase db advisors --linked --type security --level warn --fail-on none -o json
npx tsc --noEmit
npm test
npm run build
```

For local schema diffing, start Docker first. Without Docker, use targeted
read-only `npx supabase db query --linked --file <query.sql>` checks instead.
