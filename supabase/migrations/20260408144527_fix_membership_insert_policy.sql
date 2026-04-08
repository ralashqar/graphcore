create or replace function app_private.is_workspace_creator(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspaces w
    where w.id = target_workspace_id
      and w.created_by = auth.uid()
  );
$$;

drop policy if exists "membership insert" on public.workspace_memberships;
create policy "membership insert" on public.workspace_memberships
for insert to authenticated
with check (
  app_private.is_workspace_owner(workspace_id)
  or (
    auth.uid() = user_id
    and app_private.is_workspace_creator(workspace_id)
  )
);
