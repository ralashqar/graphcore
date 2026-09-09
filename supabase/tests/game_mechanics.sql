-- Transactional fixture: rolled back by verify-game-mechanics-db.mjs. No inference.
do $$ declare w public.game_workspaces; actor uuid; cmd jsonb; result jsonb; jid uuid; proposal jsonb; materialize jsonb; changed jsonb; begin
 if has_function_privilege('authenticated','public.game_mechanic_command(uuid,jsonb,jsonb,integer)','execute') or has_table_privilege('authenticated','public.game_mechanic_revisions','insert') or has_table_privilege('anon','public.game_mechanic_revisions','select') then raise exception 'Mechanic privilege leak'; end if;
 select * into strict w from public.game_workspaces where design->>'schemaVersion'='3' limit 1;
 select m.user_id into strict actor from public.projects p join public.workspace_memberships m on m.workspace_id=p.workspace_id and m.role='owner' where p.id=w.project_id limit 1;
 cmd:=jsonb_build_object('action','plan_mechanic','projectId',w.project_id,'draftId',w.draft_id,'expectedRevision',w.revision,'idempotencyKey',gen_random_uuid(),'actorDefinition',(select n->>'id' from jsonb_array_elements(w.design->'nodes') n where n->>'kind'='actor_definition' limit 1),'surfaces','[]'::jsonb,'prompt','Transaction-only mechanic proposal');
 begin perform public.game_mechanic_command(gen_random_uuid(),cmd); raise exception 'Unauthorized planning accepted'; exception when insufficient_privilege then null; end;
 result:=public.game_mechanic_command(actor,cmd,'{}',0);jid:=(result->>'jobId')::uuid;
 if jid is null then raise exception 'No durable mechanic job'; end if;
 if public.game_mechanic_command(actor,cmd,'{}',0)<>result then raise exception 'Duplicate mechanic command changed'; end if;
 begin perform public.game_mechanic_command(actor,cmd||jsonb_build_object('prompt','different')); raise exception 'Idempotency collision accepted'; exception when others then if sqlerrm='Idempotency collision accepted' then raise; end if; end;
 if (select input->'mechanicRequest' from public.game_jobs where id=jid)<>cmd then raise exception 'Mechanic request not frozen'; end if;
 proposal:=jsonb_build_object('version',1,'sourceRevision',w.revision,'explanation','transaction fixture','unsupported','[]'::jsonb,'bundle',jsonb_build_object('version',1,'packages','[]'::jsonb,'surfaces','[]'::jsonb));
 update public.game_jobs set status='completed',checkpoint=jsonb_build_object('plan',proposal) where id=jid;
 materialize:=jsonb_build_object('action','materialize_mechanic','projectId',w.project_id,'draftId',w.draft_id,'expectedRevision',w.revision,'idempotencyKey',gen_random_uuid(),'planJobId',jid);
 result:=public.game_mechanic_command(actor,materialize);
 if public.game_mechanic_command(actor,materialize)<>result then raise exception 'Duplicate review changed'; end if;
 if not exists(select 1 from public.game_mechanic_revisions where draft_id=w.draft_id and revision=w.revision+1) then raise exception 'Immutable bundle not recorded'; end if;
 select design into changed from public.game_workspaces where draft_id=w.draft_id;
 if changed-'mechanics'<>w.design-'mechanics' then raise exception 'Mechanic review modified sibling systems'; end if;
 begin perform public.game_mechanic_command(actor,materialize||jsonb_build_object('idempotencyKey',gen_random_uuid())); raise exception 'Stale review accepted'; exception when serialization_failure then null; end;
 raise notice 'Mechanic ownership, idempotency, frozen proposal, sibling preservation and revision checks passed';
end $$;
