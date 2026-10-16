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
const browser = createClient(url, publishableKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const testId = crypto.randomUUID();
const email = `onboarding-${testId}@example.invalid`;
const password = `${crypto.randomUUID()}Aa1!`;
let userId;
let householdId;

try {
  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
  if (createError) throw createError;
  userId = created.user.id;

  const { error: signInError } = await browser.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError) throw signInError;

  const { data: createdHousehold, error: onboardingError } = await browser.rpc(
    "complete_household_onboarding",
    {
      household_name: "Onboarding smoke test",
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
          calendars: [
            {
              name: "Testkalender",
              url: "https://example.invalid/calendar.ics",
              enabled: true,
            },
          ],
        },
      ],
    },
  );
  if (onboardingError) throw onboardingError;
  householdId = createdHousehold;

  const [households, profiles, calendars] = await Promise.all([
    browser.from("households").select("id"),
    browser.from("profiles").select("id"),
    browser.from("calendar_sources").select("id"),
  ]);

  const queryError = households.error ?? profiles.error ?? calendars.error;
  if (queryError) throw queryError;
  if (households.data.length !== 1) throw new Error("Household RLS check failed");
  if (profiles.data.length !== 2) throw new Error("Profile import check failed");
  if (calendars.data.length !== 1) throw new Error("Calendar import check failed");

  const personalProfile = profiles.data.find((profile) => profile.id);
  if (!personalProfile) throw new Error("Profile CRUD setup failed");

  const { data: createdCalendar, error: createCalendarError } = await browser
    .from("calendar_sources")
    .insert({
      household_id: householdId,
      profile_id: personalProfile.id,
      name: "Settings test",
      feed_url: "webcal://example.invalid/settings.ics",
      enabled: true,
    })
    .select("id")
    .single();
  if (createCalendarError) throw createCalendarError;

  const { data: updatedCalendar, error: updateCalendarError } = await browser
    .from("calendar_sources")
    .update({ name: "Settings test updated", enabled: false })
    .eq("id", createdCalendar.id)
    .select("name, enabled")
    .single();
  if (updateCalendarError) throw updateCalendarError;
  if (updatedCalendar.name !== "Settings test updated" || updatedCalendar.enabled) {
    throw new Error("Calendar update check failed");
  }

  const { error: deleteCalendarError } = await browser
    .from("calendar_sources")
    .delete()
    .eq("id", createdCalendar.id);
  if (deleteCalendarError) throw deleteCalendarError;

  const { data: remainingCalendar, error: remainingCalendarError } = await browser
    .from("calendar_sources")
    .select("id")
    .eq("id", createdCalendar.id)
    .maybeSingle();
  if (remainingCalendarError) throw remainingCalendarError;
  if (remainingCalendar) throw new Error("Calendar delete check failed");

  console.log("Household onboarding and settings CRUD smoke test passed");
} finally {
  if (householdId) {
    await admin.from("households").delete().eq("id", householdId);
  }
  if (userId) {
    await admin.auth.admin.deleteUser(userId);
  }
}
