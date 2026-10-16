create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  description text check (description is null or char_length(description) <= 1000),
  emoji text check (emoji is null or char_length(emoji) <= 16),
  kind text not null check (kind in ('routine', 'chore')),
  day_part text check (day_part in ('morning', 'afternoon', 'evening')),
  weekdays smallint[],
  due_date date,
  due_time time,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, household_id),
  check (
    (
      kind = 'routine'
      and day_part is not null
      and weekdays is not null
      and cardinality(weekdays) > 0
      and weekdays <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]
      and due_date is null
      and due_time is null
    )
    or
    (
      kind = 'chore'
      and day_part is null
      and weekdays is null
      and due_date is not null
    )
  )
);

create table public.task_assignments (
  task_id uuid not null,
  household_id uuid not null references public.households(id) on delete cascade,
  profile_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (task_id, profile_id),
  unique (task_id, household_id, profile_id),
  foreign key (task_id, household_id)
    references public.tasks(id, household_id)
    on delete cascade,
  foreign key (profile_id, household_id)
    references public.profiles(id, household_id)
    on delete cascade
);

create table public.task_completions (
  task_id uuid not null,
  household_id uuid not null references public.households(id) on delete cascade,
  profile_id uuid not null,
  occurrence_date date not null,
  completed_by uuid not null default auth.uid() references auth.users(id),
  completed_at timestamptz not null default now(),
  primary key (task_id, profile_id, occurrence_date),
  foreign key (task_id, household_id, profile_id)
    references public.task_assignments(task_id, household_id, profile_id)
    on delete cascade
);

create index tasks_household_active_idx
  on public.tasks (household_id, is_active, kind);
create index tasks_household_due_date_idx
  on public.tasks (household_id, due_date)
  where kind = 'chore' and is_active;
create index task_assignments_household_profile_idx
  on public.task_assignments (household_id, profile_id);
create index task_completions_household_date_idx
  on public.task_completions (household_id, occurrence_date);

alter table public.tasks enable row level security;
alter table public.task_assignments enable row level security;
alter table public.task_completions enable row level security;

create policy "Members can view tasks"
on public.tasks for select
to authenticated
using ((select private.is_household_member(household_id)));

create policy "Members can create tasks"
on public.tasks for insert
to authenticated
with check (
  (select private.is_household_member(household_id))
  and created_by = (select auth.uid())
);

create policy "Members can update tasks"
on public.tasks for update
to authenticated
using ((select private.is_household_member(household_id)))
with check ((select private.is_household_member(household_id)));

create policy "Members can remove tasks"
on public.tasks for delete
to authenticated
using ((select private.is_household_member(household_id)));

create policy "Members can view task assignments"
on public.task_assignments for select
to authenticated
using ((select private.is_household_member(household_id)));

create policy "Members can create task assignments"
on public.task_assignments for insert
to authenticated
with check ((select private.is_household_member(household_id)));

create policy "Members can remove task assignments"
on public.task_assignments for delete
to authenticated
using ((select private.is_household_member(household_id)));

create policy "Members can view task completions"
on public.task_completions for select
to authenticated
using ((select private.is_household_member(household_id)));

create policy "Members can complete tasks"
on public.task_completions for insert
to authenticated
with check (
  (select private.is_household_member(household_id))
  and completed_by = (select auth.uid())
);

create policy "Members can update task completions"
on public.task_completions for update
to authenticated
using ((select private.is_household_member(household_id)))
with check (
  (select private.is_household_member(household_id))
  and completed_by = (select auth.uid())
);

create policy "Members can uncomplete tasks"
on public.task_completions for delete
to authenticated
using ((select private.is_household_member(household_id)));

revoke all on table public.tasks from anon, authenticated;
revoke all on table public.task_assignments from anon, authenticated;
revoke all on table public.task_completions from anon, authenticated;
grant select, insert, update, delete on table public.tasks to authenticated;
grant select, insert, delete on table public.task_assignments to authenticated;
grant select, insert, update, delete on table public.task_completions to authenticated;

create trigger tasks_set_updated_at
before update on public.tasks
for each row execute function private.set_updated_at();

create function private.protect_task_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.household_id <> old.household_id or new.created_by <> old.created_by then
    raise exception 'Task identity fields cannot be changed';
  end if;

  return new;
end;
$$;

create trigger tasks_protect_identity
before update on public.tasks
for each row execute function private.protect_task_identity();

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
  task_description text default null
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
    due_time
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
    case when task_kind = 'chore' then task_due_time else null end
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
  text
) to authenticated;

alter publication supabase_realtime
  add table public.tasks, public.task_assignments, public.task_completions;
