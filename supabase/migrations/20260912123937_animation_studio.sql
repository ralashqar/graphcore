-- Animation jobs may belong to an animation library without creating a game design.
-- Retain the real project draft as the authorization/storage scope.
do $$ declare t text; c record; begin
 foreach t in array array['game_jobs','game_job_steps','game_animation_rigs','game_animation_recipes','game_animation_candidates','game_animation_reviews'] loop
  for c in select conname from pg_constraint where conrelid=('public.'||t)::regclass and confrelid='public.game_workspaces'::regclass loop
   execute format('alter table public.%I drop constraint %I',t,c.conname);
   execute format('alter table public.%I add constraint %I foreign key(draft_id) references public.project_drafts(id) on delete cascade',t,c.conname);
  end loop;
 end loop;
end $$;
create table public.animation_studio_workspaces (
 id uuid primary key, project_id uuid not null references public.projects(id) on delete cascade,
 draft_id uuid not null references public.project_drafts(id) on delete cascade,
 revision integer not null default 0, graph jsonb not null, created_by uuid not null references auth.users(id),
 updated_at timestamptz not null default now()
);
create table public.animation_studio_revisions (
 workspace_id uuid not null references public.animation_studio_workspaces(id) on delete cascade,
 draft_id uuid not null references public.project_drafts(id), revision integer not null, graph jsonb not null,
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), primary key(workspace_id,revision)
);
create table public.animation_studio_commands (
 workspace_id uuid not null references public.animation_studio_workspaces(id) on delete cascade,
 idempotency_key uuid not null, actor uuid not null references auth.users(id), command jsonb not null, result jsonb not null,
 primary key(workspace_id,idempotency_key)
);
create table public.animation_studio_reviews (
 workspace_id uuid not null, revision integer not null, draft_id uuid not null references public.project_drafts(id),
 evidence jsonb not null, actor uuid not null references auth.users(id), created_at timestamptz not null default now(),
 primary key(workspace_id,revision), foreign key(workspace_id,revision) references public.animation_studio_revisions(workspace_id,revision)
);
create table public.animation_studio_bindings (
 draft_id uuid not null references public.game_workspaces(draft_id) on delete cascade, revision integer not null,
 actor_definition text not null, workspace_id uuid not null, studio_revision integer not null, snapshot jsonb not null,
 primary key(draft_id,revision,actor_definition), foreign key(workspace_id,studio_revision) references public.animation_studio_reviews(workspace_id,revision)
);
create index animation_studio_project on public.animation_studio_workspaces(project_id,updated_at desc);
do $$ declare t text; begin
 foreach t in array array['animation_studio_workspaces','animation_studio_revisions','animation_studio_reviews','animation_studio_bindings'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('grant all on public.%I to service_role',t);
  execute format('create policy studio_read on public.%I for select to authenticated using(app_private.can_read_draft(draft_id))',t);
 end loop;
end $$;
alter table public.animation_studio_commands enable row level security;
revoke all on public.animation_studio_commands from public,anon,authenticated;
grant all on public.animation_studio_commands to service_role;
alter table public.game_jobs add column animation_workspace_id uuid references public.animation_studio_workspaces(id);
create index game_jobs_animation_workspace on public.game_jobs(animation_workspace_id,created_at desc);

create function public.animation_studio_command(p_actor uuid,p_command jsonb,p_prepared jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare wid uuid:=(p_command->>'workspaceId')::uuid; did uuid:=(p_command->>'draftId')::uuid; pid uuid:=(p_command->>'projectId')::uuid;
 act text:=p_command->>'action'; w public.animation_studio_workspaces; old public.animation_studio_commands;
 jid uuid; ids jsonb:='[]'; item jsonb; j public.game_jobs; c public.game_animation_candidates; result jsonb;
 deduction record; reserve integer:=coalesce((p_prepared->>'credits')::integer,0); target public.game_workspaces;
begin
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_actor,'role','authenticated')::text,true);
 if not app_private.can_edit_draft(did) or not exists(select 1 from public.project_drafts where id=did and project_id=pid) then raise exception 'Animation workspace is not editable' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('animation-studio:'||wid,0));
 select * into old from public.animation_studio_commands where workspace_id=wid and idempotency_key=(p_command->>'idempotencyKey')::uuid;
 if found then
  if old.actor<>p_actor or old.command<>p_command then raise exception 'Idempotency mismatch'; end if;
  return old.result;
 end if;
 select * into w from public.animation_studio_workspaces where id=wid for update;
 if not found then
  if act<>'save' or (p_command->>'expectedRevision')::integer<>0 then raise exception 'Save the animation workspace first'; end if;
  insert into public.animation_studio_workspaces(id,project_id,draft_id,graph,created_by) values(wid,pid,did,p_prepared->'graph',p_actor) returning * into w;
 end if;
 if w.project_id<>pid or w.draft_id<>did then raise exception 'Animation workspace scope mismatch' using errcode='42501'; end if;
 if w.revision<>(p_command->>'expectedRevision')::integer then raise exception 'Animation revision conflict' using errcode='40001'; end if;
 if act='save' then
  if p_prepared->'graph'->>'version' is distinct from '2' then raise exception 'Validated graph required'; end if;
  -- Clip references can only survive a matching immutable contract and accepted review.
  for item in select * from jsonb_array_elements(p_prepared->'graph'->'nodes') where value->>'clipId' is not null loop
   if not exists(select 1 from public.game_animation_candidates c join public.game_animation_reviews r on r.candidate_id=c.id where c.id=(item->>'clipId')::uuid and c.draft_id=did and r.decision='accepted' and c.clip->>'motionContract'=item->>'contractHash') then raise exception 'Unreviewed or stale clip reference'; end if;
  end loop;
  update public.animation_studio_workspaces set graph=p_prepared->'graph',revision=revision+1,updated_at=now() where id=wid returning * into w;
 elsif act='plan' then
  jid:=gen_random_uuid();
  if reserve<0 or reserve>10000 then raise exception 'Invalid planning reservation'; end if;
  if reserve>0 then
   select * into deduction from public.deduct_credits(p_actor,reserve,'Animation graph planning','game_reservation',jid::text,jsonb_build_object('kind','animation_plan'));
   if not deduction.success then raise exception 'Insufficient credits for animation planning'; end if;
  end if;
  insert into public.game_jobs(id,draft_id,animation_workspace_id,kind,input,requested_by,reserved_credits) values(jid,did,wid,'generate',jsonb_build_object('projectId',pid,'sourceRevision',w.revision,'studioPlan',p_command,'graph',w.graph,'context',jsonb_build_object('studioVersion','animation-studio-1.0.0')),p_actor,reserve);
  ids:=jsonb_build_array(jid);
 elsif act in ('generate','import_source') then
  if jsonb_array_length(p_prepared->'requests')<1 then raise exception 'No generation requests'; end if;
  if (select coalesce(sum((r->'provider'->>'reservationCents')::integer),0) from jsonb_array_elements(p_prepared->'requests') r)>(p_command->>'maxReservationCents')::integer then raise exception 'Reservation exceeds selected maximum'; end if;
  for item in select * from jsonb_array_elements(p_prepared->'requests') loop
   if not exists(select 1 from jsonb_array_elements(w.graph->'nodes') n where n->>'id'=item->>'nodeId' and n->>'contractHash'=item->'recipe'->>'motionContract') then raise exception 'Recipe does not match frozen node'; end if;
   jid:=gen_random_uuid();
   if act='generate' then
    perform public.game_animation_reserve_setup(jid,'kimodo-initial-2026-09','integration',(item->'provider'->>'reservationCents')::integer,'Animation studio '||jid);
   elsif item->'import'->>'sourcePath' is null then raise exception 'Owned source required'; end if;
   insert into public.game_animation_rigs(draft_id,revision,profile) values(did,item->'rig'->>'revision',item->'rig') on conflict do nothing;
   if not exists(select 1 from public.game_animation_rigs where draft_id=did and revision=item->'rig'->>'revision' and profile=item->'rig') then raise exception 'Rig revision collision'; end if;
   insert into public.game_jobs(id,draft_id,animation_workspace_id,kind,input,requested_by) values(jid,did,wid,'asset',jsonb_build_object('projectId',pid,'sourceRevision',w.revision,'studioNode',item->>'nodeId','animation',item),p_actor);
   insert into public.game_animation_recipes(job_id,draft_id,recipe,rig_revision,model_revision,processing_version) values(jid,did,item->'recipe',item->'rig'->>'revision',item->'provider'->>'modelRevision',item->'provider'->>'processingVersion');
   ids:=ids||jsonb_build_array(jid);
  end loop;
 elsif act in ('cancel','retry') then
  select * into strict j from public.game_jobs where id=(p_command->>'jobId')::uuid and animation_workspace_id=wid for update;
  if act='cancel' and j.status in ('queued','running','attention') then
   update public.game_jobs set status='cancelled',fence=fence+1,lease_until=null where id=j.id;
   if not j.provider_started then perform public.game_settle_reservation(j.id,0); end if;
  elsif act='retry' then
   if j.status<>'failed' or j.input->'animation' is null or jsonb_typeof(j.checkpoint->'animationSources') is distinct from 'array' then raise exception 'Only saved-source processing may retry; reconcile uncertain submissions'; end if;
   update public.game_jobs set status='queued',error=null,fence=fence+1,lease_owner=null,lease_until=null where id=j.id;
  end if;
 elsif act='review_clip' then
  select c0.* into strict c from public.game_animation_candidates c0 join public.game_jobs j0 on j0.id=c0.job_id where c0.id=(p_command->>'candidateId')::uuid and j0.animation_workspace_id=wid and j0.input->>'studioNode'=p_command->>'nodeId';
  if exists(select 1 from public.game_animation_reviews where candidate_id=c.id and decision<>p_command->>'decision') then raise exception 'Clip review is immutable'; end if;
  if p_command->>'decision'='accepted' then
   if c.clip is null or c.clip->'validation'->>'accepted' is distinct from 'true' or not exists(select 1 from jsonb_array_elements(w.graph->'nodes') n where n->>'id'=p_command->>'nodeId' and n->>'contractHash'=c.clip->>'motionContract') then raise exception 'Candidate is invalid or stale'; end if;
   update public.animation_studio_workspaces set graph=jsonb_set(graph,'{nodes}',(select jsonb_agg(case when n->>'id'=p_command->>'nodeId' then n||jsonb_build_object('clipId',c.id) else n end order by ord) from jsonb_array_elements(graph->'nodes') with ordinality as a(n,ord))),revision=revision+1,updated_at=now() where id=wid returning * into w;
  end if;
  insert into public.game_animation_reviews(candidate_id,draft_id,decision,actor,reason) values(c.id,did,p_command->>'decision',p_actor,'Animation studio review') on conflict do nothing;
 elsif act='review_graph' then
  if p_prepared->'evidence'->>'accepted' is distinct from 'true' then raise exception 'Transition validation required'; end if;
  for item in select * from jsonb_array_elements(w.graph->'nodes') loop
   if item->>'clipId' is null or not exists(select 1 from public.game_animation_reviews where candidate_id=(item->>'clipId')::uuid and decision='accepted') then raise exception 'Review every node before accepting the graph'; end if;
  end loop;
  insert into public.animation_studio_reviews(workspace_id,revision,draft_id,evidence,actor) values(wid,w.revision,did,p_prepared->'evidence',p_actor) on conflict do nothing;
 elsif act='attach' then
  if not app_private.can_edit_draft((p_command->>'targetDraftId')::uuid) then raise exception 'Target game is not editable' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('game:'||(p_command->>'targetDraftId'),0));
  select * into strict target from public.game_workspaces where draft_id=(p_command->>'targetDraftId')::uuid and project_id=pid for update;
  if target.revision<>(p_command->>'targetRevision')::integer then raise exception 'Target game revision conflict' using errcode='40001'; end if;
  if not exists(select 1 from jsonb_array_elements(target.design->'nodes') n where n->>'kind'='actor_definition' and n->>'id'=p_command->>'actorId') then raise exception 'Target actor not found'; end if;
  if p_prepared->'snapshot'->'graph' is distinct from w.graph then raise exception 'Frozen graph mismatch'; end if;
  update public.game_workspaces set revision=revision+1,updated_at=now() where draft_id=target.draft_id returning * into target;
  insert into public.game_revisions(draft_id,revision,design,created_by) values(target.draft_id,target.revision,target.design,p_actor);
  insert into public.animation_studio_bindings values(target.draft_id,target.revision,p_command->>'actorId',wid,w.revision,p_prepared->'snapshot');
 else raise exception 'Unsupported animation command'; end if;
 if act='save' or (act='review_clip' and p_command->>'decision'='accepted') then
  insert into public.animation_studio_revisions(workspace_id,draft_id,revision,graph,created_by) values(wid,did,w.revision,w.graph,p_actor);
 end if;
 result:=jsonb_build_object('revision',w.revision,'jobIds',ids,'targetRevision',target.revision);
 insert into public.animation_studio_commands values(wid,(p_command->>'idempotencyKey')::uuid,p_actor,p_command,result);
 return result;
