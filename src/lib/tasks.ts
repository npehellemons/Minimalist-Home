import type { RealtimeChannel } from "@supabase/supabase-js";

import { supabase } from "#lib/supabase/client.js";
import type { Tables } from "#lib/supabase/database.types.js";

export type TaskKind = "routine" | "chore";
export type TaskDayPart = "morning" | "afternoon" | "evening";
export type ChoreRecurrence = "none" | "daily" | "weekly" | "monthly";

type TaskRow = Tables<"tasks">;
type TaskAssignmentRow = Tables<"task_assignments">;
type TaskCompletionRow = Tables<"task_completions">;

export type DailyTask = {
  id: string;
  profileId: string;
  title: string;
  description: string | null;
  emoji: string | null;
  kind: TaskKind;
  dayPart: TaskDayPart | null;
  dueTime: string | null;
  recurrence: ChoreRecurrence;
  completed: boolean;
};

export type CreateTaskInput = {
  householdId: string;
  title: string;
  kind: TaskKind;
  profileIds: string[];
  dayPart?: TaskDayPart;
  weekdays?: number[];
  dueDate?: string;
  dueTime?: string;
  recurrence?: ChoreRecurrence;
  emoji?: string;
  description?: string;
};

function requireSupabase() {
  if (!supabase) throw new Error("Supabase is not configured");
  return supabase;
}

export function dateKeyInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}-${values.month}-${values.day}`;
}

function weekdayForDateKey(dateKey: string) {
  return new Date(`${dateKey}T12:00:00Z`).getUTCDay();
}

function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return { year, month, day };
}

function dayDifference(fromDateKey: string, toDateKey: string) {
  const from = parseDateKey(fromDateKey);
  const to = parseDateKey(toDateKey);
  return Math.round(
    (Date.UTC(to.year, to.month - 1, to.day) -
      Date.UTC(from.year, from.month - 1, from.day)) /
      86_400_000,
  );
}

function choreAppliesOnDate(task: TaskRow, dateKey: string) {
  if (!task.due_date || dateKey < task.due_date) return false;

  const recurrence = task.recurrence as ChoreRecurrence;
  if (recurrence === "none") return task.due_date === dateKey;
  if (recurrence === "daily") return true;
  if (recurrence === "weekly") {
    return dayDifference(task.due_date, dateKey) % 7 === 0;
  }

  const anchor = parseDateKey(task.due_date);
  const target = parseDateKey(dateKey);
  const lastDayOfTargetMonth = new Date(
    Date.UTC(target.year, target.month, 0),
  ).getUTCDate();

  return target.day === Math.min(anchor.day, lastDayOfTargetMonth);
}

function appliesOnDate(task: TaskRow, dateKey: string, weekday: number) {
  if (!task.is_active) return false;
  if (task.kind === "chore") return choreAppliesOnDate(task, dateKey);
  return task.weekdays?.includes(weekday) === true;
}

export async function getDailyTasks(
  householdId: string,
  dateKey: string,
): Promise<DailyTask[]> {
  const client = requireSupabase();
  const [tasksResult, assignmentsResult, completionsResult] = await Promise.all([
    client
      .from("tasks")
      .select("*")
      .eq("household_id", householdId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    client
      .from("task_assignments")
      .select("*")
      .eq("household_id", householdId),
    client
      .from("task_completions")
      .select("*")
      .eq("household_id", householdId)
      .eq("occurrence_date", dateKey),
  ]);
  const error =
    tasksResult.error ?? assignmentsResult.error ?? completionsResult.error;

  if (error) throw error;

  const weekday = weekdayForDateKey(dateKey);
  const tasks = (tasksResult.data ?? []).filter((task) =>
    appliesOnDate(task, dateKey, weekday),
  );
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const completionKeys = new Set(
    (completionsResult.data ?? []).map(
      (completion: TaskCompletionRow) =>
        `${completion.task_id}\u0000${completion.profile_id}`,
    ),
  );

  return (assignmentsResult.data ?? []).flatMap(
    (assignment: TaskAssignmentRow): DailyTask[] => {
      const task = tasksById.get(assignment.task_id);
      if (!task) return [];

      return [
        {
          id: task.id,
          profileId: assignment.profile_id,
          title: task.title,
          description: task.description,
          emoji: task.emoji,
          kind: task.kind as TaskKind,
          dayPart: task.day_part as TaskDayPart | null,
          dueTime: task.due_time,
          recurrence: task.recurrence as ChoreRecurrence,
          completed: completionKeys.has(
            `${assignment.task_id}\u0000${assignment.profile_id}`,
          ),
        },
      ];
    },
  );
}

export async function createTask(input: CreateTaskInput) {
  const client = requireSupabase();
  const { data, error } = await client.rpc("create_task", {
    target_household_id: input.householdId,
    task_title: input.title.trim(),
    task_kind: input.kind,
    task_profile_ids: input.profileIds,
    task_day_part: input.kind === "routine" ? input.dayPart : null,
    task_due_date: input.kind === "chore" ? input.dueDate : null,
    task_due_time:
      input.kind === "chore" && input.dueTime ? input.dueTime : null,
    task_weekdays: input.kind === "routine" ? input.weekdays : null,
    task_emoji: input.emoji?.trim() || null,
    task_description: input.description?.trim() || null,
    task_recurrence: input.kind === "chore" ? input.recurrence : "none",
  });

  if (error) throw error;
  return data;
}

export async function setTaskCompleted(
  householdId: string,
  taskId: string,
  profileId: string,
  dateKey: string,
  completed: boolean,
) {
  const client = requireSupabase();

  if (completed) {
    const { error } = await client.from("task_completions").upsert({
      household_id: householdId,
      task_id: taskId,
      profile_id: profileId,
      occurrence_date: dateKey,
    });
    if (error) throw error;
    return;
  }

  const { error } = await client
    .from("task_completions")
    .delete()
    .eq("household_id", householdId)
    .eq("task_id", taskId)
    .eq("profile_id", profileId)
    .eq("occurrence_date", dateKey);

  if (error) throw error;
}

export async function deleteTask(householdId: string, taskId: string) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("tasks")
    .delete()
    .eq("household_id", householdId)
    .eq("id", taskId)
    .select("id")
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Task was not found or could not be removed");
}

export function subscribeToTasks(householdId: string, onChange: () => void) {
  const client = requireSupabase();
  const channel: RealtimeChannel = client.channel(`household-tasks:${householdId}`);

  for (const table of ["tasks", "task_assignments", "task_completions"] as const) {
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table,
        filter: `household_id=eq.${householdId}`,
      },
      onChange,
    );
  }

  channel.subscribe();
  return () => void client.removeChannel(channel);
}
