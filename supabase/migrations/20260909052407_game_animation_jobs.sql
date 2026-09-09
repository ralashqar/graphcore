-- Animation jobs reuse game_jobs leases, game_job_steps, cancellation and recovery.
create table public.game_animation_rigs (
 draft_id uuid not null references public.game_workspaces(draft_id) on delete cascade,
 revision text not null check(length(revision)=64), profile jsonb not null,
 created_at timestamptz not null default now(), primary key(draft_id,revision)
);
create table public.game_animation_recipes (
 job_id uuid primary key references public.game_jobs(id), draft_id uuid not null references public.game_workspaces(draft_id) on delete cascade,
 recipe jsonb not null, rig_revision text not null, model_revision text not null, processing_version text not null,
 foreign key(draft_id,rig_revision) references public.game_animation_rigs(draft_id,revision)
);
create table public.game_animation_candidates (
 id uuid primary key, job_id uuid not null references public.game_animation_recipes(job_id),
 draft_id uuid not null references public.game_workspaces(draft_id) on delete cascade,
 candidate_index integer not null check(candidate_index between 0 and 2), source_path text not null,
 clip jsonb, diagnostics jsonb not null, created_at timestamptz not null default now(), unique(job_id,candidate_index)
);
create table public.game_animation_graphs (
 draft_id uuid not null references public.game_workspaces(draft_id) on delete cascade,
 revision integer not null, actor_definition text not null, graph jsonb not null,
 created_at timestamptz not null default now(), primary key(draft_id,revision,actor_definition)
);
do $$ declare t text; begin
 foreach t in array array['game_animation_rigs','game_animation_recipes','game_animation_candidates','game_animation_graphs'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('grant select,insert on public.%I to service_role',t);
  execute format('create policy game_animation_read on public.%I for select to authenticated using(app_private.can_read_draft(draft_id))',t);
 end loop;
end $$;

create function public.game_animation_command(p_actor uuid,p_command jsonb,p_rig jsonb default null,p_provider jsonb default null)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare did uuid:=(p_command->>'draftId')::uuid; pid uuid:=(p_command->>'projectId')::uuid;
 idem uuid:=(p_command->>'idempotencyKey')::uuid; w public.game_workspaces; old public.game_commands;
 jid uuid; result jsonb; binding jsonb; phase text;
begin
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_actor,'role','authenticated')::text,true);
 if not app_private.can_edit_draft(did) or not exists(select 1 from public.project_drafts where id=did and project_id=pid) then raise exception 'Game workspace is not editable' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('game:'||did,0));
 select * into old from public.game_commands where draft_id=did and idempotency_key=idem;
 if found then
  if old.actor<>p_actor or old.command<>p_command then raise exception 'Idempotency mismatch'; end if;
  return old.result;
 end if;
 select * into strict w from public.game_workspaces where draft_id=did for update;
 if w.project_id<>pid or w.design->>'schemaVersion'<>'3' then raise exception 'Unified game required'; end if;
 if (p_command->>'expectedRevision')::integer is distinct from w.revision then raise exception 'Game revision conflict' using errcode='40001'; end if;
 if p_command->>'action'='generate_animation' then
  if p_rig->>'revision' is distinct from p_command->'recipe'->>'rigRevision' or p_provider is null then raise exception 'Frozen rig and provider required'; end if;
  if p_provider->>'processingVersion' is distinct from 'animation-1.1.0' then raise exception 'Supported frozen processing version required'; end if;
  if (select count(*) from public.game_jobs where draft_id=did and status in ('queued','running','attention'))>=4 then raise exception 'Finish active game jobs first'; end if;
  jid:=gen_random_uuid();
  phase:=case when p_command->'recipe'->>'state' in ('catch','hang','shimmy_left','shimmy_right','climb') then 'ledge' else 'integration' end;
  perform public.game_animation_reserve_setup(jid,'kimodo-initial-2026-09',phase,(p_provider->>'reservationCents')::integer,'Game animation '||jid);
  insert into public.game_animation_rigs(draft_id,revision,profile) values(did,p_rig->>'revision',p_rig) on conflict do nothing;
  if not exists(select 1 from public.game_animation_rigs where draft_id=did and revision=p_rig->>'revision' and profile=p_rig) then raise exception 'Rig revision collision'; end if;
  insert into public.game_jobs(id,draft_id,kind,input,requested_by)
   values(jid,did,'asset',jsonb_build_object('projectId',pid,'sourceRevision',w.revision,'template','unified.v1','animation',jsonb_build_object('recipe',p_command->'recipe','rig',p_rig,'provider',p_provider)),p_actor);
  insert into public.game_animation_recipes(job_id,draft_id,recipe,rig_revision,model_revision,processing_version)
   values(jid,did,p_command->'recipe',p_rig->>'revision',p_provider->>'modelRevision',p_provider->>'processingVersion');
 elsif p_command->>'action'='bind_animation' then
  if not exists(select 1 from jsonb_array_elements(w.design->'nodes') n where n->>'kind'='actor_definition' and n->>'id'=p_command->'graph'->>'actorDefinition') then raise exception 'Actor definition not found'; end if;
  for binding in select * from jsonb_array_elements(p_command->'graph'->'bindings') loop
   if not exists(select 1 from public.game_animation_candidates c where c.draft_id=did and c.id=(binding->>'clipRevision')::uuid and c.clip->'validation'->>'accepted'='true' and c.clip->>'rigRevision'=p_command->'graph'->>'rigRevision' and c.clip->>'state'=binding->>'state') then raise exception 'Missing or incompatible accepted clip'; end if;
  end loop;
  update public.game_workspaces set revision=revision+1,updated_at=now() where draft_id=did returning * into w;
  insert into public.game_revisions(draft_id,revision,design,created_by) values(did,w.revision,w.design,p_actor);
  insert into public.game_animation_graphs(draft_id,revision,actor_definition,graph) values(did,w.revision,p_command->'graph'->>'actorDefinition',p_command->'graph');
 else raise exception 'Unsupported animation command'; end if;
 result:=jsonb_build_object('revision',w.revision,'jobId',jid,'reservedCredits',0);
 insert into public.game_commands(draft_id,idempotency_key,actor,command,result) values(did,idem,p_actor,p_command,result);
 return result;
