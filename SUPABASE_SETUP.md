# Supabase Sync Setup

This app syncs two shared workspaces through Supabase:

- `omaha-workspace-v1`
- `jpbt-workspace-v1`

The browser still writes to `localStorage` first, so the app can keep working if the network or Supabase is unavailable.

## 1. Create The Table

Run this SQL in the Supabase SQL editor:

```sql
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
```

## 2. Configure Local Env

Copy `.env.example` to `.env.local`, then fill in values from Supabase Project Settings > API:

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

Restart `npm run dev` after changing env variables.

## 3. Configure Vercel Env

Add both variables in Vercel Project Settings > Environment Variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Or with Vercel CLI:

```bash
vercel env add VITE_SUPABASE_URL production
vercel env add VITE_SUPABASE_ANON_KEY production
vercel --prod
```

## 4. Before First Real Use

Export JSON from the current app once before enabling cloud sync. When Supabase has no row yet, the first device that opens the app uploads its current local workspace to the cloud.

Because this is a shared workspace without login, the latest save wins. Avoid editing the same page from two devices at the exact same time.
