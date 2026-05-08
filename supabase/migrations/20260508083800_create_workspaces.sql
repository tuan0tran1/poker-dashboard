create table if not exists public.workspaces (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.workspaces enable row level security;

drop policy if exists "Read poker workspaces" on public.workspaces;
drop policy if exists "Insert poker workspaces" on public.workspaces;
drop policy if exists "Update poker workspaces" on public.workspaces;

create policy "Read poker workspaces"
on public.workspaces
for select
to anon
using (id in ('omaha-workspace-v1', 'jpbt-workspace-v1'));

create policy "Insert poker workspaces"
on public.workspaces
for insert
to anon
with check (id in ('omaha-workspace-v1', 'jpbt-workspace-v1'));

create policy "Update poker workspaces"
on public.workspaces
for update
to anon
using (id in ('omaha-workspace-v1', 'jpbt-workspace-v1'))
with check (id in ('omaha-workspace-v1', 'jpbt-workspace-v1'));
