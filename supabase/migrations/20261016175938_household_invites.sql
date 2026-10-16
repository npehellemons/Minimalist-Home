alter table public.household_members
add column profile_id uuid;

alter table public.household_members
add constraint household_members_profile_household_fkey
foreign key (profile_id, household_id)
references public.profiles (id, household_id)
on delete set null (profile_id);

create table private.household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  profile_id uuid,
  code_hash text not null unique,
  expires_at timestamptz not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (profile_id, household_id)
    references public.profiles(id, household_id)
    on delete cascade
);

create index household_invites_household_id_idx
on private.household_invites (household_id, created_at desc);

create function public.create_household_invite(invited_profile_id uuid default null)
returns table (invite_code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_household_id uuid;
  raw_code text;
  invitation_expires_at timestamptz := now() + interval '7 days';
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select household_id
  into current_household_id
  from public.household_members
  where user_id = current_user_id
    and role in ('owner', 'admin')
  order by created_at
  limit 1;

  if current_household_id is null then
    raise exception 'Household administrator access required';
  end if;

  if invited_profile_id is not null and not exists (
    select 1
    from public.profiles
    where id = invited_profile_id
      and household_id = current_household_id
      and not is_family
  ) then
    raise exception 'Invalid household profile';
  end if;

  raw_code := upper(encode(extensions.gen_random_bytes(6), 'hex'));

  insert into private.household_invites (
    household_id,
    profile_id,
    code_hash,
    expires_at,
    created_by
  ) values (
    current_household_id,
    invited_profile_id,
    encode(extensions.digest(lower(raw_code), 'sha256'), 'hex'),
    invitation_expires_at,
    current_user_id
  );

  return query select
    substring(raw_code from 1 for 4) || '-' ||
      substring(raw_code from 5 for 4) || '-' ||
      substring(raw_code from 9 for 4),
    invitation_expires_at;
end;
$$;

create function public.join_household(invite_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_code text := lower(regexp_replace(invite_code, '[^0-9a-fA-F]', '', 'g'));
  invitation private.household_invites%rowtype;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if exists (
    select 1
    from public.household_members
    where user_id = current_user_id
  ) then
    raise exception 'User already belongs to a household';
  end if;

  select *
  into invitation
  from private.household_invites
  where code_hash = encode(extensions.digest(normalized_code, 'sha256'), 'hex')
    and accepted_at is null
    and expires_at > now()
  for update;

  if invitation.id is null then
    raise exception 'Invite is invalid or expired';
  end if;

  insert into public.household_members (
    household_id,
    user_id,
    role,
    profile_id
  ) values (
    invitation.household_id,
    current_user_id,
    'member',
    invitation.profile_id
  );

  update private.household_invites
  set accepted_by = current_user_id,
      accepted_at = now()
  where id = invitation.id;

  return invitation.household_id;
end;
$$;

revoke all on function public.create_household_invite(uuid) from public;
revoke all on function public.join_household(text) from public;
grant execute on function public.create_household_invite(uuid) to authenticated;
grant execute on function public.join_household(text) to authenticated;
