do $$
declare d uuid:=current_setting('graphcore.game.test_draft')::uuid; actor uuid:=current_setting('graphcore.game.test_actor')::uuid;
 w public.game_workspaces; j uuid:=gen_random_uuid(); cmd jsonb; a jsonb; b jsonb;
begin
 select * into strict w from public.game_workspaces where draft_id=d;
 insert into public.game_jobs(id,draft_id,kind,status,input,checkpoint,requested_by,provider_started)
 values(j,d,'asset','attention','{}','{"pendingProvider":true}',actor,true);
 cmd:=jsonb_build_object('action','retry','projectId',w.project_id,'draftId',d,'jobId',j,'expectedRevision',w.revision,'idempotencyKey',gen_random_uuid());
 begin
  perform public.game_retry_asset_command(actor,cmd);
  raise exception 'Ambiguous submission resumed';
 exception when raise_exception then if sqlerrm='Ambiguous submission resumed' then raise; end if; end;
 update public.game_jobs set checkpoint='{"pendingProvider":false,"requestId":"existing-request","referencePath":"immutable-reference"}' where id=j;
 a:=public.game_retry_asset_command(actor,cmd); b:=public.game_retry_asset_command(actor,cmd);
 if a<>b or a->>'jobId'<>j::text then raise exception 'Recovery must preserve the same job and command receipt'; end if;
 if (select checkpoint->>'requestId' from public.game_jobs where id=j)<>'existing-request' then raise exception 'Recovery discarded provider request ID'; end if;
 if (select checkpoint->>'manualRetries' from public.game_jobs where id=j)<>'1' then raise exception 'Recovery command was duplicated'; end if;
 if has_function_privilege('authenticated','public.game_retry_asset_command(uuid,jsonb)','execute') then raise exception 'Recovery RPC is publicly writable'; end if;
 raise notice 'Game recovery assertions passed';
end $$;
