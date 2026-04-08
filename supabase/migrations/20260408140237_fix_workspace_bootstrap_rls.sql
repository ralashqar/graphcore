drop policy if exists "membership insert" on public.workspace_memberships;
create policy "membership insert" on public.workspace_memberships
for insert to authenticated
with check (
  app_private.is_workspace_owner(workspace_id)
  or (
    auth.uid() = user_id
    and exists (
      select 1
      from public.workspaces w
      where w.id = workspace_id
        and w.created_by = auth.uid()
    )
  )
);
