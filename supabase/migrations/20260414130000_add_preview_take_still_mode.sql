do $$
begin
  if exists (select 1 from pg_type where typname = 'cinematic_run_mode') then
    if not exists (
      select 1
      from pg_enum
      where enumtypid = 'public.cinematic_run_mode'::regtype
        and enumlabel = 'preview_take_still'
    ) then
      alter type public.cinematic_run_mode add value 'preview_take_still';
    end if;
    if not exists (
      select 1
      from pg_enum
      where enumtypid = 'public.cinematic_run_mode'::regtype
        and enumlabel = 'preview_storyboard_still'
    ) then
      alter type public.cinematic_run_mode add value 'preview_storyboard_still';
    end if;
  end if;
end $$;
