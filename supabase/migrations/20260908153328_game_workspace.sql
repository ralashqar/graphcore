-- Additive game authoring/build store. Browser roles have read-only, draft-scoped access.
create table public.game_workspaces (
 draft_id uuid primary key references public.project_drafts(id) on delete cascade,
 project_id uuid not null references public.projects(id) on delete cascade,
 revision integer not null default 0, design jsonb, active_build_id uuid, published_build_id uuid,
 updated_at timestamptz not null default now()
);
create table public.game_revisions (
 draft_id uuid not null references public.game_workspaces(draft_id) on delete cascade,
 revision integer not null, design jsonb not null, source_context jsonb not null default '{}',
 created_by uuid references auth.users(id), created_at timestamptz not null default now(), primary key(draft_id,revision)
);
create table public.game_jobs (
 id uuid primary key default gen_random_uuid(), draft_id uuid not null references public.game_workspaces(draft_id) on delete cascade,
 kind text not null check(kind in ('generate','build','asset')), status text not null default 'queued' check(status in ('queued','running','completed','failed','cancelled','attention')),
 phase text not null default 'prepare', input jsonb not null, checkpoint jsonb not null default '{}', progress jsonb not null default '[]',
 lease_owner text, lease_until timestamptz, fence bigint not null default 0, attempts integer not null default 0,
 provider_started boolean not null default false, reserved_credits integer not null default 0, credits_settled boolean not null default false,
 requested_by uuid not null references auth.users(id), error text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index game_jobs_claim on public.game_jobs(kind,status,lease_until,created_at);
create unique index game_one_generation on public.game_jobs(draft_id) where kind='generate' and status in ('queued','running','attention');
create table public.game_builds (
 id uuid primary key references public.game_jobs(id), draft_id uuid not null references public.game_workspaces(draft_id) on delete cascade,
 source_revision integer not null, manifest jsonb not null, reports jsonb not null,
 status text not null check(status in ('accepted','rejected')), created_at timestamptz not null default now()
);
create table public.game_asset_revisions (
 id uuid primary key references public.game_jobs(id), draft_id uuid not null references public.game_workspaces(draft_id) on delete cascade,
 recipe_key text not null, artifact jsonb not null, created_at timestamptz not null default now()
);
create index game_assets_latest on public.game_asset_revisions(draft_id,recipe_key,created_at desc);
create table public.game_commands (
 draft_id uuid not null references public.game_workspaces(draft_id) on delete cascade, idempotency_key uuid not null,
 actor uuid not null references auth.users(id), command jsonb not null, result jsonb not null,
 created_at timestamptz not null default now(), primary key(draft_id,idempotency_key)
);
do $$ declare tbl text; begin
 foreach tbl in array array['game_workspaces','game_revisions','game_jobs','game_builds','game_asset_revisions','game_commands'] loop
  execute format('alter table public.%I enable row level security',tbl);
  execute format('revoke all on public.%I from public,anon,authenticated',tbl);
  execute format('grant all on public.%I to service_role',tbl);
  if tbl<>'game_commands' then
   execute format('grant select on public.%I to authenticated',tbl);
   execute format('create policy game_read on public.%I for select to authenticated using(app_private.can_read_draft(draft_id))',tbl);
  end if;
 end loop;
end $$;

create function public.game_commit_command(p_actor uuid,p_command jsonb,p_context jsonb default '{}',p_reserve integer default 0) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare did uuid:=(p_command->>'draftId')::uuid; pid uuid:=(p_command->>'projectId')::uuid;
 idem uuid:=(p_command->>'idempotencyKey')::uuid; act text:=p_command->>'action';
 w public.game_workspaces; old public.game_commands; j public.game_jobs; jid uuid; result jsonb; deduction record;
begin
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_actor,'role','authenticated')::text,true);
 if not app_private.can_edit_draft(did) or not exists(select 1 from public.project_drafts where id=did and project_id=pid) then raise exception 'Game workspace is not editable' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('game:'||did,0));
 select * into old from public.game_commands where draft_id=did and idempotency_key=idem;
 if found then
  if old.actor<>p_actor or old.command<>p_command then raise exception 'Idempotency key was used for a different command'; end if;
  return old.result;
 end if;
 insert into public.game_workspaces(draft_id,project_id) values(did,pid) on conflict do nothing;
 select * into strict w from public.game_workspaces where draft_id=did for update;
 if (p_command->>'expectedRevision')::integer is distinct from w.revision then raise exception 'Game revision conflict; reload before retrying' using errcode='40001'; end if;
 if act='save' then
  if p_command->'design' is null then raise exception 'Design required'; end if;
  update public.game_workspaces set design=p_command->'design',revision=revision+1,updated_at=now() where draft_id=did returning * into w;
  insert into public.game_revisions(draft_id,revision,design,created_by) values(did,w.revision,w.design,p_actor);
 elsif act in ('generate','build','asset') then
  if act<>'generate' and w.design is null then raise exception 'Generate a game design first'; end if;
  if (select count(*) from public.game_jobs where draft_id=did and status in ('queued','running','attention'))>=4 then raise exception 'Finish or cancel active game jobs first'; end if;
  if act='asset' and not exists(select 1 from jsonb_array_elements(w.design->'assets') a where a->>'key'=p_command->>'recipeKey') then raise exception 'Asset recipe not found'; end if;
  if p_reserve<0 or p_reserve>10000 then raise exception 'Invalid reservation'; end if;
  jid:=gen_random_uuid();
  if p_reserve>0 then
   select * into deduction from public.deduct_credits(p_actor,p_reserve,'Game generation reservation','game_reservation',jid::text,jsonb_build_object('kind',act));
   if not deduction.success then raise exception 'Insufficient credits for this game job'; end if;
  end if;
  insert into public.game_jobs(id,draft_id,kind,input,requested_by,reserved_credits)
  values(jid,did,act,jsonb_build_object('projectId',pid,'draftId',did,'sourceRevision',w.revision,'design',w.design,'prompt',p_command->>'prompt','recipeKey',p_command->>'recipeKey','context',p_context,
    'assets',coalesce((select jsonb_agg(a.artifact) from (select distinct on(recipe_key) artifact from public.game_asset_revisions where draft_id=did order by recipe_key,created_at desc) a),'[]'::jsonb)),p_actor,p_reserve);
 elsif act='cancel' then
  select * into j from public.game_jobs where id=(p_command->>'jobId')::uuid and draft_id=did for update;
  if not found then raise exception 'Job not found'; end if;
  if j.status in ('queued','running','attention') then
   update public.game_jobs set status='cancelled',fence=fence+1,lease_until=null,updated_at=now() where id=j.id;
   if not j.provider_started then perform public.game_settle_reservation(j.id,0); end if;
  end if;
 elsif act='publish' then
  if not exists(select 1 from public.game_builds where id=(p_command->>'buildId')::uuid and draft_id=did and status='accepted') then raise exception 'Publish requires an accepted build'; end if;
  update public.game_workspaces set published_build_id=(p_command->>'buildId')::uuid,updated_at=now() where draft_id=did;
 else raise exception 'Unsupported game command'; end if;
 result:=jsonb_build_object('revision',w.revision,'jobId',jid,'reservedCredits',p_reserve);
 insert into public.game_commands(draft_id,idempotency_key,actor,command,result) values(did,idem,p_actor,p_command,result);
 return result;
