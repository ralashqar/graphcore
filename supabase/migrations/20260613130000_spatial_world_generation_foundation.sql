do $$
begin
  if not exists (
    select 1 from pg_enum
    where enumtypid = 'public.asset_kind'::regtype
      and enumlabel = 'spatial_world'
  ) then
    alter type public.asset_kind add value 'spatial_world';
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'spatial_world_generation_status') then
    create type public.spatial_world_generation_status as enum (
      'queued', 'submitting', 'running', 'completed', 'failed', 'cancelled'
    );
  end if;
end
$$;

create table if not exists public.spatial_world_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  draft_id uuid not null references public.project_drafts (id) on delete cascade,
  requested_by uuid references auth.users (id) on delete set null,
  target_kind text not null check (target_kind in ('environment', 'world_model', 'cinematic_location')),
  target_key text not null,
  variant_key text not null default 'default',
  comparison_id uuid,
  provider text not null check (provider in ('worldlabs', 'spaitial')),
  model text not null,
  status public.spatial_world_generation_status not null default 'queued',
  provider_operation_id text,
  provider_world_id text,
  provider_status text,
  input jsonb not null default '{}'::jsonb,
  outputs jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  estimated_usd numeric(12, 6),
  actual_usd numeric(12, 6),
  error_message text,
  worker_id text,
  heartbeat_at timestamptz,
  lease_expires_at timestamptz,
  next_retry_at timestamptz,
  attempt_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (project_id, idempotency_key)
);

create unique index if not exists spatial_world_jobs_active_target_provider_idx
  on public.spatial_world_generation_jobs (draft_id, target_kind, target_key, variant_key, provider)
  where status in ('queued', 'submitting', 'running');
create index if not exists spatial_world_jobs_claim_idx
  on public.spatial_world_generation_jobs (status, next_retry_at asc nulls first, created_at asc);
create index if not exists spatial_world_jobs_target_idx
  on public.spatial_world_generation_jobs (draft_id, target_kind, target_key, created_at desc);
create index if not exists spatial_world_jobs_comparison_idx
  on public.spatial_world_generation_jobs (comparison_id) where comparison_id is not null;

create table if not exists public.spatial_world_variants (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  draft_id uuid not null references public.project_drafts (id) on delete cascade,
  target_kind text not null check (target_kind in ('environment', 'world_model', 'cinematic_location')),
  target_key text not null,
  key text not null,
  name text not null,
  status text not null default 'generating' check (status in ('generating', 'ready', 'failed', 'archived')),
  provider text not null check (provider in ('worldlabs', 'spaitial')),
  model text not null,
  source_job_id uuid references public.spatial_world_generation_jobs (id) on delete set null,
  manifest_asset_key text,
  manifest jsonb,
  alignment_transform jsonb not null default '{"position":[0,0,0],"rotation":[0,0,0],"scale":[1,1,1]}'::jsonb,
  alignment_confidence numeric(5, 4),
  is_active boolean not null default false,
  archived_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (draft_id, target_kind, target_key, key)
);

create unique index if not exists spatial_world_variants_active_target_idx
  on public.spatial_world_variants (draft_id, target_kind, target_key)
  where is_active and status <> 'archived';
create index if not exists spatial_world_variants_target_idx
  on public.spatial_world_variants (draft_id, target_kind, target_key, created_at desc);

create table if not exists public.spatial_world_markers (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  draft_id uuid not null references public.project_drafts (id) on delete cascade,
  variant_id uuid not null references public.spatial_world_variants (id) on delete cascade,
  key text not null,
  kind text not null check (kind in ('annotation', 'entry_point', 'canon_anchor', 'camera_viewpoint')),
  name text not null,
  description text not null default '',
  transform jsonb not null,
  camera jsonb,
  linked_entity_key text,
  linked_location_key text,
  linked_scene_id text,
  linked_spot_id text,
  linked_coverage_setup_id text,
  screenshot_asset_key text,
  visible boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (variant_id, key)
);

create index if not exists spatial_world_markers_variant_idx
  on public.spatial_world_markers (variant_id, kind, created_at asc);
