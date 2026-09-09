-- Additive V2 saved-take runtime. No existing job is adopted or resubmitted.
alter table public.director_takes add column pricing_snapshot jsonb not null default '{}';
create table public.director_runtime_jobs (
 id uuid primary key default gen_random_uuid(), run_id uuid not null unique references public.output_workflow_runs(id) on delete cascade,
 session_id uuid not null references public.director_sessions(id) on delete cascade,
 project_id uuid not null references public.projects(id) on delete cascade, draft_id uuid not null references public.project_drafts(id) on delete cascade,
 take_id uuid references public.director_takes(id) on delete cascade, operation text not null check(operation in ('take','export')),
 execution_version text not null default 'director_v2' check(execution_version='director_v2'),
 phase text not null default 'prepare' check(phase in ('prepare','submit','await_provider','ingest','finalize','cancel','completed','cancelled','failed','attention')),
 snapshot jsonb not null, checkpoint jsonb not null default '{}',
 next_attempt_at timestamptz not null default now(), lease_owner text, lease_until timestamptz, lease_token bigint not null default 0,
 attempt_count integer not null default 0, submission_started boolean not null default false,
 provider_request_id text unique, provider_deadline timestamptz, provider_permit boolean not null default false,
 error_message text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index director_runtime_ready on public.director_runtime_jobs(next_attempt_at,created_at) where phase in ('prepare','submit','await_provider','ingest','finalize','cancel');
create index director_runtime_capacity on public.director_runtime_jobs(project_id,session_id) where provider_permit;
create index director_runtime_session on public.director_runtime_jobs(session_id);
create unique index director_runtime_take on public.director_runtime_jobs(take_id) where take_id is not null;
create index director_runtime_workflow on public.director_runtime_jobs((snapshot->>'workflowId'));
create table public.director_provider_inbox (
 request_id text not null, digest text not null, payload jsonb not null, received_at timestamptz not null default now(), primary key(request_id,digest)
);
create table public.director_usage_outbox (
 job_id uuid primary key references public.director_runtime_jobs(id) on delete cascade, payload jsonb not null,
 delivered_at timestamptz, attempts integer not null default 0, next_attempt_at timestamptz not null default now(), error_message text
);
create index director_usage_pending on public.director_usage_outbox(next_attempt_at) where delivered_at is null;
create table public.director_runtime_audit (
 id bigint generated always as identity primary key, job_id uuid references public.director_runtime_jobs(id) on delete cascade,
 actor text not null, action text not null, detail jsonb not null default '{}', created_at timestamptz not null default now()
);
-- A compact RLS-visible invalidation row; prompts/provider payloads never enter Realtime.
create table public.director_session_status (
 session_id uuid primary key references public.director_sessions(id) on delete cascade, draft_id uuid not null references public.project_drafts(id) on delete cascade,
 revision bigint not null default 1, phase text not null, updated_at timestamptz not null default now()
);
alter table public.director_runtime_jobs enable row level security;
alter table public.director_provider_inbox enable row level security;
alter table public.director_usage_outbox enable row level security;
alter table public.director_runtime_audit enable row level security;
alter table public.director_session_status enable row level security;
revoke all on public.director_runtime_jobs,public.director_provider_inbox,public.director_usage_outbox,public.director_runtime_audit,public.director_session_status from public,anon,authenticated;
grant all on public.director_runtime_jobs,public.director_provider_inbox,public.director_usage_outbox,public.director_runtime_audit,public.director_session_status to service_role;
grant select on public.director_session_status to authenticated;
grant usage,select on sequence public.director_runtime_audit_id_seq to service_role;
create policy director_status_read on public.director_session_status for select to authenticated using(app_private.can_read_draft(draft_id));
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then alter publication supabase_realtime add table public.director_session_status; end if;
end $$;

create function public.director_emit_status() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 insert into public.director_session_status(session_id,draft_id,phase) values(new.session_id,new.draft_id,new.phase)
 on conflict(session_id) do update set revision=director_session_status.revision+1,phase=excluded.phase,updated_at=now();
 return new;
end $$;
create trigger director_runtime_status after insert or update of phase on public.director_runtime_jobs for each row execute function public.director_emit_status();

-- Worker claims are short, fenced leases. A provider permit outlives the worker lease.
create function public.director_claim_job(p_worker text,p_lane text) returns jsonb language plpgsql security invoker set search_path=public as $$
declare j public.director_runtime_jobs;
begin
 if nullif(trim(p_worker),'') is null or p_lane not in ('orchestration','media','export') then raise exception 'Invalid worker'; end if;
 perform pg_advisory_xact_lock(hashtextextended('director_provider_capacity',0));
 select * into j from public.director_runtime_jobs q
 where q.phase in ('prepare','submit','await_provider','ingest','finalize','cancel') and q.next_attempt_at<=now()
 and (q.lease_until is null or q.lease_until<now())
 and (case when q.phase in ('submit','await_provider','finalize','cancel') then 'orchestration' when q.operation='export' then 'export' else 'media' end)=p_lane
 and (q.phase<>'submit' or q.provider_permit or (
   (select count(*) from public.director_runtime_jobs where provider_permit)<2
   and not exists(select 1 from public.director_runtime_jobs x where x.provider_permit and (x.project_id=q.project_id or x.session_id=q.session_id))))
 order by q.next_attempt_at,q.created_at for update skip locked limit 1;
 if not found then return null; end if;
 update public.director_runtime_jobs set lease_owner=p_worker,lease_until=now()+interval '90 seconds',lease_token=lease_token+1,
 attempt_count=attempt_count+1,provider_permit=provider_permit or phase='submit',updated_at=now() where id=j.id returning * into j;
 update public.output_workflow_runs set status='running',started_at=coalesce(started_at,now()),heartbeat_at=now(),worker_id=p_worker where id=j.run_id and status in ('queued','running');
 update public.output_workflow_run_steps set status='running',started_at=coalesce(started_at,now()) where run_id=j.run_id and status='queued';
 return to_jsonb(j);
end $$;

create function public.director_checkpoint(p_job uuid,p_worker text,p_token bigint,p_phase text,p_patch jsonb default '{}',p_delay integer default 0,p_error text default null) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare j public.director_runtime_jobs;
begin
 select * into strict j from public.director_runtime_jobs where id=p_job for update;
 if j.lease_owner is distinct from p_worker or j.lease_token<>p_token or j.lease_until<now() then raise exception 'Director lease lost' using errcode='40001'; end if;
 if p_phase='heartbeat' then
   update public.director_runtime_jobs set lease_until=now()+interval '90 seconds' where id=j.id; return to_jsonb(j);
 end if;
 if j.phase in ('completed','cancelled','failed','attention') then raise exception 'Director job is terminal'; end if;
 if not (p_phase=j.phase or p_phase in ('attention','failed') or
   (j.phase,p_phase) in (('prepare','submit'),('prepare','finalize'),('submit','await_provider'),('await_provider','ingest'),('ingest','finalize'),('cancel','cancelled'))) then raise exception 'Invalid Director phase transition'; end if;
 if j.checkpoint ? 'model' and p_patch ?| array['model','prompt','settings','references','firstFramePath','endFramePath'] then raise exception 'Effective generation input is immutable'; end if;
 update public.director_runtime_jobs set phase=p_phase,checkpoint=checkpoint||p_patch,
  provider_request_id=coalesce(p_patch->>'requestId',provider_request_id),
  provider_deadline=case when p_patch ? 'requestId' then coalesce(provider_deadline,now()+interval '10 minutes') else provider_deadline end,
  provider_permit=case when coalesce((p_patch->>'providerTerminal')::boolean,false) then false else provider_permit end,
  next_attempt_at=now()+make_interval(secs=>greatest(0,least(p_delay,300))),lease_owner=null,lease_until=null,
  attempt_count=case when phase<>p_phase or p_error is null then 0 else attempt_count end,error_message=p_error,updated_at=now() where id=j.id returning * into j;
 if j.take_id is not null then
   update public.director_takes set status=case when p_phase='prepare' then 'preparing' when p_phase in ('submit','await_provider') then 'generating'
    when p_phase in ('ingest','finalize') then 'saving' when p_phase='failed' then 'failed' else status end,
    provider_request_id=coalesce(j.provider_request_id,provider_request_id),error_message=p_error,updated_at=now() where id=j.take_id and status not in ('cancelled','completed');
   if p_phase='failed' and not j.submission_started then perform public.director_settle_credits(j.take_id,0); end if;
 end if;
 update public.output_workflow_runs set status=case when p_phase='failed' then 'failed' else status end,
  error_message=p_error,metadata=metadata||jsonb_build_object('directorPhase',p_phase),updated_at=now() where id=j.run_id;
 return to_jsonb(j);
end $$;

-- CAS BEFORE the non-transactional Fal POST. Once set, no automated path submits again.
create function public.director_begin_submission(p_job uuid,p_worker text,p_token bigint) returns boolean language plpgsql security invoker set search_path=public as $$
declare j public.director_runtime_jobs;
begin
 select * into strict j from public.director_runtime_jobs where id=p_job for update;
 if j.phase<>'submit' or j.lease_owner is distinct from p_worker or j.lease_token<>p_token or j.lease_until<now() then raise exception 'Director lease lost'; end if;
 if j.submission_started then return false; end if;
 update public.director_runtime_jobs set submission_started=true where id=j.id;
 update public.director_takes set submission_started=true where id=j.take_id;
 return true;
end $$;

-- Upload first to a lease-specific staging path, then atomically publish all DB effects.
create function public.director_finalize_job(p_job uuid,p_worker text,p_token bigint,p_usage jsonb default null) returns jsonb language plpgsql security invoker set search_path=public as $$
declare j public.director_runtime_jobs; a jsonb; t public.director_takes; output jsonb;
begin
 select * into strict j from public.director_runtime_jobs where id=p_job for update;
 if j.phase='completed' then return j.checkpoint->'asset'; end if;
 if j.phase<>'finalize' or j.lease_owner is distinct from p_worker or j.lease_token<>p_token or j.lease_until<now() then raise exception 'Director lease lost'; end if;
 a:=j.checkpoint->'asset';
 if a->>'assetKey' is null or a->>'storagePath' not like 'generated/director-v2/'||j.id||'/%' then raise exception 'No staged media'; end if;
 if j.take_id is not null then
  select * into strict t from public.director_takes where id=j.take_id for update;
  if t.status='cancelled' then raise exception 'Director generation cancelled'; end if;
 end if;
 insert into public.project_assets(project_id,key,name,kind,mime_type,storage_path,metadata)
 values(j.project_id,a->>'assetKey',case when j.operation='take' then 'Director take' else 'Director edit' end,'video','video/mp4',a->>'storagePath',
  a||jsonb_build_object('generatedBy','vibe_director','runId',j.run_id,'storageBucket','project-assets','executionVersion','director_v2'))
 on conflict(project_id,key) do update set storage_path=excluded.storage_path,metadata=excluded.metadata;
 if j.take_id is not null then
  perform public.director_settle_credits(t.id,t.credits_reserved);
  update public.director_takes set status='completed',asset_key=a->>'assetKey',duration_seconds=(a->>'durationSeconds')::float,error_message=null,updated_at=now() where id=t.id;
  if p_usage is null then raise exception 'Usage ledger payload required'; end if;
  insert into public.director_usage_outbox(job_id,payload) values(j.id,p_usage) on conflict do nothing;
 else
  insert into public.output_artifacts(project_id,draft_id,workflow_id,run_id,key,asset_key,name,kind,mime_type,metadata)
  values(j.project_id,j.draft_id,(j.snapshot->>'workflowId')::uuid,j.run_id,a->>'assetKey',a->>'assetKey','Director edit','video','video/mp4',a||jsonb_build_object('role','director_edit','sessionId',j.session_id))
  on conflict(draft_id,key) do update set asset_key=excluded.asset_key,metadata=excluded.metadata;
 end if;
 output:=jsonb_build_object('director',a||jsonb_build_object('takeId',j.take_id),'video',a);
 update public.output_workflow_runs set status='completed',outputs=output,completed_at=now(),error_message=null,metadata=metadata||jsonb_build_object('directorPhase','completed') where id=j.run_id;
 update public.output_workflow_run_steps set status='completed',outputs=output,completed_at=now(),error_message=null where run_id=j.run_id;
 update public.director_runtime_jobs set phase='completed',provider_permit=false,lease_owner=null,lease_until=null,updated_at=now(),error_message=null where id=j.id;
 return a;
end $$;

-- A late provider response may attach its ID after cancellation/lease loss, but may not publish media.
create function public.director_record_provider(p_job uuid,p_request text) returns void language plpgsql security invoker set search_path=public as $$
begin
 update public.director_runtime_jobs set provider_request_id=p_request,provider_deadline=coalesce(provider_deadline,now()+interval '10 minutes'),
  next_attempt_at=now(),updated_at=now() where id=p_job and submission_started and (provider_request_id is null or provider_request_id=p_request);
 if not found then raise exception 'Provider request mismatch'; end if;
 update public.director_takes set provider_request_id=p_request where id=(select take_id from public.director_runtime_jobs where id=p_job);
end $$;

create function public.director_cancel_owned_run() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if old.metadata->>'executionOwner'='director_v2' and new.metadata->>'executionOwner' is distinct from 'director_v2' then raise exception 'Director execution owner is immutable'; end if;
 if new.status='cancelled' and old.status is distinct from 'cancelled' and old.metadata->>'executionOwner'='director_v2' then
  update public.director_runtime_jobs set phase='cancel',lease_owner=null,lease_until=null,lease_token=lease_token+1,next_attempt_at=now(),updated_at=now() where run_id=new.id and phase<>'completed';
  update public.director_takes set status='cancelled',updated_at=now() where run_id=new.id and status not in ('completed','cancelled');
 end if;
 return new;
end $$;
create trigger director_owned_run before update on public.output_workflow_runs for each row execute function public.director_cancel_owned_run();

create function public.director_recover_job(p_actor uuid,p_run uuid) returns jsonb language plpgsql security invoker set search_path=public as $$
declare j public.director_runtime_jobs; resume text;
begin
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_actor,'role','authenticated')::text,true);
 select * into strict j from public.director_runtime_jobs where run_id=p_run for update;
 if not app_private.can_edit_draft(j.draft_id) then raise exception 'Workspace is not editable' using errcode='42501'; end if;
 if j.phase not in ('attention','failed') then return jsonb_build_object('runId',p_run,'phase',j.phase); end if;
 if j.submission_started and j.provider_request_id is null then raise exception 'Provider submission needs reconciliation before recovery'; end if;
 if exists(select 1 from public.director_takes where id=j.take_id and (status='cancelled' or credits_settled)) then raise exception 'This take cannot be resumed'; end if;
 resume:=case when j.checkpoint ? 'asset' then 'finalize' when j.checkpoint ? 'videoUrl' then 'ingest' when j.provider_request_id is not null then 'await_provider' when j.checkpoint ? 'model' then 'submit' else 'prepare' end;
 update public.director_runtime_jobs set phase=resume,attempt_count=0,next_attempt_at=now(),lease_owner=null,lease_until=null,error_message=null,
  provider_deadline=case when resume='await_provider' then now()+interval '10 minutes' else provider_deadline end,updated_at=now() where id=j.id;
 update public.output_workflow_runs set status='queued',error_message=null,completed_at=null where id=p_run;
 insert into public.director_runtime_audit(job_id,actor,action) values(j.id,p_actor::text,'recover');
 return jsonb_build_object('runId',p_run,'phase',resume);