end $$;

create function public.game_animation_register(p_job uuid,p_worker text,p_fence bigint,p_candidates jsonb)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare j public.game_jobs; c jsonb;
begin
 select * into j from public.game_jobs where id=p_job for update;
 if not found or j.status<>'running' or j.lease_owner<>p_worker or j.fence<>p_fence or j.lease_until<=now() then return false; end if;
 if j.input->'animation' is null or jsonb_array_length(p_candidates) not between 1 and 3 then raise exception 'Invalid animation registration'; end if;
 for c in select * from jsonb_array_elements(p_candidates) loop
  if c->>'sourcePath' not like 'generated/game/'||j.draft_id||'/'||j.id||'/%' then raise exception 'Invalid candidate ownership'; end if;
  if c->'clip' is not null and c->'clip'<>'null'::jsonb then
   if c->'clip'->>'rigRevision' is distinct from j.input->'animation'->'rig'->>'revision' or c->'clip'->>'state' is distinct from j.input->'animation'->'recipe'->>'state' or c->'clip'->'validation'->>'accepted' is distinct from 'true' or c->'clip'->>'storagePath' not like 'generated/game/'||j.draft_id||'/'||j.id||'/%' then raise exception 'Invalid clip registration'; end if;
  end if;
  insert into public.game_animation_candidates(id,job_id,draft_id,candidate_index,source_path,clip,diagnostics)
   values((c->>'id')::uuid,j.id,j.draft_id,(c->>'index')::integer,c->>'sourcePath',nullif(c->'clip','null'::jsonb),c->'diagnostics');
 end loop;
 update public.game_jobs set status='completed',phase='register',lease_until=null,credits_settled=true,updated_at=now() where id=j.id;
 return true;
