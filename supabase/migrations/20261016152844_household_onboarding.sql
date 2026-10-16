create function public.complete_household_onboarding(
  household_name text,
  household_language text,
  household_color_mode text,
  household_location text,
  household_latitude double precision,
  household_longitude double precision,
  household_timezone text,
  household_profiles jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  new_household_id uuid;
  new_profile_id uuid;
  profile jsonb;
  calendar jsonb;
  profile_name text;
  profile_avatar text;
  profile_color text;
  profile_is_family boolean;
  profile_calendars jsonb;
  family_count integer;
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

  if jsonb_typeof(household_profiles) <> 'array'
    or jsonb_array_length(household_profiles) < 1
    or jsonb_array_length(household_profiles) > 20 then
    raise exception 'Between 1 and 20 profiles are required';
  end if;

  select count(*)
  into family_count
  from jsonb_array_elements(household_profiles) as item
  where coalesce((item->>'family')::boolean, false);

  if family_count <> 1 then
    raise exception 'Exactly one family profile is required';
  end if;

  insert into public.households (
    name,
    language,
    color_mode,
    location_name,
    latitude,
    longitude,
    timezone,
    created_by
  ) values (
    household_name,
    household_language,
    household_color_mode,
    household_location,
    household_latitude,
    household_longitude,
    household_timezone,
    current_user_id
  )
  returning id into new_household_id;

  insert into public.household_members (household_id, user_id, role)
  values (new_household_id, current_user_id, 'owner');

  for profile in
    select value from jsonb_array_elements(household_profiles)
  loop
    profile_name := btrim(profile->>'name');
    profile_avatar := btrim(profile->>'avatar');
    profile_color := profile->>'color';
    profile_is_family := coalesce((profile->>'family')::boolean, false);
    profile_calendars := coalesce(profile->'calendars', '[]'::jsonb);

    if profile_name is null or char_length(profile_name) not between 1 and 80 then
      raise exception 'Invalid profile name';
    end if;

    if profile_avatar is null or char_length(profile_avatar) not between 1 and 12 then
      raise exception 'Invalid profile avatar';
    end if;

    if profile_color is null or profile_color !~ '^#[0-9a-fA-F]{6}$' then
      raise exception 'Invalid profile color';
    end if;

    if jsonb_typeof(profile_calendars) <> 'array'
      or jsonb_array_length(profile_calendars) > 20 then
      raise exception 'A profile can contain at most 20 calendars';
    end if;

    insert into public.profiles (
      household_id,
      name,
      avatar,
      color,
      is_family,
      sort_order
    ) values (
      new_household_id,
      profile_name,
      profile_avatar,
      profile_color,
      profile_is_family,
      coalesce((profile->>'sortOrder')::integer, 0)
    )
    returning id into new_profile_id;

    for calendar in
      select value from jsonb_array_elements(profile_calendars)
    loop
      insert into public.calendar_sources (
        household_id,
        profile_id,
        name,
        feed_url,
        enabled
      ) values (
        new_household_id,
        new_profile_id,
        calendar->>'name',
        calendar->>'url',
        coalesce((calendar->>'enabled')::boolean, true)
      );
    end loop;
  end loop;

  return new_household_id;
end;
$$;

revoke all on function public.complete_household_onboarding(
  text,
  text,
  text,
  text,
  double precision,
  double precision,
  text,
  jsonb
) from public;

grant execute on function public.complete_household_onboarding(
  text,
  text,
  text,
  text,
  double precision,
  double precision,
  text,
  jsonb
) to authenticated;