end $$;

create function public.director_resolve_submission(p_job uuid,p_actor text,p_reason text,p_request text default null,p_charge integer default null) returns void language plpgsql security invoker set search_path=public as $$
declare j public.director_runtime_jobs;
begin
 if length(trim(p_reason))<10 or nullif(trim(p_actor),'') is null then raise exception 'Audited reconciliation reason and operator required'; end if;
 select * into strict j from public.director_runtime_jobs where id=p_job for update;
 if j.phase not in ('attention','cancelled','failed') then raise exception 'Job must need reconciliation'; end if;
 if (p_request is null)=(p_charge is null) then raise exception 'Supply either verified request ID or verified charge'; end if;
 if p_request is not null then
  if j.provider_request_id is not null and j.provider_request_id<>p_request then raise exception 'Provider request mismatch'; end if;
  update public.director_runtime_jobs set provider_request_id=p_request,phase=case when exists(select 1 from public.director_takes where id=j.take_id and status='cancelled') then 'cancel' else 'await_provider' end,
   provider_deadline=now()+interval '10 minutes',attempt_count=0,next_attempt_at=now(),updated_at=now() where id=j.id;
 else
  perform public.director_settle_credits(j.take_id,p_charge);
  insert into public.director_usage_outbox(job_id,payload) select j.id,jsonb_build_object(
   'idempotencyKey','director:'||t.id,'creditsCharged',t.credits_charged,
   'context',jsonb_build_object('userId',t.billed_user_id,'projectId',j.project_id,'draftId',j.draft_id,'outputWorkflowRunId',j.run_id),
   'line',jsonb_build_object('provider','fal','model',coalesce(j.checkpoint->>'model','minimax/h3-max'),'modality','video','operation','video_generation',
    'status',case when t.status='cancelled' then 'cancelled' else 'failed' end,'requestId',j.provider_request_id,
    'cost',jsonb_build_object('estimatedCostUsd',t.estimated_cost_usd,'actualCostUsd',0,'actualCredits',t.credits_charged,'estimatedCredits',t.credits_reserved,'priceSnapshot',t.pricing_snapshot,'pricingSource','operator_reconciliation'),
    'metadata',jsonb_build_object('reconciliationReason',p_reason,'operator',p_actor))) from public.director_takes t where t.id=j.take_id
   on conflict(job_id) do nothing;
  update public.director_runtime_jobs set phase=case when phase='cancelled' then phase else 'failed' end,provider_permit=false,updated_at=now() where id=j.id;
  update public.director_takes set status=case when status='cancelled' then status else 'failed' end where id=j.take_id;
  update public.output_workflow_runs set status=case when status='cancelled' then status else 'failed' end,completed_at=now() where id=j.run_id;
 end if;
 insert into public.director_runtime_audit(job_id,actor,action,detail) values(j.id,p_actor,'reconcile',jsonb_build_object('reason',p_reason,'requestId',p_request,'charged',p_charge));
