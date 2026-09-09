-- Director edits are independent of canonical world state. Client roles can read;
-- all writes pass through the transactional, service-only command RPC.
create table public.director_sessions (
 id uuid primary key, project_id uuid not null references public.projects(id) on delete cascade,
 draft_id uuid not null references public.project_drafts(id) on delete cascade,
 title text not null, source jsonb not null default '{}', settings jsonb not null,
 direction text not null default '', entity_keys jsonb not null default '[]',
 revision integer not null default 0, active_edit_id uuid,
 created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.director_takes (
 id uuid primary key default gen_random_uuid(), session_id uuid not null references public.director_sessions(id) on delete cascade,
 project_id uuid not null references public.projects(id) on delete cascade, draft_id uuid not null references public.project_drafts(id) on delete cascade,
 status text not null default 'queued' check(status in ('queued','preparing','generating','saving','completed','failed','cancelled')),
 review text not null default 'candidate' check(review in ('candidate','kept','rejected')),
 prompt text not null, settings jsonb not null, context jsonb not null,
 parent_take_id uuid references public.director_takes(id), branch_seconds double precision,
 branch_mode text not null default 'frame' check(branch_mode in ('frame','motion')), base_edit_id uuid,
 asset_key text, duration_seconds double precision, run_id uuid references public.output_workflow_runs(id),
 provider_request_id text, submission_started boolean not null default false, estimated_cost_usd numeric not null default 0, error_message text,
 billed_user_id uuid references auth.users(id), credits_reserved integer not null default 0, credits_charged integer, credits_settled boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index director_one_active_take on public.director_takes(session_id) where status in ('queued','preparing','generating','saving');
create index director_takes_history on public.director_takes(session_id,created_at desc,id);
create table public.director_live_sessions (
 take_id uuid primary key references public.director_takes(id) on delete cascade,
 owner_id uuid not null references auth.users(id), provider_session_id text,
 negotiating boolean not null default false, expires_at timestamptz not null default now()+interval '120 seconds',
 stopped_at timestamptz, chunk_count integer, created_at timestamptz not null default now()
);
create table public.director_live_chunks (
 take_id uuid not null references public.director_live_sessions(take_id) on delete cascade,
 chunk_index integer not null check(chunk_index between 0 and 149), storage_path text not null,
 primary key(take_id,chunk_index)
);
alter table public.director_live_sessions enable row level security;
alter table public.director_live_chunks enable row level security;
revoke all on public.director_live_sessions,public.director_live_chunks from public,anon,authenticated;
grant all on public.director_live_sessions,public.director_live_chunks to service_role;
create table public.director_edits (
 id uuid primary key default gen_random_uuid(), session_id uuid not null references public.director_sessions(id) on delete cascade,
 parent_id uuid references public.director_edits(id), clips jsonb not null default '[]', created_at timestamptz not null default now()
);
create index director_edits_history on public.director_edits(session_id,created_at);
create table public.director_messages (
 id uuid primary key default gen_random_uuid(), session_id uuid not null references public.director_sessions(id) on delete cascade,
 role text not null check(role in ('user','assistant','system')), text text not null, created_at timestamptz not null default now()
);
create index director_messages_history on public.director_messages(session_id,created_at);
create table public.director_commands (
 session_id uuid not null references public.director_sessions(id) on delete cascade, idempotency_key uuid not null,
 result jsonb not null, created_at timestamptz not null default now(), primary key(session_id,idempotency_key)
);
create index director_sessions_draft on public.director_sessions(draft_id,updated_at desc);
alter table public.director_sessions enable row level security;
alter table public.director_takes enable row level security;
alter table public.director_edits enable row level security;
alter table public.director_messages enable row level security;
alter table public.director_commands enable row level security;
revoke all on public.director_sessions,public.director_takes,public.director_edits,public.director_messages,public.director_commands from anon,authenticated;
grant select on public.director_sessions,public.director_takes,public.director_edits,public.director_messages to authenticated;
grant all on public.director_sessions,public.director_takes,public.director_edits,public.director_messages,public.director_commands to service_role;
create policy director_session_read on public.director_sessions for select to authenticated using(app_private.can_read_draft(draft_id));
create policy director_take_read on public.director_takes for select to authenticated using(app_private.can_read_draft(draft_id));
create policy director_edit_read on public.director_edits for select to authenticated using(exists(select 1 from public.director_sessions s where s.id=session_id and app_private.can_read_draft(s.draft_id)));
create policy director_message_read on public.director_messages for select to authenticated using(exists(select 1 from public.director_sessions s where s.id=session_id and app_private.can_read_draft(s.draft_id)));

-- Reservations and refunds share the take row lock, so retries cannot charge/refund twice.
create function public.director_settle_credits(p_take uuid,p_charge integer) returns integer
language plpgsql security invoker set search_path=public as $$
declare dt public.director_takes; refund integer; remaining integer;
begin
 select * into strict dt from public.director_takes where id=p_take for update;
 if dt.credits_settled then return dt.credits_charged; end if;
 if p_charge<0 or p_charge>dt.credits_reserved then raise exception 'Invalid Director credit settlement'; end if;
 refund:=dt.credits_reserved-p_charge;
 if refund>0 and dt.billed_user_id is not null then
   update public.user_credits set balance=balance+refund,updated_at=now() where user_id=dt.billed_user_id returning balance into remaining;
   if not found then raise exception 'Credit account missing'; end if;
   insert into public.credit_transactions(user_id,amount,balance_after,reason,reference_type,reference_id,metadata)
   values(dt.billed_user_id,refund,remaining,'Unused Director reservation','director_refund',dt.id::text,jsonb_build_object('reserved',dt.credits_reserved,'charged',p_charge));
 end if;
 update public.director_takes set credits_settled=true,credits_charged=p_charge where id=p_take;
 return p_charge;
end $$;
revoke all on function public.director_settle_credits(uuid,integer) from public,anon,authenticated;
grant execute on function public.director_settle_credits(uuid,integer) to service_role;

create function public.director_enqueue_run(p_session uuid,p_actor uuid,p_operation text,p_input jsonb) returns uuid
language plpgsql security invoker set search_path = public as $$
declare s public.director_sessions; w uuid:=gen_random_uuid(); n uuid:=gen_random_uuid(); r uuid:=gen_random_uuid();
begin
 select * into strict s from public.director_sessions where id=p_session;
 insert into public.output_workflows(id,project_id,draft_id,key,name,preset,created_by,metadata)
 values(w,s.project_id,s.draft_id,'director.'||r,'Director '||p_operation,'cinematic_trailer',p_actor,jsonb_build_object('directorSessionId',s.id));
 insert into public.output_workflow_nodes(id,workflow_id,draft_id,key,node_type,label,config)
 values(n,w,s.draft_id,'director','utility_transform','Director '||p_operation,jsonb_build_object('purpose','director_workspace','operation',p_operation,'execution',jsonb_build_object('resourceClass','video','maxConcurrency',1)));
 insert into public.output_workflow_runs(id,project_id,draft_id,workflow_id,requested_by,preset,target_format,input,metadata)
 values(r,s.project_id,s.draft_id,w,p_actor,'cinematic_trailer','video',p_input,jsonb_build_object('directorSessionId',s.id,'executionTarget','fly','debugSkipVideoGeneration',false));
 insert into public.output_workflow_run_steps(run_id,workflow_id,node_id,draft_id,node_key,node_type,label)
 values(r,w,n,s.draft_id,'director','utility_transform','Director '||p_operation);
 return r;
end $$;
revoke all on function public.director_enqueue_run(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.director_enqueue_run(uuid,uuid,text,jsonb) to service_role;

create function public.director_commit_command(p_actor uuid,p_command jsonb) returns jsonb
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
   update public.director_takes set billed_user_id=p_actor,credits_reserved=reserve where id=takeid;
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