end $$;
revoke all on function public.animation_studio_command(uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.animation_studio_command(uuid,jsonb,jsonb) to service_role;

create function public.animation_studio_finish_plan(p_job uuid,p_worker text,p_fence bigint,p_graph jsonb) returns boolean
language plpgsql security invoker set search_path=public,pg_temp as $$
declare j public.game_jobs;
begin
 select * into j from public.game_jobs where id=p_job for update;
 if not found or j.status<>'running' or j.lease_owner<>p_worker or j.fence<>p_fence or j.lease_until<=now() then return false; end if;
 if j.animation_workspace_id is null or j.input->'studioPlan' is null then raise exception 'Studio plan job required'; end if;
 update public.game_jobs set status='completed',phase='plan.review',checkpoint=checkpoint||jsonb_build_object('studioGraph',p_graph),lease_until=null,updated_at=now() where id=j.id;
 perform public.game_settle_reservation(j.id,j.reserved_credits);
 return true;
end $$;
revoke all on function public.animation_studio_finish_plan(uuid,text,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.animation_studio_finish_plan(uuid,text,bigint,jsonb) to service_role;

alter function public.game_commit_command(uuid,jsonb,jsonb,integer) rename to game_commit_before_studio;
create function public.game_commit_command(p_actor uuid,p_command jsonb,p_context jsonb default '{}',p_reserve integer default 0) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare result jsonb; j public.game_jobs; bindings jsonb;
begin
 result:=public.game_commit_before_studio(p_actor,p_command,p_context,p_reserve);
 if p_command->>'action'='build' and result->>'jobId' is not null then
  select * into j from public.game_jobs where id=(result->>'jobId')::uuid for update;
  if j.input->'studioBindings' is null then
   select coalesce(jsonb_agg(snapshot),'[]') into bindings from (select distinct on(actor_definition) snapshot from public.animation_studio_bindings where draft_id=j.draft_id and revision<=(j.input->>'sourceRevision')::integer order by actor_definition,revision desc) latest;
   update public.game_jobs set input=input||jsonb_build_object('studioBindings',bindings) where id=j.id;
  end if;
 end if;
 return result;
end $$;
revoke all on function public.game_commit_command(uuid,jsonb,jsonb,integer) from public,anon,authenticated;
grant execute on function public.game_commit_command(uuid,jsonb,jsonb,integer) to service_role;
