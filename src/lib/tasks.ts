import type { RealtimeChannel } from "@supabase/supabase-js";

import { supabase } from "#lib/supabase/client.js";
import type { Tables } from "#lib/supabase/database.types.js";

export type TaskKind = "routine" | "chore";
export type TaskDayPart = "morning" | "afternoon" | "evening";

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
  completed: boolean;
};

export type CreateTaskInput = {
  householdId: string;
  title: string;
  kind: TaskKind;
  profileIds: string[];
  dayPart?: TaskDayPart;
  dueDate?: string;
  dueTime?: string;
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

function appliesOnDate(task: TaskRow, dateKey: string, weekday: number) {
  if (!task.is_active) return false;
  if (task.kind === "chore") return task.due_date === dateKey;
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
    task_weekdays:
      input.kind === "routine" ? [0, 1, 2, 3, 4, 5, 6] : null,
    task_emoji: input.emoji?.trim() || null,
    task_description: input.description?.trim() || null,
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