end $$;

-- Service-only RPCs; browser callers cannot claim, settle, or submit.
do $$ declare f record; begin
 for f in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname in
 ('director_emit_status','director_claim_job','director_checkpoint','director_begin_submission','director_finalize_job','director_record_provider','director_cancel_owned_run','director_recover_job','director_resolve_submission') loop
 execute 'revoke all on function '||f.signature||' from public,anon,authenticated';
 execute 'grant execute on function '||f.signature||' to service_role';
 end loop;
end $$;

-- Preserve the legacy enqueue/command contracts; only explicitly admitted new jobs are owned.
create or replace function public.director_enqueue_run(p_session uuid,p_actor uuid,p_operation text,p_input jsonb) returns uuid
language plpgsql security invoker set search_path = public as $$
declare s public.director_sessions; w uuid:=gen_random_uuid(); n uuid:=gen_random_uuid(); r uuid:=gen_random_uuid(); owned boolean:=coalesce(current_setting('graphcore.director_executor',true),'')='director_v2' and p_operation in ('take','export'); snap jsonb;
begin
 select * into strict s from public.director_sessions where id=p_session;
 insert into public.output_workflows(id,project_id,draft_id,key,name,preset,created_by,metadata)
 values(w,s.project_id,s.draft_id,'director.'||r,'Director '||p_operation,'cinematic_trailer',p_actor,jsonb_build_object('directorSessionId',s.id)||case when owned then jsonb_build_object('executionOwner','director_v2') else '{}'::jsonb end);
 insert into public.output_workflow_nodes(id,workflow_id,draft_id,key,node_type,label,config)
 values(n,w,s.draft_id,'director','utility_transform','Director '||p_operation,jsonb_build_object('purpose','director_workspace','operation',p_operation,'execution',jsonb_build_object('resourceClass','video','maxConcurrency',1)));
 insert into public.output_workflow_runs(id,project_id,draft_id,workflow_id,requested_by,preset,target_format,input,metadata)
 values(r,s.project_id,s.draft_id,w,p_actor,'cinematic_trailer','video',p_input,jsonb_build_object('directorSessionId',s.id,'executionTarget','fly','debugSkipVideoGeneration',false)||case when owned then jsonb_build_object('executionOwner','director_v2') else '{}'::jsonb end);
 insert into public.output_workflow_run_steps(run_id,workflow_id,node_id,draft_id,node_key,node_type,label)
 values(r,w,n,s.draft_id,'director','utility_transform','Director '||p_operation);

 if owned then
   snap:=jsonb_build_object('settings',s.settings,'direction',s.direction,'userId',p_actor,'workflowId',w);
   if p_operation='take' then
     select snap||jsonb_build_object('take',to_jsonb(t),'references',coalesce((select jsonb_agg(ref||jsonb_build_object('storagePath',a.storage_path)) from jsonb_array_elements(t.context->'references') ref join public.project_assets a on a.project_id=s.project_id and a.key=ref->>'assetKey'),'[]'::jsonb),
       'firstFramePath',(select storage_path from public.project_assets where project_id=s.project_id and key=t.settings->>'firstFrameAssetKey'),
       'endFramePath',(select storage_path from public.project_assets where project_id=s.project_id and key=t.settings->>'endFrameAssetKey'),
       'parent',(select jsonb_build_object('storagePath',a.storage_path,'duration',pt.duration_seconds) from public.director_takes pt join public.project_assets a on a.project_id=pt.project_id and a.key=pt.asset_key where pt.id=t.parent_take_id)) into snap
     from public.director_takes t where t.id=(p_input->>'takeId')::uuid;
   else
     select snap||jsonb_build_object('clips',(select jsonb_agg(c||jsonb_build_object('storagePath',a.storage_path) order by ord) from jsonb_array_elements(e.clips) with ordinality v(c,ord) join public.director_takes t on t.id=(c->>'takeId')::uuid join public.project_assets a on a.project_id=s.project_id and a.key=t.asset_key)) into snap from public.director_edits e where e.id=(p_input->>'editId')::uuid;
   end if;
   if p_operation='take' and jsonb_array_length(coalesce(snap->'references','[]'))<>jsonb_array_length(coalesce(snap->'take'->'context'->'references','[]')) then raise exception 'A frozen reference asset is missing'; end if;
   if p_operation='export' and (coalesce(jsonb_array_length(snap->'clips'),0)<>(select jsonb_array_length(clips) from public.director_edits where id=(p_input->>'editId')::uuid)) then raise exception 'An export asset is missing'; end if;
   insert into public.director_runtime_jobs(run_id,session_id,project_id,draft_id,take_id,operation,snapshot)
   values(r,s.id,s.project_id,s.draft_id,(p_input->>'takeId')::uuid,p_operation,snap);
 end if;
 return r;
