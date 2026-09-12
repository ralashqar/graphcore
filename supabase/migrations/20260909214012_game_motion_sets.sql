create table public.game_motion_sets (
 draft_id uuid not null references public.game_workspaces(draft_id) on delete cascade,
 set_id text not null, revision text not null check(revision ~ '^[a-f0-9]{64}$'),
 definition jsonb not null, workspace_revision integer not null, created_at timestamptz not null default now(),
 primary key(draft_id,set_id,revision)
);
create table public.game_motion_set_runs (
 id uuid primary key, draft_id uuid not null, set_id text not null, set_revision text not null,
 entries jsonb not null, reserved_cents integer not null check(reserved_cents>=0), created_at timestamptz not null default now(),
 foreign key(draft_id,set_id,set_revision) references public.game_motion_sets(draft_id,set_id,revision)
);
create table public.game_motion_set_jobs (
 run_id uuid not null references public.game_motion_set_runs(id), job_id uuid not null references public.game_jobs(id),
 draft_id uuid not null references public.game_workspaces(draft_id), state text not null, primary key(run_id,state), unique(job_id)
);
do $$ declare t text; begin
 foreach t in array array['game_motion_sets','game_motion_set_runs','game_motion_set_jobs'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('grant select,insert on public.%I to service_role',t);
  execute format('create policy motion_set_read on public.%I for select to authenticated using(app_private.can_read_draft(draft_id))',t);
 end loop;
end $$;
create index game_motion_set_runs_draft on public.game_motion_set_runs(draft_id,created_at desc);
create index game_motion_set_jobs_draft on public.game_motion_set_jobs(draft_id);

create function public.game_motion_set_command(p_actor uuid,p_command jsonb,p_payload jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare did uuid:=(p_command->>'draftId')::uuid; idem uuid:=(p_command->>'idempotencyKey')::uuid;
 w public.game_workspaces; old public.game_commands; v_definition jsonb; entry jsonb; binding jsonb; rig jsonb:=p_payload->'rig';
 jid uuid; run uuid; jobs jsonb:='[]'; total integer:=0; phase text; result jsonb; graph jsonb:=p_payload->'graph';
begin
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_actor,'role','authenticated')::text,true);
 if not app_private.can_edit_draft(did) or not exists(select 1 from public.project_drafts where id=did and project_id=(p_command->>'projectId')::uuid) then raise exception 'Workspace is not editable' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('game:'||did,0));
 select * into old from public.game_commands where draft_id=did and idempotency_key=idem;
 if found then
  if old.actor<>p_actor or old.command<>p_command then raise exception 'Idempotency mismatch'; end if;
  return old.result;
 end if;
 select * into strict w from public.game_workspaces where draft_id=did for update;
 if w.design->>'schemaVersion'<>'3' or w.revision is distinct from (p_command->>'expectedRevision')::integer then raise exception 'Workspace revision conflict' using errcode='40001'; end if;
 if p_command->>'action'='save_motion_set' then
  v_definition:=p_payload->'definition';
  if v_definition is distinct from p_command->'definition' or v_definition->>'rigRevision' is distinct from rig->>'revision' then raise exception 'Frozen definition/rig mismatch'; end if;
  if not exists(select 1 from jsonb_array_elements(w.design->'nodes') n where n->>'kind'='actor_definition' and n->>'id'=v_definition->>'actorDefinition') then raise exception 'Actor not found'; end if;
  update public.game_workspaces set revision=revision+1,design=jsonb_set(design,'{nodes}',(select jsonb_agg(case when n->>'kind'='actor_definition' and n->>'id'=v_definition->>'actorDefinition' then n||jsonb_build_object('motionProfile',v_definition->'profile') else n end order by ord) from jsonb_array_elements(design->'nodes') with ordinality a(n,ord))),updated_at=now() where draft_id=did returning * into w;
  insert into public.game_revisions(draft_id,revision,design,created_by) values(did,w.revision,w.design,p_actor);
  insert into public.game_animation_rigs(draft_id,revision,profile) values(did,rig->>'revision',rig) on conflict do nothing;
  if not exists(select 1 from public.game_animation_rigs where draft_id=did and revision=rig->>'revision' and profile=rig) then raise exception 'Rig collision'; end if;
  insert into public.game_motion_sets(draft_id,set_id,revision,definition,workspace_revision) values(did,v_definition->>'id',p_payload->>'revision',v_definition,w.revision) on conflict do nothing;
  if not exists(select 1 from public.game_motion_sets s where s.draft_id=did and s.set_id=v_definition->>'id' and revision=p_payload->>'revision' and s.definition=v_definition) then raise exception 'Set revision collision'; end if;
 elsif p_command->>'action'='save_traversal_component' then
  if (p_payload->'design'-'mechanics') is distinct from (w.design-'mechanics') or not exists(select 1 from jsonb_array_elements(p_payload->'design'->'mechanics'->'traversal') t where t=p_command->'component') then raise exception 'Traversal snapshot mismatch'; end if;
  update public.game_workspaces set revision=revision+1,design=p_payload->'design',updated_at=now() where draft_id=did returning * into w;
  insert into public.game_revisions(draft_id,revision,design,created_by) values(did,w.revision,w.design,p_actor);
 elsif p_command->>'action'='cancel_animation_set' then
  if not exists(select 1 from public.game_motion_set_runs where id=(p_command->>'runId')::uuid and draft_id=did) then raise exception 'Set run not found'; end if;
  update public.game_jobs set status='cancelled',fence=fence+1,lease_until=null,updated_at=now() where draft_id=did and status in ('queued','running','attention') and id in(select job_id from public.game_motion_set_jobs where run_id=(p_command->>'runId')::uuid and draft_id=did);
 else
  select s.definition into strict v_definition from public.game_motion_sets s where s.draft_id=did and s.set_id=p_command->>'setId' and s.revision=p_command->>'setRevision';
  if v_definition is distinct from p_payload->'definition' or p_payload->>'revision' is distinct from p_command->>'setRevision' then raise exception 'Set snapshot changed'; end if;
  if p_command->>'action'='generate_animation_set' then
   if jsonb_typeof(p_payload->'entries') is distinct from 'array' or jsonb_array_length(p_payload->'entries') not between 1 and 6 then raise exception 'Invalid set entries'; end if;
   if (select count(distinct e->>'state') from jsonb_array_elements(p_payload->'entries') e)<>jsonb_array_length(p_payload->'entries') or (select jsonb_agg(e->'state' order by e->>'state') from jsonb_array_elements(p_payload->'entries') e) is distinct from (select jsonb_agg(s order by s#>>'{}') from jsonb_array_elements(p_command->'states') s) then raise exception 'Selected roles mismatch'; end if;
   for entry in select * from jsonb_array_elements(p_payload->'entries') loop
    if not (v_definition->'states' ? (entry->>'state')) then raise exception 'Unknown set role'; end if;
    if entry ? 'clipRevision' then
     if not exists(select 1 from public.game_animation_candidates c join public.game_animation_reviews r on r.candidate_id=c.id and r.draft_id=c.draft_id where c.draft_id=did and c.id=(entry->>'clipRevision')::uuid and r.decision='accepted' and c.clip->>'rigRevision'=v_definition->>'rigRevision' and c.clip->>'state'=entry->>'state' and c.clip->'validation'->>'accepted'='true' and coalesce(c.clip->>'style','neutral')=v_definition->'profile'->>'style' and c.clip->>'motionContract' is null) then raise exception 'Incompatible set reuse'; end if;
    else
     if entry->'recipe'->>'rigRevision' is distinct from rig->>'revision' or rig->>'revision' is distinct from v_definition->>'rigRevision' or entry->'recipe'->>'state' is distinct from entry->>'state' or entry->'provider'->>'processingVersion' is distinct from 'animation-1.1.0' or entry->'provider'->>'reservationCents' is null or (entry->'provider'->>'reservationCents')::integer not between 100 and 500 then raise exception 'Invalid frozen child'; end if;
     total:=total+(entry->'provider'->>'reservationCents')::integer;
    end if;
   end loop;
   if total is null or p_command->>'maxReservationCents' is null or total>(p_command->>'maxReservationCents')::integer then raise exception 'Set quote exceeded'; end if;
   if (select count(*) from public.game_jobs where draft_id=did and status in ('queued','running','attention'))+jsonb_array_length(p_payload->'entries')>12 then raise exception 'Finish active set work first'; end if;
   run:=gen_random_uuid();
   insert into public.game_motion_set_runs(id,draft_id,set_id,set_revision,entries,reserved_cents) values(run,did,p_command->>'setId',p_command->>'setRevision',p_payload->'entries',total);
   for entry in select * from jsonb_array_elements(p_payload->'entries') loop
    if entry ? 'clipRevision' then continue; end if;
    jid:=gen_random_uuid();phase:=case when entry->'recipe'->>'provider'='motionbricks' then 'motionbricks' when v_definition->>'group'='traversal' then 'ledge' else 'integration' end;
    perform public.game_animation_reserve_setup(jid,'kimodo-initial-2026-09',phase,(entry->'provider'->>'reservationCents')::integer,'Game animation '||jid);
    insert into public.game_jobs(id,draft_id,kind,input,requested_by) values(jid,did,'asset',jsonb_build_object('projectId',w.project_id,'sourceRevision',w.revision,'template','unified.v1','animation',jsonb_build_object('recipe',entry->'recipe','rig',rig,'provider',entry->'provider','motionSetRun',run)),p_actor);
    insert into public.game_animation_recipes(job_id,draft_id,recipe,rig_revision,model_revision,processing_version) values(jid,did,entry->'recipe',rig->>'revision',entry->'provider'->>'modelRevision',entry->'provider'->>'processingVersion');
    insert into public.game_motion_set_jobs(run_id,job_id,draft_id,state) values(run,jid,did,entry->>'state');jobs:=jobs||jsonb_build_array(jid);
   end loop;
  elsif p_command->>'action'='bind_animation_set' then
   if graph->>'rigRevision' is distinct from v_definition->>'rigRevision' or graph->>'actorDefinition' is distinct from v_definition->>'actorDefinition' or not exists(select 1 from jsonb_array_elements(graph->'motionSets') m where m->>'setId'=p_command->>'setId' and m->>'revision'=p_command->>'setRevision') then raise exception 'Invalid set binding'; end if;
   update public.game_workspaces set revision=revision+1,updated_at=now() where draft_id=did returning * into w;
   insert into public.game_revisions(draft_id,revision,design,created_by) values(did,w.revision,w.design,p_actor);
   insert into public.game_animation_graphs(draft_id,revision,actor_definition,graph) values(did,w.revision,v_definition->>'actorDefinition',graph);
  else raise exception 'Unsupported motion set command'; end if;
 end if;
 result:=jsonb_build_object('revision',w.revision,'runId',run,'jobIds',jobs,'reservedCents',total,'reservedCredits',0);
 insert into public.game_commands(draft_id,idempotency_key,actor,command,result) values(did,idem,p_actor,p_command,result);
 return result;
end $$;
revoke all on function public.game_motion_set_command(uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.game_motion_set_command(uuid,jsonb,jsonb) to service_role;

create function app_private.require_motion_set_graph() returns trigger language plpgsql set search_path=public,pg_temp as $$
declare component jsonb; v_definition jsonb; state text;
begin
 if new.graph ? 'motionSets' then
  if jsonb_typeof(new.graph->'motionSets') is distinct from 'array' or jsonb_array_length(new.graph->'motionSets') not between 1 and 2 then raise exception 'Invalid motion components'; end if;
  if (select count(distinct c->>'setId') from jsonb_array_elements(new.graph->'motionSets') c)<>jsonb_array_length(new.graph->'motionSets') then raise exception 'Duplicate motion component'; end if;
  for component in select * from jsonb_array_elements(new.graph->'motionSets') loop
   select s.definition into strict v_definition from public.game_motion_sets s where s.draft_id=new.draft_id and s.set_id=component->>'setId' and s.revision=component->>'revision';
   if v_definition->>'actorDefinition' is distinct from new.actor_definition or v_definition->>'rigRevision' is distinct from new.graph->>'rigRevision' or v_definition->'profile' is distinct from component->'profile' or v_definition->'states' is distinct from component->'requiredStates' then raise exception 'Motion component snapshot mismatch'; end if;
   for state in select jsonb_array_elements_text(v_definition->'states') loop
    if not exists(select 1 from jsonb_array_elements(new.graph->'bindings') b join public.game_animation_candidates c on c.id=(b->>'clipRevision')::uuid where c.draft_id=new.draft_id and b->>'state'=state and coalesce(c.clip->>'style','neutral')=v_definition->'profile'->>'style' and c.clip->>'motionContract' is null) then raise exception 'Motion component incomplete or wrong style'; end if;
   end loop;
  end loop;
  if (select count(distinct c->'profile') from jsonb_array_elements(new.graph->'motionSets') c)>1 then raise exception 'Motion components need the same profile'; end if;
 end if;
 return new;
end $$;
create trigger require_motion_set_graph before insert on public.game_animation_graphs for each row execute function app_private.require_motion_set_graph();
