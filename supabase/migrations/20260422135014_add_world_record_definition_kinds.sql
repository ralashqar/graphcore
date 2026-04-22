do $$
begin
  if not exists (
    select 1
    from pg_enum
    where enumtypid = 'public.definition_kind'::regtype
      and enumlabel = 'group'
  ) then
    alter type public.definition_kind add value 'group';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_enum
    where enumtypid = 'public.definition_kind'::regtype
      and enumlabel = 'concept'
  ) then
    alter type public.definition_kind add value 'concept';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_enum
    where enumtypid = 'public.definition_kind'::regtype
      and enumlabel = 'event'
  ) then
    alter type public.definition_kind add value 'event';
  end if;
end $$;
