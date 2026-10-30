create table public.task_occurrence_states (
  task_id uuid not null,
  household_id uuid not null references public.households(id) on delete cascade,
  profile_id uuid not null,
  occurrence_date date not null,
  status text not null check (status in ('completed', 'skipped', 'missed')),
  resolved_by uuid default auth.uid() references auth.users(id),
  resolved_at timestamptz not null default now(),
  resolved_date date not null default current_date,
  primary key (task_id, profile_id, occurrence_date),
  foreign key (task_id, household_id, profile_id)
    references public.task_assignments(task_id, household_id, profile_id)
    on delete cascade,
  check (status = 'missed' or resolved_by is not null)
);

create index task_occurrence_states_household_date_idx
  on public.task_occurrence_states (household_id, occurrence_date);

alter table public.task_occurrence_states enable row level security;

create policy "Members can view task occurrence states"
on public.task_occurrence_states for select
to authenticated
using ((select private.is_household_member(household_id)));

create policy "Members can create task occurrence states"
on public.task_occurrence_states for insert
to authenticated
with check (
  (select private.is_household_member(household_id))
  and status in ('completed', 'skipped')
  and resolved_by = (select auth.uid())
);

create policy "Members can update task occurrence states"
on public.task_occurrence_states for update
to authenticated
using ((select private.is_household_member(household_id)))
with check (
  (select private.is_household_member(household_id))
  and status in ('completed', 'skipped')
  and resolved_by = (select auth.uid())
);

create policy "Members can clear task occurrence states"
on public.task_occurrence_states for delete
to authenticated
using ((select private.is_household_member(household_id)));

revoke all on table public.task_occurrence_states from anon, authenticated;
grant select, insert, update, delete on table public.task_occurrence_states to authenticated;

insert into public.task_occurrence_states (
  task_id,
  household_id,
  profile_id,
  occurrence_date,
  status,
  resolved_by,
  resolved_at,
  resolved_date
)
select
  task_id,
  household_id,
  profile_id,
  occurrence_date,
  'completed',
  completed_by,
  completed_at,
  completed_at::date
from public.task_completions
on conflict (task_id, profile_id, occurrence_date) do nothing;

create function private.sync_task_completion_occurrence_state()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.task_occurrence_states
    where task_id = old.task_id
      and profile_id = old.profile_id
      and occurrence_date = old.occurrence_date
      and status = 'completed';
    return old;
  end if;

  insert into public.task_occurrence_states (
    task_id,
    household_id,
    profile_id,
    occurrence_date,
    status,
    resolved_by,
    resolved_at,
    resolved_date
  ) values (
    new.task_id,
    new.household_id,
    new.profile_id,
    new.occurrence_date,
    'completed',
    new.completed_by,
    new.completed_at,
    new.completed_at::date
  )
  on conflict (task_id, profile_id, occurrence_date) do update
  set status = excluded.status,
      resolved_by = excluded.resolved_by,
      resolved_at = excluded.resolved_at,
      resolved_date = excluded.resolved_date;

  return new;
end;
$$;

create trigger task_completions_sync_occurrence_state
after insert or update or delete on public.task_completions
for each row execute function private.sync_task_completion_occurrence_state();

alter publication supabase_realtime add table public.task_occurrence_states;