end $$;
revoke all on function public.director_enqueue_run(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.director_enqueue_run(uuid,uuid,text,jsonb) to service_role;


create or replace function public.director_commit_command(p_actor uuid,p_command jsonb) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
 sid uuid:=(p_command->>'sessionId')::uuid; did uuid:=(p_command->>'draftId')::uuid;
 pid uuid:=(p_command->>'projectId')::uuid; idem uuid:=(p_command->>'idempotencyKey')::uuid;
 act text:=p_command->>'action'; s public.director_sessions; t public.director_takes; parent public.director_takes;
 result jsonb; clips jsonb; c jsonb; takeid uuid; editid uuid; runid uuid; seconds double precision; found_branch boolean:=false;
 reserve integer; credit_result record;
begin
 -- Actor comes exclusively from verified Edge auth. RPC is not executable by browser roles.
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_actor,'role','authenticated')::text,true);
 if not app_private.can_edit_draft(did) or not exists(select 1 from public.project_drafts where id=did and project_id=pid) then raise exception 'Director workspace is not editable' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(sid::text,0));
 select dc.result into result from public.director_commands dc join public.director_sessions ds on ds.id=dc.session_id where dc.session_id=sid and dc.idempotency_key=idem and ds.project_id=pid and ds.draft_id=did;
 if found then return result; end if;
 if act='create' then
   insert into public.director_sessions(id,project_id,draft_id,title,source,settings,entity_keys,created_by)
   values(sid,pid,did,p_command->>'title',p_command->'source',p_command->'settings',p_command->'entityKeys',p_actor);
   insert into public.director_edits(session_id,clips) values(sid,'[]') returning id into editid;
   update public.director_sessions set active_edit_id=editid where id=sid;
 end if;
 select * into s from public.director_sessions where id=sid and draft_id=did and project_id=pid for update;
 if not found then raise exception 'Director session not found'; end if;
 if act<>'create' and (p_command->>'expectedRevision')::integer is distinct from s.revision then raise exception 'Director revision conflict; reload and retry' using errcode='40001'; end if;
 perform set_config('graphcore.director_executor',coalesce(p_command->>'executionVersion','legacy'),true);
 if act='generate' and p_command ?| array['direction','settings','entityKeys'] then
   update public.director_sessions set direction=coalesce(p_command->>'direction',direction),settings=coalesce(p_command->'settings',settings),entity_keys=coalesce(p_command->'entityKeys',entity_keys) where id=sid returning * into s;
   insert into public.director_messages(session_id,role,text) values(sid,'user',s.direction);
 end if;
 if act='direct' then
   update public.director_sessions set direction=p_command->>'direction',settings=p_command->'settings',entity_keys=p_command->'entityKeys' where id=sid;
   insert into public.director_messages(session_id,role,text) values(sid,'user',p_command->>'direction');
 elsif act='source' then
   update public.director_sessions set source=p_command->'source',direction=p_command->'source'->>'script' where id=sid;
   insert into public.director_messages(session_id,role,text) values(sid,'system','Selected the next scene or shot. Saved footage and edit history are unchanged.');
 elsif act in ('generate','live_start') then
   if length(trim(s.direction))=0 then raise exception 'Add direction before generating'; end if;
   update public.director_takes dt set status=r.status,error_message=r.error_message,updated_at=now()
   from public.output_workflow_runs r where dt.run_id=r.id and dt.session_id=sid and dt.status in ('queued','preparing','generating','saving') and r.status in ('failed','cancelled');
   update public.director_takes dt set status='failed',error_message='Live session ended. Recover any locally recorded footage.',updated_at=now()
   from public.director_live_sessions l where l.take_id=dt.id and dt.session_id=sid and dt.status='generating' and l.expires_at<now();
   for t in select dt.* from public.director_takes dt where dt.session_id=sid and dt.status in ('failed','cancelled') and not dt.credits_settled and not dt.submission_started and not exists(select 1 from public.director_live_sessions l where l.take_id=dt.id and l.negotiating) loop
     perform public.director_settle_credits(t.id,0);
   end loop;
   if exists(select 1 from public.director_takes where session_id=sid and status in ('queued','preparing','generating','saving')) then raise exception 'A take is already generating'; end if;
   if p_command->>'parentTakeId' is not null then
     select * into parent from public.director_takes where id=(p_command->>'parentTakeId')::uuid and session_id=sid and status='completed';
     if not found then raise exception 'Branch source must be a saved take in this session'; end if;
     seconds:=(p_command->>'branchSeconds')::double precision;
     if seconds is null or seconds<0 or seconds>parent.duration_seconds then raise exception 'Invalid branch point'; end if;
     if p_command->>'branchMode'='motion' and seconds<2 then raise exception 'Motion continuation needs at least two preceding seconds'; end if;
     select e.clips into clips from public.director_edits e where e.id=s.active_edit_id;
     for c in select value from jsonb_array_elements(coalesce(clips,'[]')) loop
       if c->>'takeId'=parent.id::text and seconds between (c->>'inSeconds')::float and (c->>'outSeconds')::float then found_branch:=true; exit; end if;
     end loop;
     if not found_branch then raise exception 'Keep this take in the edit before branching'; end if;
   end if;
   -- Cross-project references are never allowed, even if an internal caller is incorrect.
   for c in select value from jsonb_array_elements(p_command->'context'->'references') loop
     if not exists(select 1 from public.project_assets a where a.project_id=pid and a.key=c->>'assetKey') then raise exception 'Reference asset not found in this project'; end if;
   end loop;
   insert into public.director_takes(session_id,project_id,draft_id,prompt,settings,context,parent_take_id,branch_seconds,branch_mode,base_edit_id,estimated_cost_usd)
   values(sid,pid,did,p_command->>'providerPrompt',s.settings,p_command->'context',parent.id,seconds,coalesce(p_command->>'branchMode','frame'),s.active_edit_id,(p_command->>'estimatedCostUsd')::numeric) returning id into takeid;
   reserve:=greatest(1,ceil((p_command->>'estimatedCostUsd')::numeric*coalesce((p_command->>'creditsPerUsd')::numeric,100))::integer);
   perform 1 from public.user_credits where user_id=p_actor for update;
   select * into credit_result from public.deduct_credits(p_actor,reserve,'Director generation reservation','director_reservation',takeid::text,jsonb_build_object('sessionId',sid));
   if not credit_result.success then raise exception 'Insufficient credits for this Director take'; end if;
   update public.director_takes set billed_user_id=p_actor,credits_reserved=reserve,pricing_snapshot=coalesce(p_command->'pricingSnapshot','{}'::jsonb) where id=takeid;
   if act='live_start' then
     if (select count(*) from public.director_live_sessions where owner_id=p_actor and created_at>now()-interval '1 day')>=10 then raise exception 'Live beta daily session limit reached'; end if;
     if exists(select 1 from public.director_live_sessions where owner_id=p_actor and expires_at>now() and stopped_at is null) then raise exception 'Finish the active live session first'; end if;
     insert into public.director_live_sessions(take_id,owner_id) values(takeid,p_actor);
     update public.director_takes set status='generating' where id=takeid;
   else
     runid:=public.director_enqueue_run(sid,p_actor,'take',jsonb_build_object('takeId',takeid));
     update public.director_takes set run_id=runid where id=takeid;
   end if;
 elsif act='live_finish' then
   takeid:=(p_command->>'takeId')::uuid;
   select * into t from public.director_takes where id=takeid and session_id=sid;
   if not found or not exists(select 1 from public.director_live_sessions where take_id=takeid and owner_id=p_actor) then raise exception 'Live recording not found'; end if;
   if t.run_id is not null then runid:=t.run_id;
   else
     if exists(select 1 from generate_series(0,(p_command->>'chunkCount')::int-1) i where not exists(select 1 from public.director_live_chunks where take_id=takeid and chunk_index=i)) then raise exception 'Recording upload is incomplete'; end if;
     update public.director_live_sessions set stopped_at=coalesce(stopped_at,now()),chunk_count=(p_command->>'chunkCount')::int where take_id=takeid;
     runid:=public.director_enqueue_run(sid,p_actor,'live_finalize',jsonb_build_object('takeId',takeid));
     update public.director_takes set status='saving',run_id=runid where id=takeid;
   end if;
 elsif act='cancel' then
   perform 1 from public.director_runtime_jobs where take_id=(p_command->>'takeId')::uuid for update;
   update public.director_live_sessions set stopped_at=coalesce(stopped_at,now()) where take_id=(p_command->>'takeId')::uuid and exists(select 1 from public.director_takes where id=take_id and session_id=sid);
   update public.director_takes set status='cancelled',updated_at=now() where id=(p_command->>'takeId')::uuid and session_id=sid and status in ('queued','preparing','generating','saving') returning run_id into runid;
   update public.output_workflow_runs set status='cancelled',completed_at=now() where id=runid and status in ('queued','running');
   select * into t from public.director_takes where id=(p_command->>'takeId')::uuid and session_id=sid;
   if found and t.status='cancelled' and not t.submission_started and not exists(select 1 from public.director_live_sessions where take_id=t.id and negotiating) then perform public.director_settle_credits(t.id,0); end if;
 elsif act='review' then
   select * into t from public.director_takes where id=(p_command->>'takeId')::uuid and session_id=sid;
   if not found then raise exception 'Take not found'; end if;
   if p_command->>'review'='kept' then
     if t.status<>'completed' or t.asset_key is null then raise exception 'Wait for this take to be saved'; end if;
     select e.clips into clips from public.director_edits e where e.id=s.active_edit_id;
     clips:=coalesce(clips,'[]');
     if t.parent_take_id is not null then
       if t.base_edit_id is distinct from s.active_edit_id then raise exception 'The edit changed after this branch. Review the source edit before keeping it' using errcode='40001'; end if;
       result:='[]'; found_branch:=false;
       for c in select value from jsonb_array_elements(clips) loop
         if c->>'takeId'=t.parent_take_id::text and t.branch_seconds between (c->>'inSeconds')::float and (c->>'outSeconds')::float then
           if t.branch_seconds>(c->>'inSeconds')::float then result:=result||jsonb_build_array(jsonb_set(c,'{outSeconds}',to_jsonb(t.branch_seconds))); end if;
           found_branch:=true; exit;
         end if;
         result:=result||jsonb_build_array(c);
       end loop;
       if not found_branch then raise exception 'Branch point no longer exists in the edit'; end if;
       clips:=result;
     end if;
     if not exists(select 1 from jsonb_array_elements(clips) v where v->>'takeId'=t.id::text) then
       clips:=clips||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'takeId',t.id,'inSeconds',0,'outSeconds',least(t.duration_seconds,(t.settings->>'durationSeconds')::float)));
     end if;
     insert into public.director_edits(session_id,parent_id,clips) values(sid,s.active_edit_id,clips) returning id into editid;
     update public.director_sessions set active_edit_id=editid where id=sid;
   end if;
   update public.director_takes set review=p_command->>'review',updated_at=now() where id=t.id;
 elsif act='edit' then
   clips:=p_command->'clips';
   if (select count(*) from jsonb_array_elements(clips))<>(select count(distinct v->>'id') from jsonb_array_elements(clips) v) then raise exception 'Duplicate clip IDs'; end if;
   for c in select value from jsonb_array_elements(clips) loop
     select * into t from public.director_takes where id=(c->>'takeId')::uuid and session_id=sid and status='completed' and asset_key is not null;
     if not found or (c->>'inSeconds')::float<0 or (c->>'outSeconds')::float<=(c->>'inSeconds')::float or (c->>'outSeconds')::float>t.duration_seconds+0.025 then raise exception 'Invalid clip range'; end if;
   end loop;
   insert into public.director_edits(session_id,parent_id,clips) values(sid,s.active_edit_id,clips) returning id into editid;
   update public.director_sessions set active_edit_id=editid where id=sid;
 elsif act='restore_edit' then
   if not exists(select 1 from public.director_edits where id=(p_command->>'editId')::uuid and session_id=sid) then raise exception 'Edit revision not found'; end if;
   update public.director_sessions set active_edit_id=(p_command->>'editId')::uuid where id=sid;
 elsif act='export' then
   select e.clips into clips from public.director_edits e where e.id=s.active_edit_id;
   if clips is null or jsonb_array_length(clips)=0 then raise exception 'Keep footage before exporting'; end if;
   runid:=public.director_enqueue_run(sid,p_actor,'export',jsonb_build_object('sessionId',sid,'editId',s.active_edit_id,'settings',s.settings));
 elsif act<>'create' then raise exception 'Unknown director command';
 end if;
 update public.director_sessions set revision=revision+1,updated_at=now() where id=sid returning revision into s.revision;
 result:=jsonb_build_object('sessionId',sid,'revision',s.revision,'takeId',takeid,'runId',runid);
 insert into public.director_commands(session_id,idempotency_key,result) values(sid,idem,result);
 return result;
