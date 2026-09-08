-- Transaction-only fixtures; no requests reach providers or workers.
do $$
declare p uuid; d uuid; actor uuid; cmd jsonb; a jsonb; b jsonb; j jsonb; jid uuid; build_id uuid;
begin
 select pr.id,pd.id,m.user_id into p,d,actor from public.projects pr join public.project_drafts pd on pd.project_id=pr.id join public.workspace_memberships m on m.workspace_id=pr.workspace_id and m.role in ('owner','editor') limit 1;
 if actor is null then raise exception 'Game SQL tests require an editable draft fixture'; end if;
 perform set_config('graphcore.game.test_draft',d::text,true);
 perform set_config('graphcore.game.test_actor',actor::text,true);
 -- This test is always rolled back, including existing game records and credit balances.
 delete from public.game_workspaces where draft_id=d;
 insert into public.user_credits(user_id,balance) values(actor,10000) on conflict(user_id) do update set balance=10000;
 cmd:=jsonb_build_object('action','save','projectId',p,'draftId',d,'idempotencyKey',gen_random_uuid(),'expectedRevision',0,'design',jsonb_build_object('assets','[]'::jsonb));
 a:=public.game_commit_command(actor,cmd); b:=public.game_commit_command(actor,cmd);
 if a<>b or (a->>'revision')::integer<>1 or (select count(*) from public.game_revisions where draft_id=d)<>1 then raise exception 'Save idempotency failed'; end if;
 begin
  perform public.game_commit_command(actor,cmd||jsonb_build_object('idempotencyKey',gen_random_uuid()));
  raise exception 'Stale revision accepted';
 exception when serialization_failure then null; end;
 begin
  perform public.game_commit_command(gen_random_uuid(),cmd||jsonb_build_object('idempotencyKey',gen_random_uuid()));
  raise exception 'Unauthorized actor accepted';
 exception when insufficient_privilege then null; end;
 if has_table_privilege('anon','public.game_workspaces','select') or has_table_privilege('authenticated','public.game_jobs','update') or has_function_privilege('authenticated','public.game_commit_command(uuid,jsonb,jsonb,integer)','execute') then raise exception 'Game grants are too broad'; end if;
 if exists(select 1 from pg_class where oid in ('public.game_workspaces'::regclass,'public.game_revisions'::regclass,'public.game_jobs'::regclass,'public.game_builds'::regclass,'public.game_asset_revisions'::regclass) and not relrowsecurity) then raise exception 'Game RLS is missing'; end if;
 cmd:=cmd||jsonb_build_object('action','build','expectedRevision',1,'idempotencyKey',gen_random_uuid());
 a:=public.game_commit_command(actor,cmd,'{}',25); b:=public.game_commit_command(actor,cmd,'{}',25); jid:=(a->>'jobId')::uuid;
 if a<>b or (select balance from public.user_credits where user_id=actor)<>9975 then raise exception 'Reservation was duplicated'; end if;
 -- Claim only this fixture, so concurrent real jobs cannot be affected.
 update public.game_jobs set status='running',lease_owner='game-sql-test',lease_until=now()+interval '90 seconds',fence=1 where id=jid;
 if public.game_checkpoint(jid,'wrong-owner',1,'compile','{}','[]') then raise exception 'Wrong worker checkpoint accepted'; end if;
 if not public.game_checkpoint(jid,'game-sql-test',1,'compile','{}','[]') then raise exception 'Owned checkpoint failed'; end if;
 perform public.game_commit_command(actor,cmd||jsonb_build_object('action','cancel','jobId',jid,'idempotencyKey',gen_random_uuid()));
 if public.game_finish_job(jid,'game-sql-test',1,'{}') then raise exception 'Cancelled job committed'; end if;
 perform public.game_settle_reservation(jid,0);
 if (select balance from public.user_credits where user_id=actor)<>10000 then raise exception 'Cancellation refund not idempotent'; end if;
 a:=public.game_commit_command(actor,cmd||jsonb_build_object('idempotencyKey',gen_random_uuid())); jid:=(a->>'jobId')::uuid;
 update public.game_jobs set status='running',lease_owner='game-sql-test',lease_until=now()+interval '90 seconds',fence=1 where id=jid;
 if not public.game_finish_job(jid,'game-sql-test',1,jsonb_build_object('accepted',true,'manifest','{}'::jsonb,'reports','[]'::jsonb)) then raise exception 'Build registration failed'; end if;
 build_id:=jid;
 if (select active_build_id from public.game_workspaces where draft_id=d)<>build_id then raise exception 'Accepted build not active'; end if;
 a:=public.game_commit_command(actor,cmd||jsonb_build_object('idempotencyKey',gen_random_uuid())); jid:=(a->>'jobId')::uuid;
 update public.game_jobs set status='running',lease_owner='game-sql-test',lease_until=now()+interval '90 seconds',fence=1 where id=jid;
 perform public.game_finish_job(jid,'game-sql-test',1,jsonb_build_object('accepted',false,'manifest','{}'::jsonb,'reports','[]'::jsonb));
 if (select active_build_id from public.game_workspaces where draft_id=d)<>build_id then raise exception 'Rejected build replaced last good build'; end if;
 begin
  perform public.game_commit_command(actor,cmd||jsonb_build_object('action','publish','buildId',jid,'idempotencyKey',gen_random_uuid()));
  raise exception 'Rejected build published';
 exception when raise_exception then if sqlerrm='Rejected build published' then raise; end if; end;
 raise notice 'Game transaction assertions passed: permissions, idempotency, revisions, credits, fencing, active build and publish';
end $$;