end $$;

create function public.game_settle_reservation(p_job uuid,p_charge integer) returns void
language plpgsql security invoker set search_path=public as $$
declare j public.game_jobs; refund integer; remaining integer;
begin
 select * into strict j from public.game_jobs where id=p_job for update;
 if j.credits_settled then return; end if;
 if p_charge<0 or p_charge>j.reserved_credits then raise exception 'Invalid game settlement'; end if;
 refund:=j.reserved_credits-p_charge;
 if refund>0 then
  update public.user_credits set balance=balance+refund,updated_at=now() where user_id=j.requested_by returning balance into remaining;
  if not found then raise exception 'Credit account missing'; end if;
  insert into public.credit_transactions(user_id,amount,balance_after,reason,reference_type,reference_id,metadata)
  values(j.requested_by,refund,remaining,'Unused game reservation','game_refund',j.id::text,jsonb_build_object('reserved',j.reserved_credits,'charged',p_charge));
 end if;
 update public.game_jobs set credits_settled=true where id=p_job;
end $$;

create function public.game_claim_job(p_worker text,p_kind text) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare j public.game_jobs;
begin
 -- A provider submit interrupted before its request ID is persisted requires reconciliation.
 update public.game_jobs set status='attention',error='Provider submission interrupted; reconcile before retrying',updated_at=now()
 where kind=p_kind and status='running' and lease_until<now() and provider_started and coalesce((checkpoint->>'pendingProvider')::boolean,false);
 update public.game_jobs set status='attention',error='Worker recovery limit reached; inspect checkpoints',updated_at=now()
 where kind=p_kind and status='running' and lease_until<now() and attempts>=3;
 select * into j from public.game_jobs where kind=p_kind and (status='queued' or (status='running' and lease_until<now()))
 order by created_at for update skip locked limit 1;
 if not found then return null; end if;
 update public.game_jobs set status='running',lease_owner=p_worker,lease_until=now()+interval '90 seconds',fence=fence+1,attempts=attempts+1,updated_at=now()
 where id=j.id returning * into j;
 return to_jsonb(j);
end $$;

create function public.game_heartbeat(p_job uuid,p_worker text,p_fence bigint) returns boolean
language plpgsql security invoker set search_path=public as $$
begin
 update public.game_jobs set lease_until=now()+interval '90 seconds',updated_at=now()
 where id=p_job and lease_owner=p_worker and fence=p_fence and status='running' and lease_until>now();
 return found;
end $$;

