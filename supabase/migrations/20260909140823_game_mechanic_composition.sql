create table public.game_mechanic_revisions (
 draft_id uuid not null references public.game_workspaces(draft_id), revision integer not null,
 bundle jsonb not null, created_at timestamptz not null default now(), primary key(draft_id,revision)
);
alter table public.game_mechanic_revisions enable row level security;
revoke all on public.game_mechanic_revisions from public,anon,authenticated;
grant select on public.game_mechanic_revisions to authenticated;
grant select,insert on public.game_mechanic_revisions to service_role;
create policy mechanic_revision_read on public.game_mechanic_revisions for select to authenticated using(app_private.can_read_draft(draft_id));
create function app_private.capture_game_mechanics() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if new.design->'mechanics' is not null then insert into public.game_mechanic_revisions(draft_id,revision,bundle) values(new.draft_id,new.revision,new.design->'mechanics'); end if;
 return new;
end $$;
create trigger capture_game_mechanics after insert on public.game_revisions for each row execute function app_private.capture_game_mechanics();

-- Proposals use existing durable jobs and frozen outputs, never a second queue.
create function public.game_mechanic_command(p_actor uuid,p_command jsonb,p_context jsonb default '{}',p_reserve integer default 0)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare did uuid:=(p_command->>'draftId')::uuid; old public.game_commands; w public.game_workspaces; j public.game_jobs; internal jsonb; result jsonb;
begin
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_actor,'role','authenticated')::text,true);
 if not app_private.can_edit_draft(did) then raise exception 'Draft is not editable' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('game:'||did,0));
 select * into old from public.game_commands where draft_id=did and idempotency_key=(p_command->>'idempotencyKey')::uuid;
 if found then
  if old.actor<>p_actor or old.command<>p_command then raise exception 'Idempotency mismatch'; end if;
  return old.result;
 end if;
 select * into strict w from public.game_workspaces where draft_id=did for update;
 if w.project_id<>(p_command->>'projectId')::uuid or w.design->>'schemaVersion'<>'3' then raise exception 'Unified project required'; end if;
 if w.revision<>(p_command->>'expectedRevision')::integer then raise exception 'Revision conflict' using errcode='40001'; end if;
 internal:=jsonb_build_object('projectId',w.project_id,'draftId',did,'expectedRevision',w.revision,'idempotencyKey',p_command->>'idempotencyKey','template','unified.v1');
 if p_command->>'action'='plan_mechanic' then
  if not exists(select 1 from jsonb_array_elements(w.design->'nodes') n where n->>'kind'='actor_definition' and n->>'id'=p_command->>'actorDefinition') then raise exception 'Actor definition missing'; end if;
  result:=public.game_commit_command(p_actor,internal||jsonb_build_object('action','plan','prompt',p_command->>'prompt'),p_context,p_reserve);
  update public.game_jobs set input=input||jsonb_build_object('mechanicRequest',p_command) where id=(result->>'jobId')::uuid;
 elsif p_command->>'action'='materialize_mechanic' then
  select * into strict j from public.game_jobs where id=(p_command->>'planJobId')::uuid and draft_id=did;
  if j.status<>'completed' or j.input->'mechanicRequest' is null or (j.input->>'sourceRevision')::integer<>w.revision or jsonb_array_length(j.checkpoint->'plan'->'unsupported') is distinct from 0 or j.checkpoint->'plan'->'bundle' is null then raise exception 'Mechanic proposal missing, stale or unsupported'; end if;
  result:=public.game_commit_command(p_actor,internal||jsonb_build_object('action','save','design',w.design||jsonb_build_object('mechanics',j.checkpoint->'plan'->'bundle')),'{}',0);
 else raise exception 'Unknown mechanic command'; end if;
 update public.game_commands set command=p_command where draft_id=did and idempotency_key=(p_command->>'idempotencyKey')::uuid;
 return result;
end $$;
revoke all on function public.game_mechanic_command(uuid,jsonb,jsonb,integer) from public,anon,authenticated;
grant execute on function public.game_mechanic_command(uuid,jsonb,jsonb,integer) to service_role;