end $$;
revoke all on function public.director_commit_command(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.director_commit_command(uuid,jsonb) to service_role;

-- Identical legacy claim priority/recovery, with ownership exclusion on both paths.
create or replace function public.claim_output_workflow_run(worker_id text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed_run_id uuid;
  now_at timestamptz := timezone('utc'::text, now());
  p_worker_id text := trim(claim_output_workflow_run.worker_id);
  max_attempts constant integer := 4;
begin
  if p_worker_id is null or length(p_worker_id) = 0 then
    raise exception 'worker_id is required';
  end if;

  update public.output_workflow_runs as run
  set
    status = 'failed',
    error_message = coalesce(
      run.error_message,
      'The workflow run was abandoned after ' || run.attempt_count || ' attempts (worker heartbeat went stale).'
    ),
    completed_at = now_at,
    metadata = coalesce(run.metadata, '{}'::jsonb)
      || jsonb_build_object('failedReason', 'stale_heartbeat_attempts_exhausted', 'failedAt', now_at)
  where coalesce(run.metadata->>'executionOwner','') <> 'director_v2'
    and run.status = 'running'
    and coalesce(run.heartbeat_at, run.updated_at, run.created_at) < now_at - interval '5 minutes'
    and run.attempt_count >= max_attempts;

  with candidate as (
    select id
    from public.output_workflow_runs
    where coalesce(metadata->>'executionOwner','') <> 'director_v2'
    and (status = 'queued'
      or (
        status = 'running'
        and coalesce(heartbeat_at, updated_at, created_at) < now_at - interval '5 minutes'
        and attempt_count < max_attempts
      )
    )
    order by
      case
        when status = 'queued' and coalesce(metadata ->> 'stage', '') = 'waiting_resumable' then 1
        else 0
      end asc,
      created_at asc
    for update skip locked
    limit 1
  )
  update public.output_workflow_runs as run
  set
    status = 'running',
    worker_id = p_worker_id,
    attempt_count = run.attempt_count + 1,
    started_at = coalesce(run.started_at, now_at),
    heartbeat_at = now_at,
    error_message = null,
    metadata = coalesce(run.metadata, '{}'::jsonb)
      || jsonb_build_object('workerId', p_worker_id, 'claimedAt', now_at)
  from candidate
  where run.id = candidate.id
  returning run.id into claimed_run_id;

  return claimed_run_id;
end;
$$;

revoke all on function public.claim_output_workflow_run(text) from public, anon, authenticated;
grant execute on function public.claim_output_workflow_run(text) to service_role;

create function public.director_cancel_job(p_actor uuid,p_run uuid) returns boolean language plpgsql security invoker set search_path=public as $$
declare j public.director_runtime_jobs;
begin
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_actor,'role','authenticated')::text,true);
 select * into strict j from public.director_runtime_jobs where run_id=p_run for update;
 if not app_private.can_edit_draft(j.draft_id) then raise exception 'Workspace is not editable' using errcode='42501'; end if;
 if j.phase='completed' then return false; end if;
 update public.director_takes set status='cancelled',updated_at=now() where id=j.take_id and status<>'completed';
 update public.output_workflow_runs set status='cancelled',completed_at=now() where id=p_run;
 if not j.submission_started and j.take_id is not null then perform public.director_settle_credits(j.take_id,0); end if;
 return true;
