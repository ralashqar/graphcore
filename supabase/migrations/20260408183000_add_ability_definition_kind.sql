do $$
begin
  if not exists (
    select 1
    from pg_enum
    where enumtypid = 'public.definition_kind'::regtype
      and enumlabel = 'ability'
  ) then
    alter type public.definition_kind add value 'ability';
  end if;
end
$$;
