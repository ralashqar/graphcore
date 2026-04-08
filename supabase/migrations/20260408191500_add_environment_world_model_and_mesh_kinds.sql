do $$
begin
  if not exists (
    select 1
    from pg_enum
    where enumtypid = 'public.definition_kind'::regtype
      and enumlabel = 'environment'
  ) then
    alter type public.definition_kind add value 'environment';
  end if;

  if not exists (
    select 1
    from pg_enum
    where enumtypid = 'public.definition_kind'::regtype
      and enumlabel = 'world_model'
  ) then
    alter type public.definition_kind add value 'world_model';
  end if;

  if not exists (
    select 1
    from pg_enum
    where enumtypid = 'public.asset_kind'::regtype
      and enumlabel = 'mesh'
  ) then
    alter type public.asset_kind add value 'mesh';
  end if;
end
$$;