end $$;
revoke all on function public.director_cancel_job(uuid,uuid) from public,anon,authenticated;
grant execute on function public.director_cancel_job(uuid,uuid) to service_role;

create function public.director_maintenance() returns jsonb language plpgsql security invoker set search_path=public as $$
declare alerts jsonb; orphans jsonb;
begin
 select coalesce(jsonb_agg(jsonb_build_object('jobId',q.id,'reason',case when q.provider_permit then 'Unresolved provider submission' else 'Unsettled credits' end)),'[]') into alerts
 from (select j.* from public.director_runtime_jobs j left join public.director_takes t on t.id=j.take_id where
  j.updated_at<now()-interval '24 hours' and (j.provider_permit or (not t.credits_settled and t.credits_reserved>0)) limit 100) q;
 -- Storage API performs deletion; never modify storage.objects directly.
 select coalesce(jsonb_agg(name),'[]') into orphans from (
  select o.name from storage.objects o join public.director_runtime_jobs j on split_part(o.name,'/',3)=j.id::text
  where o.bucket_id='project-assets' and o.name like 'generated/director-v2/%' and o.created_at<now()-interval '24 hours'
  and j.phase in ('completed','cancelled','failed') and not j.provider_permit
  and not exists(select 1 from public.project_assets a where a.storage_path=o.name)
  order by o.created_at limit 100
 ) objects;
 delete from public.director_provider_inbox i where received_at<now()-interval '7 days'
  and not exists(select 1 from public.director_runtime_jobs j where j.provider_request_id=i.request_id and j.phase not in ('completed','cancelled','failed'));
 return jsonb_build_object('alerts',alerts,'orphans',orphans);
