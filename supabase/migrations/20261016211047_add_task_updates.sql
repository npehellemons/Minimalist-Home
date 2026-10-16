create function public.update_task(
  target_household_id uuid,
  target_task_id uuid,
  task_title text,
  task_kind text,
  task_profile_ids uuid[],
  task_day_part text default null,
  task_due_date date default null,
  task_due_time time default null,
  task_weekdays smallint[] default null,
  task_emoji text default null,
  task_description text default null,
  task_recurrence text default 'none'
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  affected_rows integer;
  normalized_profile_ids uuid[];
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.is_household_member(target_household_id)) then
    raise exception 'Household membership required';
  end if;

  select array_agg(distinct profile_id)
  into normalized_profile_ids
  from unnest(task_profile_ids) as profile_id;

  if normalized_profile_ids is null or cardinality(normalized_profile_ids) = 0 then
    raise exception 'At least one profile is required';
  end if;

  if exists (
    select 1
    from unnest(normalized_profile_ids) as requested_profile_id
    where not exists (
      select 1
      from public.profiles
      where id = requested_profile_id
        and household_id = target_household_id
    )
  ) then
    raise exception 'Profile does not belong to household';
  end if;

  update public.tasks
  set
    title = trim(task_title),
    description = nullif(trim(task_description), ''),
    emoji = nullif(trim(task_emoji), ''),
    kind = task_kind,
    day_part = case when task_kind = 'routine' then task_day_part else null end,
    weekdays = case
      when task_kind = 'routine'
        then coalesce(task_weekdays, array[0, 1, 2, 3, 4, 5, 6]::smallint[])
      else null
    end,
    due_date = case when task_kind = 'chore' then task_due_date else null end,
    due_time = case when task_kind = 'chore' then task_due_time else null end,
    recurrence = case when task_kind = 'chore' then task_recurrence else 'none' end
  where id = target_task_id
    and household_id = target_household_id;

  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 then
    raise exception 'Task not found';
  end if;

  delete from public.task_assignments
  where task_id = target_task_id
    and household_id = target_household_id
    and not (profile_id = any(normalized_profile_ids));

  insert into public.task_assignments (task_id, household_id, profile_id)
  select target_task_id, target_household_id, profile_id
  from unnest(normalized_profile_ids) as profile_id
  on conflict (task_id, profile_id) do nothing;
end;
$$;

revoke all on function public.update_task(
  uuid,
  uuid,
  text,
  text,
  uuid[],
  text,
  date,
  time,
  smallint[],
  text,
  text,
  text
) from public;
grant execute on function public.update_task(
  uuid,
  uuid,
  text,
  text,
  uuid[],
  text,
  date,
  time,
  smallint[],
  text,
  text,
  text
) to authenticated;