create index if not exists spatial_world_markers_draft_idx
  on public.spatial_world_markers (draft_id, updated_at desc);

drop trigger if exists spatial_world_jobs_set_updated_at on public.spatial_world_generation_jobs;
create trigger spatial_world_jobs_set_updated_at before update on public.spatial_world_generation_jobs
for each row execute function public.set_updated_at();
drop trigger if exists spatial_world_variants_set_updated_at on public.spatial_world_variants;
create trigger spatial_world_variants_set_updated_at before update on public.spatial_world_variants
for each row execute function public.set_updated_at();
drop trigger if exists spatial_world_markers_set_updated_at on public.spatial_world_markers;
create trigger spatial_world_markers_set_updated_at before update on public.spatial_world_markers
for each row execute function public.set_updated_at();

alter table public.spatial_world_generation_jobs enable row level security;
alter table public.spatial_world_variants enable row level security;
alter table public.spatial_world_markers enable row level security;

drop policy if exists "spatial world jobs read" on public.spatial_world_generation_jobs;
drop policy if exists "spatial world jobs write" on public.spatial_world_generation_jobs;
drop policy if exists "spatial world variants read" on public.spatial_world_variants;
drop policy if exists "spatial world variants write" on public.spatial_world_variants;
drop policy if exists "spatial world markers read" on public.spatial_world_markers;
drop policy if exists "spatial world markers write" on public.spatial_world_markers;

create policy "spatial world jobs read" on public.spatial_world_generation_jobs
for select to authenticated using (app_private.can_read_draft(draft_id));
create policy "spatial world jobs write" on public.spatial_world_generation_jobs
for all to authenticated using (app_private.can_edit_draft(draft_id))
with check (app_private.can_edit_draft(draft_id));
create policy "spatial world variants read" on public.spatial_world_variants
for select to authenticated using (app_private.can_read_draft(draft_id));
create policy "spatial world variants write" on public.spatial_world_variants
for all to authenticated using (app_private.can_edit_draft(draft_id))
with check (app_private.can_edit_draft(draft_id));
create policy "spatial world markers read" on public.spatial_world_markers
for select to authenticated using (app_private.can_read_draft(draft_id));
create policy "spatial world markers write" on public.spatial_world_markers
for all to authenticated using (app_private.can_edit_draft(draft_id))
with check (app_private.can_edit_draft(draft_id));

drop trigger if exists spatial_world_jobs_draft_change on public.spatial_world_generation_jobs;
create trigger spatial_world_jobs_draft_change after insert or update or delete on public.spatial_world_generation_jobs
for each row execute function app_private.record_draft_change('draft_id', '', 'id');
drop trigger if exists spatial_world_variants_draft_change on public.spatial_world_variants;
create trigger spatial_world_variants_draft_change after insert or update or delete on public.spatial_world_variants
for each row execute function app_private.record_draft_change('draft_id', '', 'id');
drop trigger if exists spatial_world_markers_draft_change on public.spatial_world_markers;
create trigger spatial_world_markers_draft_change after insert or update or delete on public.spatial_world_markers
for each row execute function app_private.record_draft_change('draft_id', '', 'id');

create or replace function public.claim_spatial_world_generation_job(worker_id text, lease_seconds integer default 300)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare claimed_job_id uuid; now_at timestamptz := timezone('utc'::text, now());
begin
  if worker_id is null or length(trim(worker_id)) = 0 then raise exception 'worker_id is required'; end if;
  with candidate as (
    select id from public.spatial_world_generation_jobs
    where (
      status = 'queued' and (next_retry_at is null or next_retry_at <= now_at)
    ) or (
      status in ('submitting', 'running') and coalesce(lease_expires_at, heartbeat_at, updated_at) < now_at
    )
    order by created_at asc
    for update skip locked limit 1
  )
  update public.spatial_world_generation_jobs job
  set status = case when job.provider_operation_id is null then 'submitting' else 'running' end,
      worker_id = trim(claim_spatial_world_generation_job.worker_id),
      heartbeat_at = now_at,
      lease_expires_at = now_at + make_interval(secs => greatest(lease_seconds, 30)),
      started_at = coalesce(started_at, now_at),
      attempt_count = attempt_count + 1,
      error_message = null
  from candidate where job.id = candidate.id returning job.id into claimed_job_id;
  return claimed_job_id;
