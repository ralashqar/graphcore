-- Extend the existing service-only transaction boundary without changing job ownership.
create or replace function app_private.game_capture_nodes() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if new.design->>'schemaVersion' in ('2','3') then
  insert into public.game_spec_nodes(draft_id,revision,node_id,kind,spec)
  select new.draft_id,new.revision,n->>'id',n->>'kind',n from jsonb_array_elements(new.design->'nodes') n;
 end if;
 return new;
end $$;

do $$ declare body text; begin
 body:=pg_get_functiondef('public.game_commit_command(uuid,jsonb,jsonb,integer)'::regprocedure);
 if position('''generate'',''build'',''asset'',''test''' in body)=0 then raise exception 'Unexpected game command implementation'; end if;
 body:=replace(body,'w.design->>''schemaVersion''<>''2''','w.design->>''schemaVersion'' not in (''2'',''3'')');
 body:=replace(body,'if act=''save'' then',
 'if w.design->>''schemaVersion''=''3'' and p_command->>''template'' is distinct from ''unified.v1'' then raise exception ''Unified commands require the unified template''; end if;
  if act=''save'' then
  if w.design->>''schemaVersion'' in (''1'',''2'',''3'') and p_command->''design'' is not null and p_command->''design''->>''schemaVersion'' is distinct from w.design->>''schemaVersion'' then raise exception ''Use a new draft to change gameplay foundation''; end if;');
 body:=replace(body,'elsif act in (''generate'',''build'',''asset'',''test'')','elsif act in (''generate'',''build'',''asset'',''test'',''plan'',''materialize'')');
 body:=replace(body,'if act<>''generate'' and w.design is null','if act not in (''generate'',''plan'',''materialize'') and w.design is null');
 body:=replace(body,'case when act=''test'' then ''build'' else act end','case when act=''test'' then ''build'' when act in (''plan'',''materialize'') then ''generate'' else act end');
 body:=replace(body,'''context'',p_context,','''context'',p_context,''commandAction'',act,''planJobId'',p_command->''planJobId'',''plan'',case when act=''materialize'' then (select checkpoint->''plan'' from public.game_jobs where id=(p_command->>''planJobId'')::uuid and draft_id=did) else null end,');
 body:=replace(body,'jid:=gen_random_uuid();',
 'if p_command->>''template''=''unified.v1'' and w.design is not null and w.design->>''schemaVersion''<>''3'' then raise exception ''Use a new draft for unified gameplay''; end if;
  if act=''materialize'' then
   if not exists(select 1 from public.game_jobs where id=(p_command->>''planJobId'')::uuid and draft_id=did and status=''completed'' and input->>''commandAction''=''plan'' and (input->>''sourceRevision'')::integer=w.revision and checkpoint->''plan''->>''intent''<>''explain'' and jsonb_array_length(checkpoint->''plan''->''unsupported'')=0) then raise exception ''Plan missing, stale, unsupported or explanation-only''; end if;
  end if;
  jid:=gen_random_uuid();');
 execute body;
 body:=pg_get_functiondef('public.game_finish_job(uuid,text,bigint,jsonb)'::regprocedure);
 body:=replace(body,'if j.kind=''generate'' then',
 'if j.kind=''generate'' and j.input->>''commandAction''=''plan'' then
  if p_result->''plan'' is null then raise exception ''Plan missing''; end if;
 elsif j.kind=''generate'' then');
 execute body;
 body:=pg_get_functiondef('public.game_retry_module_command(uuid,jsonb)'::regprocedure);
 body:=replace(body,'j.input->''design''->>''schemaVersion''<>''2''','j.input->''design''->>''schemaVersion'' not in (''2'',''3'')');
 execute body;
end $$;
