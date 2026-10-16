import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;

if (!url || !publishableKey || !secretKey) {
  throw new Error("Missing Supabase test environment variables");
}

const admin = createClient(url, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const testId = crypto.randomUUID();
const password = `${crypto.randomUUID()}Aa1!`;
const users = [];
let householdId;

async function createBrowser(label) {
  const email = `tasks-${label}-${testId}@example.invalid`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  users.push(data.user.id);

  const browser = createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInError } = await browser.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError) throw signInError;
  return browser;
}

try {
  const owner = await createBrowser("owner");
  const member = await createBrowser("member");

  const { data: createdHousehold, error: onboardingError } = await owner.rpc(
    "complete_household_onboarding",
    {
      household_name: "Tasks smoke test",
      household_language: "nl",
      household_color_mode: "auto",
      household_location: "Goirle",
      household_latitude: 51.5237,
      household_longitude: 5.0642,
      household_timezone: "Europe/Amsterdam",
      household_profiles: [
        {
          name: "Gezin",
          avatar: "G",
          color: "#e11d48",
          family: true,
          sortOrder: 0,
          calendars: [],
        },
        {
          name: "Testpersoon",
          avatar: "T",
          color: "#2563eb",
          family: false,
          sortOrder: 1,
          calendars: [],
        },
      ],
    },
  );
  if (onboardingError) throw onboardingError;
  householdId = createdHousehold;

  const { data: profiles, error: profilesError } = await owner
    .from("profiles")
    .select("id, is_family")
    .order("sort_order");
  if (profilesError) throw profilesError;
  const family = profiles.find((profile) => profile.is_family);
  const person = profiles.find((profile) => !profile.is_family);
  if (!family || !person) throw new Error("Test profiles were not created");

  const { data: inviteRows, error: inviteError } = await owner.rpc(
    "create_household_invite",
    { invited_profile_id: person.id },
  );
  if (inviteError) throw inviteError;
  const invite = inviteRows?.[0];
  if (!invite?.invite_code) throw new Error("Invite creation failed");

  const { error: joinError } = await member.rpc("join_household", {
    invite_code: invite.invite_code,
  });
  if (joinError) throw joinError;

  const { data: taskId, error: taskError } = await owner.rpc("create_task", {
    target_household_id: householdId,
    task_title: "Tanden poetsen",
    task_kind: "routine",
    task_profile_ids: [family.id, person.id],
    task_day_part: "morning",
    task_weekdays: [1, 3, 5],
    task_emoji: "🪥",
  });
  if (taskError) throw taskError;
  if (!taskId) throw new Error("Task was not created");

  const { data: memberTasks, error: memberTasksError } = await member
    .from("tasks")
    .select("id, title, kind, day_part, weekdays")
    .eq("household_id", householdId);
  if (memberTasksError) throw memberTasksError;
  if (memberTasks.length !== 1 || memberTasks[0].id !== taskId) {
    throw new Error("Member could not read the household task");
  }
  if (memberTasks[0].weekdays.join(",") !== "1,3,5") {
    throw new Error("Selected routine weekdays were not stored correctly");
  }

  const { data: choreId, error: choreError } = await owner.rpc("create_task", {
    target_household_id: householdId,
    task_title: "Papier buiten zetten",
    task_kind: "chore",
    task_profile_ids: [family.id],
    task_due_date: "2026-10-31",
    task_recurrence: "monthly",
  });
  if (choreError) throw choreError;
  if (!choreId) throw new Error("Recurring chore was not created");

  const { data: chores, error: choresError } = await member
    .from("tasks")
    .select("id, due_date, recurrence")
    .eq("id", choreId);
  if (choresError) throw choresError;
  if (
    chores.length !== 1 ||
    chores[0].due_date !== "2026-10-31" ||
    chores[0].recurrence !== "monthly"
  ) {
    throw new Error("Recurring chore schedule was not stored correctly");
  }

  const { data: assignments, error: assignmentsError } = await member
    .from("task_assignments")
    .select("profile_id")
    .eq("task_id", taskId);
  if (assignmentsError) throw assignmentsError;
  if (assignments.length !== 2) {
    throw new Error("Multi-profile task assignments were not created");
  }

  const occurrenceDate = new Date().toISOString().slice(0, 10);
  const { error: completionError } = await member
    .from("task_completions")
    .insert({
      task_id: taskId,
      household_id: householdId,
      profile_id: person.id,
      occurrence_date: occurrenceDate,
    });
  if (completionError) throw completionError;

  const { data: completions, error: completionsError } = await owner
    .from("task_completions")
    .select("task_id, profile_id, occurrence_date")
    .eq("task_id", taskId);
  if (completionsError) throw completionsError;
  if (
    completions.length !== 1 ||
    completions[0].profile_id !== person.id ||
    completions[0].occurrence_date !== occurrenceDate
  ) {
    throw new Error("Task completion did not synchronize across members");
  }

  const { error: invalidAssignmentError } = await member
    .from("task_completions")
    .insert({
      task_id: taskId,
      household_id: householdId,
      profile_id: crypto.randomUUID(),
      occurrence_date: occurrenceDate,
    });
  if (!invalidAssignmentError) {
    throw new Error("Completion without an assignment was accepted");
  }

  console.log("Household tasks and completion RLS smoke test passed");
} finally {
  if (householdId) {
    await admin.from("households").delete().eq("id", householdId);
  }
  for (const userId of users) {
    await admin.auth.admin.deleteUser(userId);
  }
}