create function public.game_checkpoint(p_job uuid,p_worker text,p_fence bigint,p_phase text,p_checkpoint jsonb,p_progress jsonb,p_provider_started boolean default false) returns boolean
language plpgsql security invoker set search_path=public as $$
begin
 update public.game_jobs set phase=p_phase,checkpoint=p_checkpoint,progress=p_progress,provider_started=provider_started or p_provider_started,
 lease_until=now()+interval '90 seconds',updated_at=now()
 where id=p_job and lease_owner=p_worker and fence=p_fence and status='running' and lease_until>now();
 return found;
end $$;

create function public.game_finish_job(p_job uuid,p_worker text,p_fence bigint,p_result jsonb) returns boolean
language plpgsql security invoker set search_path=public as $$
declare j public.game_jobs; w public.game_workspaces; next_design jsonb; accepted boolean;
begin
 select * into j from public.game_jobs where id=p_job for update;
 if not found or j.status<>'running' or j.lease_owner<>p_worker or j.fence<>p_fence or j.lease_until<=now() then return false; end if;
 select * into strict w from public.game_workspaces where draft_id=j.draft_id for update;
 if j.kind='generate' then
  if w.revision<>(j.input->>'sourceRevision')::integer then
   update public.game_jobs set status='failed',error='Design changed during generation; regenerate against the current revision',updated_at=now() where id=j.id;
   perform public.game_settle_reservation(j.id,j.reserved_credits); return false;
  end if;
  next_design:=p_result->'design';
  if next_design is null then raise exception 'Generated design missing'; end if;
  update public.game_workspaces set design=next_design,revision=revision+1,updated_at=now() where draft_id=j.draft_id returning * into w;
  insert into public.game_revisions(draft_id,revision,design,source_context,created_by) values(w.draft_id,w.revision,w.design,j.input->'context',j.requested_by);
 elsif j.kind='build' then
  accepted:=(p_result->>'accepted')::boolean;
  insert into public.game_builds(id,draft_id,source_revision,manifest,reports,status)
  values(j.id,j.draft_id,(j.input->>'sourceRevision')::integer,p_result->'manifest',p_result->'reports',case when accepted then 'accepted' else 'rejected' end);
  if accepted and w.revision=(j.input->>'sourceRevision')::integer then update public.game_workspaces set active_build_id=j.id,updated_at=now() where draft_id=j.draft_id; end if;
 elsif j.kind='asset' then
  insert into public.game_asset_revisions(id,draft_id,recipe_key,artifact) values(j.id,j.draft_id,j.input->>'recipeKey',p_result->'artifact');
 end if;
 update public.game_jobs set status='completed',phase='complete',lease_until=null,checkpoint=p_result,updated_at=now() where id=j.id;
 perform public.game_settle_reservation(j.id,j.reserved_credits);
 return true;
end $$;

create function public.game_fail_job(p_job uuid,p_worker text,p_fence bigint,p_error text,p_attention boolean default false) returns boolean
language plpgsql security invoker set search_path=public as $$
declare j public.game_jobs;
begin
 update public.game_jobs set status=case when p_attention then 'attention' else 'failed' end,error=left(p_error,4000),lease_until=null,updated_at=now()
 where id=p_job and lease_owner=p_worker and fence=p_fence and status='running' and lease_until>now() returning * into j;
 if not found then return false; end if;
 if not j.provider_started then perform public.game_settle_reservation(j.id,0); end if;
 return true;
end $$;

-- Explicit service-only reconciliation after examining provider receipts. Never resubmit an
-- uncertain paid request automatically. The audit entry records the operator's evidence.
create table public.game_reconciliations (
 id uuid primary key default gen_random_uuid(), job_id uuid not null references public.game_jobs(id),
 charged_credits integer not null, evidence text not null check(length(evidence)>=10), created_at timestamptz not null default now()
);
alter table public.game_reconciliations enable row level security;
revoke all on public.game_reconciliations from public,anon,authenticated;
grant all on public.game_reconciliations to service_role;
create function public.game_reconcile_job(p_job uuid,p_charge integer,p_evidence text) returns void
language plpgsql security invoker set search_path=public as $$
declare j public.game_jobs;
begin
 select * into strict j from public.game_jobs where id=p_job for update;
 if j.status not in ('failed','cancelled','attention') then raise exception 'Only terminal or attention jobs can be reconciled'; end if;
 if length(trim(p_evidence))<10 then raise exception 'Provider receipt evidence is required'; end if;
 if j.credits_settled then return; end if;
 perform public.game_settle_reservation(j.id,p_charge);
 insert into public.game_reconciliations(job_id,charged_credits,evidence) values(j.id,p_charge,p_evidence);
 if j.status='attention' then update public.game_jobs set status='failed',fence=fence+1,updated_at=now() where id=j.id; end if;
end $$;

do $$ declare signature regprocedure; begin
 for signature in select oid::regprocedure from pg_proc where pronamespace='public'::regnamespace and proname in ('game_commit_command','game_settle_reservation','game_claim_job','game_checkpoint','game_finish_job','game_fail_job','game_heartbeat','game_reconcile_job') loop
  execute format('revoke all on function %s from public,anon,authenticated',signature);
  execute format('grant execute on function %s to service_role',signature);
 end loop;
end $$;