end $$;
revoke all on function public.game_animation_command(uuid,jsonb,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.game_animation_register(uuid,text,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.game_animation_command(uuid,jsonb,jsonb,jsonb) to service_role;
grant execute on function public.game_animation_register(uuid,text,bigint,jsonb) to service_role;

-- Freeze graph/clip/rig bindings inside the same transaction as build admission.
alter function public.game_commit_command(uuid,jsonb,jsonb,integer) rename to game_commit_before_animation;
create function public.game_commit_command(p_actor uuid,p_command jsonb,p_context jsonb default '{}',p_reserve integer default 0)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare result jsonb; jid uuid; j public.game_jobs; graphs jsonb; clips jsonb; rigs jsonb;
begin
 result:=public.game_commit_before_animation(p_actor,p_command,p_context,p_reserve);
 jid:=(result->>'jobId')::uuid;
 if p_command->>'action'='build' and jid is not null then
  select * into j from public.game_jobs where id=jid for update;
  if j.input->'animationSnapshot' is null and j.input->>'template'='unified.v1' then
   select coalesce(jsonb_agg(graph),'[]') into graphs from (select distinct on(actor_definition) graph from public.game_animation_graphs where draft_id=j.draft_id and revision<=(j.input->>'sourceRevision')::integer order by actor_definition,revision desc) latest;
   select coalesce(jsonb_agg(c.clip||jsonb_build_object('recipeKey','animation.'||c.id)),'[]') into clips from public.game_animation_candidates c where c.draft_id=j.draft_id and c.clip is not null and exists(select 1 from jsonb_array_elements(graphs) g cross join lateral jsonb_array_elements(g->'bindings') b where b->>'clipRevision'=c.id::text);
   select coalesce(jsonb_agg(r.profile),'[]') into rigs from public.game_animation_rigs r where r.draft_id=j.draft_id and exists(select 1 from jsonb_array_elements(graphs) g where g->>'rigRevision'=r.revision);
   update public.game_jobs set input=input||jsonb_build_object('animationSnapshot',jsonb_build_object('version',1,'graphs',graphs,'rigs',rigs),'animationClips',clips) where id=jid;
  end if;
 end if;
 return result;
end $$;
revoke all on function public.game_commit_command(uuid,jsonb,jsonb,integer) from public,anon,authenticated;
grant execute on function public.game_commit_command(uuid,jsonb,jsonb,integer) to service_role;

-- Recovery uses the existing retry command, but never creates another GPU job.
create function public.game_retry_animation_command(p_actor uuid,p_command jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare j public.game_jobs; w public.game_workspaces; old public.game_commands; result jsonb;
begin
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_actor,'role','authenticated')::text,true);
 if p_command->>'action'<>'retry' then raise exception 'Expected recovery command'; end if;
 if not app_private.can_edit_draft((p_command->>'draftId')::uuid) then raise exception 'Draft is not editable' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('game:'||(p_command->>'draftId'),0));
 select * into old from public.game_commands where draft_id=(p_command->>'draftId')::uuid and idempotency_key=(p_command->>'idempotencyKey')::uuid;
 if found then
  if old.actor<>p_actor or old.command<>p_command then raise exception 'Idempotency conflict'; end if;
  return old.result;
 end if;
 select * into strict w from public.game_workspaces where draft_id=(p_command->>'draftId')::uuid for update;
 if w.project_id<>(p_command->>'projectId')::uuid then raise exception 'Project mismatch' using errcode='42501'; end if;
 if w.revision<>(p_command->>'expectedRevision')::integer then raise exception 'Revision conflict' using errcode='40001'; end if;
 select * into strict j from public.game_jobs where id=(p_command->>'jobId')::uuid and draft_id=w.draft_id for update;
 if j.status<>'failed' or j.kind<>'asset' or j.input->'animation' is null then raise exception 'Only failed animation processing can resume'; end if;
 if jsonb_typeof(j.checkpoint->'animationSources') is distinct from 'array' then raise exception 'Generated motion is not durably stored; reconcile provider work first'; end if;
 if jsonb_array_length(j.checkpoint->'animationSources') is distinct from (j.input->'animation'->'recipe'->>'candidates')::integer then raise exception 'Incomplete source motion checkpoint'; end if;
 if coalesce((j.checkpoint->>'pendingProvider')::boolean,false) then raise exception 'Uncertain provider work requires reconciliation'; end if;
 if j.attempts>=3 then raise exception 'Recovery limit reached'; end if;
 update public.game_jobs set status='queued',fence=fence+1,error=null,lease_owner=null,lease_until=null where id=j.id;
 result:=jsonb_build_object('revision',w.revision,'jobId',j.id,'reservedCredits',0);
 insert into public.game_commands(draft_id,idempotency_key,actor,command,result) values(w.draft_id,(p_command->>'idempotencyKey')::uuid,p_actor,p_command,result);
 return result;
end $$;
revoke all on function public.game_retry_animation_command(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.game_retry_animation_command(uuid,jsonb) to service_role;
