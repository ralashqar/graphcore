create table if not exists public.user_workspace_state (
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  active_project_id uuid references public.projects (id) on delete set null,
  active_draft_id uuid references public.project_drafts (id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  primary key (user_id, workspace_id)
);

create index if not exists user_workspace_state_workspace_idx on public.user_workspace_state (workspace_id);

drop trigger if exists user_workspace_state_set_updated_at on public.user_workspace_state;
create trigger user_workspace_state_set_updated_at before update on public.user_workspace_state for each row execute function public.set_updated_at();

alter table public.user_workspace_state enable row level security;

drop policy if exists "user workspace state read" on public.user_workspace_state;
create policy "user workspace state read" on public.user_workspace_state
for select to authenticated
using (auth.uid() = user_id and app_private.can_read_workspace(workspace_id));

drop policy if exists "user workspace state write" on public.user_workspace_state;
create policy "user workspace state write" on public.user_workspace_state
for all to authenticated
using (auth.uid() = user_id and app_private.can_read_workspace(workspace_id))
with check (auth.uid() = user_id and app_private.can_read_workspace(workspace_id));
