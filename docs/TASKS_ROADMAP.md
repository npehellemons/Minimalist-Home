# Tasks Roadmap

This roadmap adapts the useful parts of Skylight Calendar's task model to
Minimalist Home without copying its implementation or subscription features.

Official references reviewed:

- [Using the Tasks Tab: Routines and Chores](https://skylight.zendesk.com/hc/en-us/articles/36846381293979-Using-the-Tasks-Tab-Routines-and-Chores)
- [Tasks: Routines and Chores](https://skylight.zendesk.com/hc/en-us/articles/50542473921819-Tasks-Routines-and-Chores)
- [What Are Tasks?](https://skylight.zendesk.com/hc/en-us/articles/35335515611803-What-Are-Tasks)

## Product Model

Minimalist Home uses two task types:

- **Routine:** a repeating habit associated with morning, afternoon, or evening.
- **Chore:** a one-time or repeating responsibility with a due date and optional
  time, independent of the selected routine day-part.

A task may be assigned to one or more profiles. Each assignment gets an
independent completion state so two people can complete the same task separately.
The Family profile represents a genuinely shared task, not an unassigned task.

Task type and recurrence are separate concepts. A routine describes a habit tied
to a day-part and may repeat daily or on selected weekdays. A chore describes a
responsibility and may be one-time or repeat daily, weekly, monthly, or on a
custom schedule. A weekly habit can therefore remain a routine; a monthly item
with a due date is normally clearer as a repeating chore.

Rewards and stars are intentionally outside the planned scope for now.

## Phase 1: Daily Checklist

Implemented:

- Persist routines, chores, assignments, and daily completion records in
  Supabase.
- Show one scrollable column per visible profile.
- Use the active profile in the top navigation as a dashboard-wide filter.
- Show routines for the selected morning, afternoon, or evening block.
- Keep chores due today visible in every day-part view.
- Create a daily routine or one-time chore from a Shadcn Sheet.
- Repeat routines every day or on selected weekdays.
- Repeat chores daily, weekly, or monthly from a chosen start date.
- Remove a task through an overflow menu and confirmation dialog.
- Assign a task to one or more profiles.
- Add an optional emoji for quick visual recognition.
- Check and uncheck tasks with optimistic feedback.
- Move completed tasks below incomplete tasks.
- Synchronize task changes between devices with Supabase Realtime.
- Reset routine completion naturally by recording it per occurrence date.
- Provide Dutch and English interface copy.

Current deliberate limits:

- The board shows today only.
- Tasks cannot yet be edited, skipped, or reordered in the interface.
- Chore recurrence currently uses a single start date. Weekly chores repeat on
  that weekday; monthly chores repeat on that day number and use the last day of
  shorter months when necessary.
- There is no overdue filter or unassigned task column.

## Phase 2: Management

- Open a task details Sheet by tapping its row.
- Edit title, emoji, description, assignment, type, and schedule.
- Refine deletion when occurrence-level editing is introduced.
- For recurring tasks, distinguish deleting one occurrence from the whole task.
- Add descriptions without crowding the daily board.
- Add loading, success, and failure toasts for mutations.
- Add an archive path so removed task definitions do not destroy useful history.

Acceptance criteria:

- Every task can be corrected or removed from both phone and frame.
- Destructive recurring actions clearly state their scope.
- A failed mutation restores the previous visible state.

## Phase 3: Recurrence And Skip

- Let one routine appear in multiple day-parts without duplicating its definition.
- Add custom recurrence intervals and selected weekdays for chores.
- Add optional recurrence end dates.
- Store skipped occurrences separately from completed occurrences.
- Support complete, incomplete, skip, and unskip actions.
- Define timezone and daylight-saving behavior in the household timezone.

Acceptance criteria:

- Recurrence is calculated consistently on the frame and phones.
- Editing a series offers this occurrence, future occurrences, or the full series
  where those choices are meaningful.
- A skipped occurrence never appears overdue.

## Phase 4: Day And Week Navigation

- Add previous, today, and next day navigation.
- Add a week view focused on one profile at a time.
- Keep the daily multi-profile board as the primary frame experience.
- Add show-completed and show-overdue filters.
- Remember view and filter preferences per device.
- Ensure the active profile filter and task-level profile filters do not conflict.

Acceptance criteria:

- Day navigation never changes the household timezone accidentally.
- Week view remains usable on a phone and at 1280 x 800.
- Filters do not change or delete task data.

## Phase 5: Up For Grabs

Use a separate unassigned state rather than overloading the Family profile.

- Add an **Up for grabs** column that can be shown or hidden.
- Allow only chores to be unassigned initially.
- Let a person claim and complete a task in one short flow.
- Move a completed claimed task into the credited person's history.
- Returning it to incomplete should return it to Up for grabs.
- Handle two people attempting to claim the same occurrence atomically.

Acceptance criteria:

- Exactly one person receives credit for a claimed occurrence.
- The Family profile continues to mean shared ownership.
- Concurrent claims cannot duplicate completion.

## Phase 6: Ordering And Polish

- Reorder routines within a profile and day-part.
- Keep chores ordered by overdue state, due time, and creation order.
- Add optional task descriptions and larger visual cues for young readers.
- Consider a restrained completion celebration, without a reward economy.
- Add offline mutation queuing only if real device testing shows it is needed.
- Measure long-running Realtime stability and memory use on the frame.

## Data Model Notes

- `tasks` stores the definition and simple schedule.
- `task_assignments` links a task to one or more household profiles.
- `task_completions` records completion per task, profile, and occurrence date.
- The current `weekdays` field supports the next routine recurrence step.
- Richer recurrence should introduce explicit schedule/occurrence semantics rather
  than accumulating loosely related nullable columns.
- Up for grabs will need an atomic claim operation and should not be represented
  by an assignment to the Family profile.
- Completion history should be retained when a task is archived.

## Verification

Run:

```sh
pnpm check
pnpm build
pnpm test:tasks
```

The task integration test creates temporary owner and member accounts, creates a
multi-profile routine, verifies household reads, completes it as the member,
checks synchronization as the owner, rejects an invalid completion, and cleans up
all test data.