end $$;
revoke all on function public.director_maintenance() from public,anon,authenticated;
grant execute on function public.director_maintenance() to service_role;

create function public.director_protect_snapshot() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if new.snapshot is distinct from old.snapshot or new.execution_version<>old.execution_version or new.run_id<>old.run_id then raise exception 'Director execution snapshot is immutable'; end if;
 return new;
end $$;
create trigger director_frozen_input before update on public.director_runtime_jobs for each row execute function public.director_protect_snapshot();
revoke all on function public.director_protect_snapshot() from public,anon,authenticated;
grant execute on function public.director_protect_snapshot() to service_role;

-- Defense in depth: even an old generic endpoint cannot create another run for an owned workflow.
create function app_private.protect_director_run_insert() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if exists(select 1 from public.director_runtime_jobs j where j.snapshot->>'workflowId'=new.workflow_id::text) then raise exception 'Use Director recovery for this workflow'; end if;
 if new.metadata->>'executionOwner'='director_v2' and coalesce(current_setting('graphcore.director_executor',true),'')<>'director_v2' then raise exception 'Director execution owner is service assigned'; end if;
 return new;
end $$;
create trigger director_run_insert before insert on public.output_workflow_runs for each row execute function app_private.protect_director_run_insert();
revoke all on function app_private.protect_director_run_insert() from public,anon,authenticated;

