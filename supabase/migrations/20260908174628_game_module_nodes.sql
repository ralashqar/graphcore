create table public.game_spec_nodes (
 draft_id uuid not null, revision integer not null, node_id text not null, kind text not null,
 spec jsonb not null, created_at timestamptz not null default now(),
 primary key(draft_id,revision,node_id), foreign key(draft_id,revision) references public.game_revisions(draft_id,revision) on delete cascade
);
create table public.game_job_steps (
 job_id uuid not null references public.game_jobs(id) on delete cascade,
 draft_id uuid not null references public.project_drafts(id) on delete cascade,
 node_id text not null, input_hash text not null, dependencies jsonb not null default '[]',
 status text not null check(status in ('running','completed','failed','cached')),
 attempt integer not null default 1, output jsonb, diagnostic text, updated_at timestamptz not null default now(),
 primary key(job_id,node_id)
);
create index game_step_cache on public.game_job_steps(draft_id,node_id,input_hash) where status in ('completed','cached');
do $$ declare t text; begin
 foreach t in array array['game_spec_nodes','game_job_steps'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('grant all on public.%I to service_role',t);
  execute format('create policy game_module_read on public.%I for select to authenticated using(app_private.can_read_draft(draft_id))',t);
 end loop;
end $$;
create function app_private.game_capture_nodes() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if new.design->>'schemaVersion'='2' then
  insert into public.game_spec_nodes(draft_id,revision,node_id,kind,spec)
  select new.draft_id,new.revision,n->>'id',n->>'kind',n from jsonb_array_elements(new.design->'nodes') n;
 end if;
 return new;
end $$;
create trigger capture_game_nodes after insert on public.game_revisions for each row execute function app_private.game_capture_nodes();

create function public.game_write_step(p_job uuid,p_worker text,p_fence bigint,p_node text,p_hash text,p_status text,p_output jsonb default null,p_diagnostic text default null,p_dependencies jsonb default '[]') returns boolean
language plpgsql security invoker set search_path=public as $$
declare j public.game_jobs; s public.game_job_steps;
begin
 select * into j from public.game_jobs where id=p_job for update;
 if not found or j.status<>'running' or j.lease_owner<>p_worker or j.fence<>p_fence or j.lease_until<=now() then return false; end if;
 if p_status not in ('running','completed','failed','cached') or length(p_hash)<>64 then raise exception 'Invalid step'; end if;
 select * into s from public.game_job_steps where job_id=p_job and node_id=p_node for update;
 if found and s.input_hash<>p_hash then raise exception 'Step input cannot change during a run'; end if;
 if found and s.status in ('completed','cached') then return true; end if;
 if found and p_status='running' and s.attempt>=3 then raise exception 'Step retry limit reached'; end if;
 insert into public.game_job_steps(job_id,draft_id,node_id,input_hash,status,output,diagnostic,dependencies)
 values(p_job,j.draft_id,p_node,p_hash,p_status,p_output,left(p_diagnostic,4000),p_dependencies)
 on conflict(job_id,node_id) do update set status=p_status,output=p_output,diagnostic=left(p_diagnostic,4000),updated_at=now(),attempt=game_job_steps.attempt+case when p_status='running' then 1 else 0 end;
 return true;
end $$;

-- Extend the existing transactional admission path, preserving its authorization,
-- lock order, command identity, billing and cancellation behavior.
do $$ declare body text; begin
 body:=pg_get_functiondef('public.game_commit_command(uuid,jsonb,jsonb,integer)'::regprocedure);
 if position('elsif act in (''generate'',''build'',''asset'')' in body)=0 then raise exception 'Unexpected game command implementation'; end if;
 body:=replace(body,'jid uuid; result jsonb;','jid uuid; result jsonb; candidate jsonb;');
 body:=replace(body,'if p_command->''design'' is null then raise exception ''Design required''; end if;',
 'candidate:=p_command->''design'';
  if candidate is null and p_command->''nodeEdits'' is not null then
   if w.design->>''schemaVersion''<>''2'' then raise exception ''Node edits require a module design''; end if;
   if exists(select 1 from jsonb_array_elements(p_command->''nodeEdits'') e where not exists(select 1 from jsonb_array_elements(w.design->''nodes'') n where n->>''id''=e->>''id'' and n->>''kind''=e->>''kind'')) then raise exception ''Unknown node or changed kind''; end if;
   candidate:=jsonb_set(w.design,''{nodes}'',(select jsonb_agg(coalesce((select e from jsonb_array_elements(p_command->''nodeEdits'') e where e->>''id''=n->>''id''),n)) from jsonb_array_elements(w.design->''nodes'') n));
  end if;
  if candidate is null then raise exception ''Design required''; end if;');
 body:=replace(body,'design=p_command->''design'',revision=revision+1','design=candidate,revision=revision+1');
 body:=replace(body,'elsif act in (''generate'',''build'',''asset'')','elsif act in (''generate'',''build'',''asset'',''test'')');
 body:=replace(body,'values(jid,did,act,jsonb_build_object(', 'values(jid,did,case when act=''test'' then ''build'' else act end,jsonb_build_object(');
 body:=replace(body,'''context'',p_context,','''context'',p_context,''targetNodeIds'',p_command->''targetNodeIds'',''template'',p_command->''template'',''testOnly'',act=''test'',');
 execute body;
 body:=pg_get_functiondef('public.game_finish_job(uuid,text,bigint,jsonb)'::regprocedure);
 body:=replace(body,'if accepted and w.revision=', 'if accepted and not coalesce((j.input->>''testOnly'')::boolean,false) and w.revision=');
 execute body;
end $$;

create function public.game_retry_module_command(p_actor uuid,p_command jsonb) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare j public.game_jobs; w public.game_workspaces; old public.game_commands; result jsonb;
begin
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_actor,'role','authenticated')::text,true);
 if not app_private.can_edit_draft((p_command->>'draftId')::uuid) then raise exception 'Draft is not editable' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('game:'||(p_command->>'draftId'),0));
 select * into old from public.game_commands where draft_id=(p_command->>'draftId')::uuid and idempotency_key=(p_command->>'idempotencyKey')::uuid;
 if found then if old.actor<>p_actor or old.command<>p_command then raise exception 'Idempotency conflict'; end if; return old.result; end if;
 select * into strict w from public.game_workspaces where draft_id=(p_command->>'draftId')::uuid for update;
 if w.project_id<>(p_command->>'projectId')::uuid then raise exception 'Project mismatch' using errcode='42501'; end if;
 if w.revision<>(p_command->>'expectedRevision')::integer then raise exception 'Revision conflict' using errcode='40001'; end if;
 select * into strict j from public.game_jobs where id=(p_command->>'jobId')::uuid and draft_id=w.draft_id for update;
 if j.status<>'failed' or j.kind<>'build' or j.input->'design'->>'schemaVersion'<>'2' then raise exception 'Only failed deterministic module builds can resume'; end if;
 if j.input->>'sourceRevision'<>w.revision::text then raise exception 'Build uses a stale revision'; end if;
 if j.attempts>=3 then raise exception 'Recovery limit reached'; end if;
 update public.game_jobs set status='queued',fence=fence+1,error=null,lease_owner=null,lease_until=null where id=j.id;
 result:=jsonb_build_object('revision',w.revision,'jobId',j.id,'reservedCredits',0);
 insert into public.game_commands(draft_id,idempotency_key,actor,command,result) values(w.draft_id,(p_command->>'idempotencyKey')::uuid,p_actor,p_command,result);
 return result;
end $$;
revoke all on function public.game_write_step(uuid,text,bigint,text,text,text,jsonb,text,jsonb) from public,anon,authenticated;
grant execute on function public.game_write_step(uuid,text,bigint,text,text,text,jsonb,text,jsonb) to service_role;
revoke all on function public.game_retry_module_command(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.game_retry_module_command(uuid,jsonb) to service_role;
revoke all on function app_private.game_capture_nodes() from public,anon,authenticated;
grant execute on function app_private.game_capture_nodes() to service_role;
