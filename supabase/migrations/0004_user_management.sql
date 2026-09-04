-- User management: profiles carries role/status on top of Supabase Auth.
-- All writes go through the manage-users Edge Function (service role) —
-- deliberately no insert/update/delete RLS policy here, so a browser can
-- never mutate this table directly even if the UI were bypassed.

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  role text not null default 'user' check (role in ('admin', 'user')),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table profiles enable row level security;

-- Every logged-in user needs to read their own row to know their own role/status.
create policy profiles_select_own on profiles
  for select to authenticated using (auth.uid() = id);

-- security definer avoids the policy recursing into profiles' own RLS.
create function is_admin() returns boolean
language sql security definer stable as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin' and status = 'active'
  );
$$;

create policy profiles_select_admin on profiles
  for select to authenticated using (is_admin());

-- Callable by anon so the Login screen can decide whether to show
-- "ลงทะเบียนผู้ดูแลระบบคนแรก" — reveals only a boolean, never user data.
create function has_any_admin() returns boolean
language sql security definer stable as $$
  select exists (select 1 from profiles where role = 'admin');
$$;

grant execute on function has_any_admin() to anon, authenticated;
grant select on profiles to authenticated;