create function public.director_session_changed() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 insert into public.director_session_status(session_id,draft_id,phase) values(new.id,new.draft_id,'edit')
 on conflict(session_id) do update set revision=director_session_status.revision+1,updated_at=now();
 return new;
end $$;
create trigger director_edit_status after insert or update on public.director_sessions for each row execute function public.director_session_changed();
revoke all on function public.director_session_changed() from public,anon,authenticated;
grant execute on function public.director_session_changed() to service_role;

create function public.director_lookup_command(p_actor uuid,p_command jsonb) returns jsonb language plpgsql security invoker set search_path=public as $$
declare result jsonb;
begin
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_actor,'role','authenticated')::text,true);
 if not app_private.can_edit_draft((p_command->>'draftId')::uuid) then raise exception 'Workspace is not editable' using errcode='42501'; end if;
 select c.result into result from public.director_commands c join public.director_sessions s on s.id=c.session_id
 where c.session_id=(p_command->>'sessionId')::uuid and c.idempotency_key=(p_command->>'idempotencyKey')::uuid and s.project_id=(p_command->>'projectId')::uuid and s.draft_id=(p_command->>'draftId')::uuid;
 return result;
end $$;
revoke all on function public.director_lookup_command(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.director_lookup_command(uuid,jsonb) to service_role;
