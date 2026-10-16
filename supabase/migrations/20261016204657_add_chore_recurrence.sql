alter table public.tasks
  add column recurrence text not null default 'none'
  check (recurrence in ('none', 'daily', 'weekly', 'monthly'));

alter table public.tasks drop constraint tasks_check;

alter table public.tasks
  add constraint tasks_schedule_check check (
    (
      kind = 'routine'
      and day_part is not null
      and weekdays is not null
      and cardinality(weekdays) > 0
      and weekdays <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]
      and due_date is null
      and due_time is null
      and recurrence = 'none'
    )
    or
    (
      kind = 'chore'
      and day_part is null
      and weekdays is null
      and due_date is not null
    )
  );

drop function public.create_task(
  uuid,
  text,
  text,
  uuid[],
  text,
  date,
  time,
  smallint[],
  text,
  text
);

create function public.create_task(
  target_household_id uuid,
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
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  new_task_id uuid;
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

  insert into public.tasks (
    household_id,
    title,
    description,
    emoji,
    kind,
    day_part,
    weekdays,
    due_date,
    due_time,
    recurrence
  ) values (
    target_household_id,
    trim(task_title),
    nullif(trim(task_description), ''),
    nullif(trim(task_emoji), ''),
    task_kind,
    case when task_kind = 'routine' then task_day_part else null end,
    case
      when task_kind = 'routine'
        then coalesce(task_weekdays, array[0, 1, 2, 3, 4, 5, 6]::smallint[])
      else null
    end,
    case when task_kind = 'chore' then task_due_date else null end,
    case when task_kind = 'chore' then task_due_time else null end,
    case when task_kind = 'chore' then task_recurrence else 'none' end
  )
  returning id into new_task_id;

  insert into public.task_assignments (task_id, household_id, profile_id)
  select new_task_id, target_household_id, profile_id
  from unnest(normalized_profile_ids) as profile_id;

  return new_task_id;
end;
$$;

revoke all on function public.create_task(
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
grant execute on function public.create_task(
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
