create table if not exists public.ai_pricing_catalog (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  model text not null,
  modality text not null,
  operation text not null default '',
  price_snapshot jsonb not null default '{}'::jsonb,
  source_url text not null default '',
  active boolean not null default true,
  effective_at timestamptz not null default timezone('utc'::text, now()),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (provider, model, modality, operation, effective_at)
);

create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  project_id uuid references public.projects(id) on delete cascade,
  draft_id uuid references public.project_drafts(id) on delete cascade,
  surface text not null default '',
  provider text not null,
  model text not null default '',
  modality text not null default 'text',
  operation text not null default '',
  status text not null default 'estimated',
  idempotency_key text not null,
  provider_request_id text,
  provider_response_id text,
  output_workflow_id uuid references public.output_workflows(id) on delete set null,
  output_workflow_run_id uuid references public.output_workflow_runs(id) on delete set null,
  output_workflow_run_step_id uuid references public.output_workflow_run_steps(id) on delete set null,
  world_prompt_turn_id uuid references public.world_prompt_turns(id) on delete set null,
  world_prompt_generation_job_id uuid references public.world_prompt_generation_jobs(id) on delete set null,
  world_prompt_generation_step_id uuid references public.world_prompt_generation_job_steps(id) on delete set null,
  visual_generation_job_id uuid references public.visual_generation_jobs(id) on delete set null,
  usage jsonb not null default '{}'::jsonb,
  cost jsonb not null default '{}'::jsonb,
  price_snapshot jsonb not null default '{}'::jsonb,
  estimated_cost_usd numeric(12, 6) not null default 0,
  actual_cost_usd numeric(12, 6) not null default 0,
  credits_charged integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (provider, idempotency_key)
);

create index if not exists ai_usage_events_draft_created_idx on public.ai_usage_events(draft_id, created_at desc);
create index if not exists ai_usage_events_output_run_idx on public.ai_usage_events(output_workflow_run_id, created_at desc);
create index if not exists ai_usage_events_world_turn_idx on public.ai_usage_events(world_prompt_turn_id, created_at desc);
create index if not exists ai_usage_events_visual_job_idx on public.ai_usage_events(visual_generation_job_id, created_at desc);
create index if not exists ai_usage_events_user_created_idx on public.ai_usage_events(user_id, created_at desc);

drop trigger if exists ai_pricing_catalog_set_updated_at on public.ai_pricing_catalog;
create trigger ai_pricing_catalog_set_updated_at before update on public.ai_pricing_catalog for each row execute function public.set_updated_at();

drop trigger if exists ai_usage_events_set_updated_at on public.ai_usage_events;
create trigger ai_usage_events_set_updated_at before update on public.ai_usage_events for each row execute function public.set_updated_at();

alter table public.ai_pricing_catalog enable row level security;
alter table public.ai_usage_events enable row level security;

drop policy if exists "ai pricing read" on public.ai_pricing_catalog;
create policy "ai pricing read" on public.ai_pricing_catalog
for select to authenticated
using (true);

drop policy if exists "ai usage read" on public.ai_usage_events;
create policy "ai usage read" on public.ai_usage_events
for select to authenticated
using (
  (user_id is not null and auth.uid() = user_id)
  or (draft_id is not null and app_private.can_read_draft(draft_id))
  or (project_id is not null and app_private.can_read_project(project_id))
);

drop policy if exists "ai usage service write" on public.ai_usage_events;
create policy "ai usage service write" on public.ai_usage_events
for all to service_role
using (true)
with check (true);

drop policy if exists "ai pricing service write" on public.ai_pricing_catalog;
create policy "ai pricing service write" on public.ai_pricing_catalog
for all to service_role
using (true)
with check (true);

insert into public.ai_pricing_catalog (provider, model, modality, operation, price_snapshot, source_url)
values
  ('openai', 'gpt-4o-mini', 'text', 'responses', '{"inputPer1M":0.15,"cachedInputPer1M":0.075,"outputPer1M":0.6}'::jsonb, 'https://platform.openai.com/docs/pricing'),
  ('openai', 'gpt-4o', 'text', 'responses', '{"inputPer1M":2.5,"cachedInputPer1M":1.25,"outputPer1M":10}'::jsonb, 'https://platform.openai.com/docs/pricing'),
  ('openai', 'gpt-4.1', 'text', 'responses', '{"inputPer1M":2,"cachedInputPer1M":0.5,"outputPer1M":8}'::jsonb, 'https://platform.openai.com/docs/pricing'),
  ('openai', 'gpt-4.1-mini', 'text', 'responses', '{"inputPer1M":0.4,"cachedInputPer1M":0.1,"outputPer1M":1.6}'::jsonb, 'https://platform.openai.com/docs/pricing'),
  ('fal', 'openai/gpt-image-2', 'image', 'image_generation', '{"unitUsd":0.08,"fallback":true}'::jsonb, 'https://fal.ai/docs/platform-apis/v1/models/pricing'),
  ('fal', 'fal-ai/bytedance/seedance/v1/pro/fast/text-to-video', 'video', 'video_generation', '{"unitUsd":0.12,"fallback":true}'::jsonb, 'https://fal.ai/models/fal-ai/bytedance/seedance/v1/pro/fast/text-to-video')
on conflict do nothing;