end;
$$;

create or replace function public.heartbeat_spatial_world_generation_job(job_id uuid, worker_id text, lease_seconds integer default 300)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.spatial_world_generation_jobs
  set heartbeat_at = timezone('utc'::text, now()),
      lease_expires_at = timezone('utc'::text, now()) + make_interval(secs => greatest(lease_seconds, 30))
  where id = job_id and spatial_world_generation_jobs.worker_id = heartbeat_spatial_world_generation_job.worker_id
    and status in ('submitting', 'running');
  return found;
end;
$$;

revoke all on function public.claim_spatial_world_generation_job(text, integer) from public, anon, authenticated;
revoke all on function public.heartbeat_spatial_world_generation_job(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.claim_spatial_world_generation_job(text, integer) to service_role;
grant execute on function public.heartbeat_spatial_world_generation_job(uuid, text, integer) to service_role;

create or replace function public.enqueue_spatial_world_generation_jobs(
  p_user_id uuid,
  p_project_id uuid,
  p_draft_id uuid,
  p_credit_amount integer,
  p_credit_reference_id text,
  p_jobs jsonb
)
returns table (
  success boolean,
  new_balance integer,
  already_reserved boolean,
  error_message text
)
language plpgsql
set search_path = public
as $$
declare
  current_balance integer;
  next_balance integer;
  credit_exists boolean;
  job jsonb;
  inserted_job_id uuid;
begin
  if p_credit_amount < 0 then
    return query select false, 0, false, 'Credit amount cannot be negative.'::text;
    return;
  end if;
  if jsonb_typeof(p_jobs) <> 'array' or jsonb_array_length(p_jobs) = 0 then
    return query select false, 0, false, 'At least one spatial world job is required.'::text;
    return;
  end if;

  select balance into current_balance
  from public.user_credits
  where user_id = p_user_id
  for update;

  if current_balance is null then
    return query select false, 0, false, 'Credit balance was not found.'::text;
    return;
  end if;

  select exists (
    select 1 from public.credit_transactions
    where user_id = p_user_id
      and reference_type = 'spatial_world_generation'
      and reference_id = p_credit_reference_id
  ) into credit_exists;

  if not credit_exists then
    if current_balance < p_credit_amount then
      return query select false, current_balance, false, 'Insufficient credits.'::text;
      return;
    end if;
    next_balance := current_balance - p_credit_amount;
    update public.user_credits
    set balance = next_balance, updated_at = timezone('utc'::text, now())
    where user_id = p_user_id;
    insert into public.credit_transactions (
      user_id, amount, balance_after, reason, reference_type, reference_id, metadata
    ) values (
      p_user_id,
      -p_credit_amount,
      next_balance,
      'Spatial world generation reservation',
      'spatial_world_generation',
      p_credit_reference_id,
      jsonb_build_object('projectId', p_project_id, 'draftId', p_draft_id, 'jobCount', jsonb_array_length(p_jobs))
    );
  else
    next_balance := current_balance;
  end if;

  for job in select value from jsonb_array_elements(p_jobs)
  loop
    insert into public.spatial_world_generation_jobs (
      project_id, draft_id, requested_by, target_kind, target_key, variant_key,
      comparison_id, provider, model, status, input, outputs, idempotency_key,
      estimated_usd, metadata
    ) values (
      p_project_id,
      p_draft_id,
      p_user_id,
      job ->> 'targetKind',
      job ->> 'targetKey',
      job ->> 'variantKey',
      nullif(job ->> 'comparisonId', '')::uuid,
      job ->> 'provider',
      job ->> 'model',
      'queued',
      coalesce(job -> 'input', '{}'::jsonb),
      '{}'::jsonb,
      job ->> 'idempotencyKey',
      nullif(job ->> 'estimatedUsd', '')::numeric,
      coalesce(job -> 'metadata', '{}'::jsonb)
    )
    on conflict (project_id, idempotency_key) do update
      set updated_at = public.spatial_world_generation_jobs.updated_at
    returning id into inserted_job_id;

    insert into public.spatial_world_variants (
      project_id, draft_id, target_kind, target_key, key, name, status,
      provider, model, source_job_id, metadata, created_by
    ) values (
      p_project_id,
      p_draft_id,
      job ->> 'targetKind',
      job ->> 'targetKey',
      job ->> 'variantKey',
      coalesce(nullif(job ->> 'variantName', ''), job ->> 'variantKey'),
      'generating',
      job ->> 'provider',
      job ->> 'model',
      inserted_job_id,
      jsonb_build_object('comparisonId', nullif(job ->> 'comparisonId', ''), 'generationState', 'queued'),
      p_user_id
    )
    on conflict (draft_id, target_kind, target_key, key) do update
      set status = 'generating',
          provider = excluded.provider,
          model = excluded.model,
          source_job_id = excluded.source_job_id,
          archived_at = null,
          updated_at = timezone('utc'::text, now());
  end loop;

  return query select true, next_balance, credit_exists, null::text;
end;
$$;

revoke all on function public.enqueue_spatial_world_generation_jobs(uuid, uuid, uuid, integer, text, jsonb) from public, anon, authenticated;
grant execute on function public.enqueue_spatial_world_generation_jobs(uuid, uuid, uuid, integer, text, jsonb) to service_role;

create or replace function public.activate_spatial_world_variant(p_variant_id uuid)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  selected_variant public.spatial_world_variants%rowtype;
  target_definition_id uuid;
  component_name text;
  next_config jsonb;
begin
  select * into selected_variant from public.spatial_world_variants where id = p_variant_id for update;
  if selected_variant.id is null then raise exception 'Spatial world variant was not found.'; end if;
  if selected_variant.status <> 'ready' then raise exception 'Only ready spatial world variants can be activated.'; end if;

  update public.spatial_world_variants set is_active = false
  where draft_id = selected_variant.draft_id
    and target_kind = selected_variant.target_kind
    and target_key = selected_variant.target_key
    and id <> selected_variant.id;
  update public.spatial_world_variants set is_active = true where id = selected_variant.id;

  if selected_variant.target_kind in ('environment', 'world_model') then
    select id into target_definition_id from public.project_definitions
    where draft_id = selected_variant.draft_id
      and project_id = selected_variant.project_id
      and key = selected_variant.target_key
      and kind = selected_variant.target_kind;
    if target_definition_id is null then raise exception 'Target definition was not found.'; end if;
    component_name := case when selected_variant.target_kind = 'environment' then 'environment_render_binding' else 'world_render_binding' end;
    select coalesce(config, '{}'::jsonb) into next_config from public.project_definition_components
    where project_definition_components.definition_id = target_definition_id
      and component_type = component_name;
    next_config := coalesce(next_config, '{}'::jsonb) || jsonb_build_object(
      'spatialWorldVariantId', selected_variant.id,
      'spatialWorldAssetKey', selected_variant.manifest ->> 'primarySplatAssetKey',
      'spatialWorldManifestAssetKey', selected_variant.manifest_asset_key,
      'colliderMeshAssetKey', selected_variant.manifest ->> 'colliderMeshAssetKey',
      'spatialWorldJobId', selected_variant.source_job_id
    );
    insert into public.project_definition_components (definition_id, component_type, config)
    values (target_definition_id, component_name, next_config)
    on conflict (definition_id, component_type) do update set config = excluded.config;
  end if;
  return true;
end;
$$;

revoke all on function public.activate_spatial_world_variant(uuid) from public, anon, authenticated;
grant execute on function public.activate_spatial_world_variant(uuid) to service_role;

create or replace function public.can_edit_project_draft(p_draft_id uuid)
returns boolean
language sql
stable
set search_path = public, app_private
as $$
  select app_private.can_edit_draft(p_draft_id)
$$;

revoke all on function public.can_edit_project_draft(uuid) from public, anon;
grant execute on function public.can_edit_project_draft(uuid) to authenticated, service_role;
