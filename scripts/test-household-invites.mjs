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
  const email = `invite-${label}-${testId}@example.invalid`;
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
  const secondMember = await createBrowser("second-member");

  const { data: createdHousehold, error: onboardingError } = await owner.rpc(
    "complete_household_onboarding",
    {
      household_name: "Invitation smoke test",
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

  const { data: profile, error: profileError } = await owner
    .from("profiles")
    .select("id")
    .eq("is_family", false)
    .single();
  if (profileError) throw profileError;

  const { data: inviteRows, error: inviteError } = await owner.rpc(
    "create_household_invite",
    { invited_profile_id: profile.id },
  );
  if (inviteError) throw inviteError;
  const invite = inviteRows?.[0];
  if (!invite?.invite_code) throw new Error("Invite creation failed");

  const { error: invalidCodeError } = await member.rpc("join_household", {
    invite_code: "0000-0000-0000",
  });
  if (!invalidCodeError) throw new Error("Invalid invite was accepted");

  const { data: joinedHousehold, error: joinError } = await member.rpc(
    "join_household",
    { invite_code: invite.invite_code },
  );
  if (joinError) throw joinError;
  if (joinedHousehold !== householdId) throw new Error("Joined wrong household");

  const { data: membership, error: membershipError } = await member
    .from("household_members")
    .select("role, profile_id")
    .eq("user_id", users[1])
    .single();
  if (membershipError) throw membershipError;
  if (membership.role !== "member" || membership.profile_id !== profile.id) {
    throw new Error("Member profile link was not created correctly");
  }

  const { data: visibleProfiles, error: profilesError } = await member
    .from("profiles")
    .select("id");
  if (profilesError) throw profilesError;
  if (visibleProfiles.length !== 2) throw new Error("Member RLS read failed");

  const { error: memberInviteError } = await member.rpc(
    "create_household_invite",
    { invited_profile_id: profile.id },
  );
  if (!memberInviteError) throw new Error("Member created an administrator invite");

  const { error: reusedCodeError } = await secondMember.rpc("join_household", {
    invite_code: invite.invite_code,
  });
  if (!reusedCodeError) throw new Error("Consumed invite was reused");

  console.log("Household invitation and RLS smoke test passed");
} finally {
  if (householdId) {
    await admin.from("households").delete().eq("id", householdId);
  }
  for (const userId of users) {
    await admin.auth.admin.deleteUser(userId);
  }
}
