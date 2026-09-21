-- Reuse the visual queue. City jobs have business ownership, not a fabricated world draft.
alter type public.visual_generation_kind add value if not exists 'city_building_sprite';
alter table public.visual_generation_jobs alter column project_id drop not null;
alter table public.visual_generation_jobs alter column draft_id drop not null;
alter table public.visual_generation_jobs add column city_business_id uuid references public.city_businesses(id);
alter table public.visual_generation_jobs add constraint visual_job_context check (
 (kind::text='city_building_sprite' and city_business_id is not null and project_id is null and draft_id is null)
 or (kind::text<>'city_building_sprite' and city_business_id is null and project_id is not null and draft_id is not null));
create policy city_art_service_only on public.visual_generation_jobs as restrictive for all to authenticated
 using (kind::text<>'city_building_sprite') with check (kind::text<>'city_building_sprite');
create index city_art_history on public.visual_generation_jobs(city_business_id,created_at desc) where city_business_id is not null;

create function public.city_art_start(p_user uuid,p_business uuid,p_id uuid,p_version integer,p_input jsonb,p_model text,p_credits integer)
returns uuid language plpgsql security invoker set search_path=public as $$
declare b city_businesses; j visual_generation_jobs; charged record;
begin
 select * into strict b from city_businesses where id=p_business and owner_id=p_user for update;
 select * into j from visual_generation_jobs where id=p_id;
 if found then
   if j.city_business_id is distinct from p_business or j.requested_by is distinct from p_user or j.input is distinct from p_input or j.model is distinct from p_model then raise exception 'Generation request changed; use a new request ID'; end if;
   return j.id;
 end if;
 if b.status='suspended' or b.draft_version<>p_version then raise exception 'Save and reload the current business before generating'; end if;
 if p_input->'business' is distinct from b.draft or (p_input->>'version')::integer is distinct from p_version then raise exception 'Business snapshot changed'; end if;
 if p_credits<1 or p_credits>1000 or p_model not in ('fal-ai/nano-banana-2/edit','openai/gpt-image-2/edit') then raise exception 'Invalid generation settings'; end if;
 if exists(select 1 from visual_generation_jobs where city_business_id=b.id and status in ('queued','running')) then raise exception 'A building is already generating'; end if;
 if (select count(*) from visual_generation_jobs where city_business_id=b.id and created_at>now()-interval '1 day')>=12 then raise exception 'Daily building generation limit reached'; end if;
 insert into visual_generation_jobs(id,city_business_id,requested_by,kind,provider,model,input,target_keys,metadata)
 values(p_id,b.id,p_user,'city_building_sprite','fal',p_model,p_input,jsonb_build_object('businessId',b.id),jsonb_build_object('credits',p_credits));
 perform 1 from user_credits where user_id=p_user for update;
 select * into charged from deduct_credits(p_user,p_credits,'City building generation','city_art',p_id::text,jsonb_build_object('businessId',b.id,'model',p_model));
 if not charged.success then raise exception 'Insufficient SynArc generation credits'; end if;
 return p_id;
end $$;

create function public.city_art_apply(p_user uuid,p_business uuid,p_job uuid,p_version integer) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare b city_businesses; j visual_generation_jobs; path text;
begin
 perform pg_advisory_xact_lock(73190421);
 select * into strict b from city_businesses where id=p_business and owner_id=p_user for update;
 select * into strict j from visual_generation_jobs where id=p_job and city_business_id=b.id and requested_by=p_user;
 path:=p_user::text||'/'||j.id::text||'.png';
 if b.draft->>'buildingArt'=path then return to_jsonb(b); end if;
 if b.status='suspended' or b.draft_version<>p_version or (j.input->>'version')::integer is distinct from p_version then raise exception 'Business changed. Generate art from the current saved draft'; end if;
 if j.status<>'completed' or j.outputs->>'storagePath' is distinct from path or j.outputs->>'policy' is distinct from 'city-building-sprite-1.0.0' or j.outputs->>'validated' is distinct from 'true' then raise exception 'No validated building candidate'; end if;
 return city_mutate(p_user,'save',jsonb_build_object('businessId',b.id,'version',p_version,'host',b.verified_host,'profile',b.draft||jsonb_build_object('buildingArt',path)));
end $$;
revoke all on function public.city_art_start(uuid,uuid,uuid,integer,jsonb,text,integer),public.city_art_apply(uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.city_art_start(uuid,uuid,uuid,integer,jsonb,text,integer),public.city_art_apply(uuid,uuid,uuid,integer) to service_role;

create function public.city_art_refund_unsubmitted(p_job uuid) returns void
language plpgsql security invoker set search_path=public as $$
declare j visual_generation_jobs; amount integer; remaining integer;
begin
 select * into strict j from visual_generation_jobs where id=p_job and kind::text='city_building_sprite' for update;
 if j.status<>'failed' or coalesce((j.metadata->>'citySubmissionIntent')::boolean,false) or coalesce((j.metadata->>'creditsRefunded')::boolean,false) then return; end if;
 amount:=(j.metadata->>'credits')::integer;
 update user_credits set balance=balance+amount,updated_at=now() where user_id=j.requested_by returning balance into remaining;
 if not found then raise exception 'Credit account missing'; end if;
 insert into credit_transactions(user_id,amount,balance_after,reason,reference_type,reference_id,metadata)
 values(j.requested_by,amount,remaining,'City art failed before provider submission','city_art_refund',j.id::text,'{}');
 update visual_generation_jobs set metadata=metadata||'{"creditsRefunded":true}' where id=j.id;
end $$;
create function public.city_art_retry(p_user uuid,p_business uuid,p_job uuid) returns void
language plpgsql security invoker set search_path=public as $$
declare j visual_generation_jobs;
begin
 perform 1 from city_businesses where id=p_business and owner_id=p_user and status<>'suspended' for update;
 if not found then raise exception 'Business not available'; end if;
 select * into strict j from visual_generation_jobs where id=p_job and city_business_id=p_business and requested_by=p_user for update;
 if j.status in ('queued','running','completed') then return; end if;
 if j.status<>'failed' or (coalesce(j.metadata->>'falRequestId','')='' and coalesce(j.metadata->>'cityRawPath','')='') then raise exception 'Provider submission needs reconciliation; retry cannot submit another image'; end if;
 if exists(select 1 from visual_generation_jobs where city_business_id=p_business and status in ('queued','running')) then raise exception 'Another building is generating'; end if;
 update visual_generation_jobs set status='queued' where id=j.id;
end $$;
revoke all on function public.city_art_refund_unsubmitted(uuid),public.city_art_retry(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.city_art_refund_unsubmitted(uuid),public.city_art_retry(uuid,uuid,uuid) to service_role;
