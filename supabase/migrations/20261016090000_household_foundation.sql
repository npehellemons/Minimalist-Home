create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  language text not null default 'nl' check (language in ('nl', 'en')),
  color_mode text not null default 'auto' check (color_mode in ('auto', 'light', 'dark')),
  location_name text not null default 'Goirle',
  latitude double precision not null default 51.5237 check (latitude between -90 and 90),
  longitude double precision not null default 5.0642 check (longitude between -180 and 180),
  timezone text not null default 'Europe/Amsterdam',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  avatar text not null check (char_length(avatar) between 1 and 12),
  color text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  is_family boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, household_id)
);

create unique index profiles_one_family_per_household
  on public.profiles (household_id)
  where is_family;

create table public.calendar_sources (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  profile_id uuid not null,
  name text not null check (char_length(name) between 1 and 100),
  feed_url text not null check (feed_url ~ '^https://' or feed_url ~ '^webcal://'),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (profile_id, household_id)
    references public.profiles(id, household_id)
    on delete cascade
);

create index household_members_user_id_idx
  on public.household_members (user_id);
create index profiles_household_sort_idx
  on public.profiles (household_id, sort_order, created_at);
create index calendar_sources_profile_idx
  on public.calendar_sources (profile_id, enabled);

create function private.is_household_member(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members
    where household_id = target_household_id
      and user_id = (select auth.uid())
  );
$$;

create function private.is_household_admin(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members
    where household_id = target_household_id
      and user_id = (select auth.uid())
      and role in ('owner', 'admin')
  );
$$;

revoke all on function private.is_household_member(uuid) from public;
revoke all on function private.is_household_admin(uuid) from public;
grant execute on function private.is_household_member(uuid) to authenticated;
grant execute on function private.is_household_admin(uuid) to authenticated;

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.profiles enable row level security;
alter table public.calendar_sources enable row level security;

create policy "Members can view their household"
on public.households for select
to authenticated
using ((select private.is_household_member(id)));

create policy "Admins can update their household"
on public.households for update
to authenticated
using ((select private.is_household_admin(id)))
with check ((select private.is_household_admin(id)));

create policy "Members can view household membership"
on public.household_members for select
to authenticated
using ((select private.is_household_member(household_id)));

create policy "Admins can add household members"
on public.household_members for insert
to authenticated
with check ((select private.is_household_admin(household_id)));

create policy "Admins can update household members"
on public.household_members for update
to authenticated
using ((select private.is_household_admin(household_id)))
with check ((select private.is_household_admin(household_id)));

create policy "Admins can remove household members"
on public.household_members for delete
to authenticated
using ((select private.is_household_admin(household_id)));

create policy "Members can view profiles"
on public.profiles for select
to authenticated
using ((select private.is_household_member(household_id)));

create policy "Admins can add profiles"
on public.profiles for insert
to authenticated
with check ((select private.is_household_admin(household_id)));

create policy "Admins can update profiles"
on public.profiles for update
to authenticated
using ((select private.is_household_admin(household_id)))
with check ((select private.is_household_admin(household_id)));

create policy "Admins can remove profiles"
on public.profiles for delete
to authenticated
using ((select private.is_household_admin(household_id)) and not is_family);

create policy "Members can view calendar sources"
on public.calendar_sources for select
to authenticated
using ((select private.is_household_member(household_id)));

create policy "Admins can add calendar sources"
on public.calendar_sources for insert
to authenticated
with check ((select private.is_household_admin(household_id)));

create policy "Admins can update calendar sources"
on public.calendar_sources for update
to authenticated
using ((select private.is_household_admin(household_id)))
with check ((select private.is_household_admin(household_id)));

create policy "Admins can remove calendar sources"
on public.calendar_sources for delete
to authenticated
using ((select private.is_household_admin(household_id)));

grant select, update on public.households to authenticated;
grant select, insert, update, delete on public.household_members to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.calendar_sources to authenticated;

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger households_set_updated_at
before update on public.households
for each row execute function private.set_updated_at();

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

create trigger calendar_sources_set_updated_at
before update on public.calendar_sources
for each row execute function private.set_updated_at();

create function public.create_household(
  household_name text,
  family_name text default 'Family',
  household_language text default 'nl',
  household_location text default 'Goirle',
  household_latitude double precision default 51.5237,
  household_longitude double precision default 5.0642,
  household_timezone text default 'Europe/Amsterdam'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  new_household_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  insert into public.households (
    name,
    language,
    location_name,
    latitude,
    longitude,
    timezone,
    created_by
  ) values (
    household_name,
    household_language,
    household_location,
    household_latitude,
    household_longitude,
    household_timezone,
    current_user_id
  )
  returning id into new_household_id;

  insert into public.household_members (household_id, user_id, role)
  values (new_household_id, current_user_id, 'owner');

  insert into public.profiles (
    household_id,
    name,
    avatar,
    color,
    is_family,
    sort_order
  ) values (
    new_household_id,
    family_name,
    upper(left(family_name, 1)),
    '#e11d48',
    true,
    0
  );

  return new_household_id;
end;
$$;

revoke all on function public.create_household(
  text,
  text,
  text,
  text,
  double precision,
  double precision,
  text
) from public;
grant execute on function public.create_household(
  text,
  text,
  text,
  text,
  double precision,
  double precision,
  text
) to authenticated;
