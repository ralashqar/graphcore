alter table public.world_build_jobs
  add column if not exists attempt_count integer not null default 0,
  add column if not exists next_retry_at timestamptz,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists last_transition_at timestamptz;

alter table public.cinematic_run_jobs
  add column if not exists attempt_count integer not null default 0,
  add column if not exists next_retry_at timestamptz,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists last_transition_at timestamptz;

alter table public.mesh_generation_jobs
  add column if not exists attempt_count integer not null default 0,
  add column if not exists next_retry_at timestamptz,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists last_transition_at timestamptz;

create index if not exists world_build_jobs_retry_idx
  on public.world_build_jobs (status, next_retry_at asc nulls last);

create index if not exists cinematic_run_jobs_retry_idx
  on public.cinematic_run_jobs (status, next_retry_at asc nulls last);

create index if not exists mesh_generation_jobs_retry_idx
  on public.mesh_generation_jobs (status, next_retry_at asc nulls last);
