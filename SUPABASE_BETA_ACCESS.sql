-- SocialRadar: Beta Access Management
-- Run this in Supabase SQL Editor

-- 1) Add beta_access flag to profiles
alter table public.profiles
add column if not exists beta_access boolean not null default false;

-- 2) Grant beta access to a user by email
-- Replace with target email
with target_user as (
  select id, email
  from auth.users
  where email = 'nuevo@correo.com'
  limit 1
)
insert into public.profiles (id, email, beta_access, is_premium, subscription_status)
select id, email, true, false, 'inactive'
from target_user
on conflict (id) do update
set
  email = excluded.email,
  beta_access = true;

-- 3) Optional: Revoke beta access by email
-- update public.profiles
-- set beta_access = false
-- where email = 'nuevo@correo.com';
