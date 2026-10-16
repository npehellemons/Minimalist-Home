import type { Session, User } from "@supabase/supabase-js";
import { get, writable } from "svelte/store";

import {
  activeProfileId,
  appSettings,
  type AppLanguage,
  type AppSettings,
  type CalendarFeed,
  type DashboardLocation,
  type HouseholdProfile,
} from "#lib/app-settings.js";
import { isSupabaseConfigured, supabase } from "#lib/supabase/client.js";
import type { Tables } from "#lib/supabase/database.types.js";

type Household = Tables<"households">;
type Membership = Tables<"household_members">;
type CalendarSource = Tables<"calendar_sources">;
type Profile = Tables<"profiles">;

export type HouseholdSessionStatus =
  | "loading"
  | "unconfigured"
  | "signed-out"
  | "needs-household"
  | "ready"
  | "error";

export type HouseholdSessionState = {
  status: HouseholdSessionStatus;
  user: User | null;
  household: Household | null;
  membership: Membership | null;
  error: string | null;
};

export type HouseholdInvite = {
  code: string;
  expiresAt: string;
};

const initialState: HouseholdSessionState = {
  status: isSupabaseConfigured ? "loading" : "unconfigured",
  user: null,
  household: null,
  membership: null,
  error: null,
};

export const householdSession = writable<HouseholdSessionState>(initialState);

let loadId = 0;
const calendarRecoveryRequests = new Map<
  string,
  Promise<CalendarSource[]>
>();

function calendarFeed(source: CalendarSource): CalendarFeed {
  return {
    id: source.id,
    name: source.name,
    url: source.feed_url,
    enabled: source.enabled,
  };
}

function householdProfile(profile: Profile, calendars: CalendarSource[]): HouseholdProfile {
  return {
    id: profile.id,
    name: profile.name,
    avatar: profile.avatar,
    color: profile.color,
    family: profile.is_family,
    calendars: calendars
      .filter((calendar) => calendar.profile_id === profile.id)
      .map(calendarFeed),
  };
}

function readyHousehold(): HouseholdSessionState & {
  household: Household;
  membership: Membership;
} {
  const state = get(householdSession);

  if (state.status !== "ready" || !state.household || !state.membership) {
    throw new Error("Household is not ready");
  }

  return state as HouseholdSessionState & {
    household: Household;
    membership: Membership;
  };
}

async function recoverLocalCalendars(
  householdId: string,
  profiles: Profile[],
  remoteCalendars: CalendarSource[],
) {
  const existingRequest = calendarRecoveryRequests.get(householdId);
  if (existingRequest) return existingRequest;

  const localSettings = get(appSettings);
  const profileIds = new Set(profiles.map((profile) => profile.id));
  const remoteFeeds = new Set(
    remoteCalendars.map(
      (calendar) => `${calendar.profile_id}\u0000${calendar.feed_url}`,
    ),
  );
  const pendingCalendars = localSettings.profiles.flatMap((profile) =>
    profileIds.has(profile.id)
      ? profile.calendars
          .filter(
            (calendar) =>
              calendar.id.startsWith("calendar-") &&
              !remoteFeeds.has(`${profile.id}\u0000${calendar.url}`),
          )
          .map((calendar) => ({
            household_id: householdId,
            profile_id: profile.id,
            name: calendar.name,
            feed_url: calendar.url,
            enabled: calendar.enabled,
          }))
      : [],
  );

  const request = (async () => {
    if (!supabase || pendingCalendars.length === 0) return remoteCalendars;

    const { data, error } = await supabase
      .from("calendar_sources")
      .insert(pendingCalendars)
      .select("*");

    if (error) throw error;
    return [...remoteCalendars, ...(data ?? [])];
  })();

  calendarRecoveryRequests.set(householdId, request);
  return request;
}

function supportedLanguage(value: string): AppLanguage {
  return value === "en" ? "en" : "nl";
}

async function loadHousehold(session: Session | null) {
  const currentLoadId = ++loadId;

  if (!supabase) {
    householdSession.set({ ...initialState, status: "unconfigured" });
    return;
  }

  if (!session) {
    householdSession.set({
      status: "signed-out",
      user: null,
      household: null,
      membership: null,
      error: null,
    });
    return;
  }

  householdSession.set({
    status: "loading",
    user: session.user,
    household: null,
    membership: null,
    error: null,
  });

  const { data: membership, error: membershipError } = await supabase
    .from("household_members")
    .select("*")
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (currentLoadId !== loadId) return;

  if (membershipError) {
    householdSession.set({
      status: "error",
      user: session.user,
      household: null,
      membership: null,
      error: membershipError.message,
    });
    return;
  }

  if (!membership) {
    householdSession.set({
      status: "needs-household",
      user: session.user,
      household: null,
      membership: null,
      error: null,
    });
    return;
  }

  const [householdResult, profilesResult, calendarsResult] = await Promise.all([
    supabase
      .from("households")
      .select("*")
      .eq("id", membership.household_id)
      .single(),
    supabase
      .from("profiles")
      .select("*")
      .eq("household_id", membership.household_id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("calendar_sources")
      .select("*")
      .eq("household_id", membership.household_id)
      .order("created_at", { ascending: true }),
  ]);

  if (currentLoadId !== loadId) return;

  const firstError =
    householdResult.error ?? profilesResult.error ?? calendarsResult.error;

  if (firstError || !householdResult.data) {
    householdSession.set({
      status: "error",
      user: session.user,
      household: null,
      membership,
      error: firstError?.message ?? "Household data is unavailable",
    });
    return;
  }

  const household = householdResult.data;
  const profiles = profilesResult.data ?? [];
  let calendars = calendarsResult.data ?? [];

  if (membership.role === "owner" || membership.role === "admin") {
    try {
      calendars = await recoverLocalCalendars(
        household.id,
        profiles,
        calendars,
      );
    } catch (error) {
      console.warn("Unable to recover locally stored calendars", error);
    }
  }

  if (currentLoadId !== loadId) return;

  const deviceColorMode = get(appSettings).colorMode;
  const nextSettings: AppSettings = {
    profiles: profiles.map((profile) => householdProfile(profile, calendars)),
    location: {
      name: household.location_name,
      latitude: household.latitude,
      longitude: household.longitude,
      timezone: household.timezone,
    },
    language: supportedLanguage(household.language),
    colorMode: deviceColorMode,
  };

  appSettings.set(nextSettings);
  const selectedProfile =
    nextSettings.profiles.find((profile) => profile.family) ??
    nextSettings.profiles[0];
  if (selectedProfile) activeProfileId.set(selectedProfile.id);

  householdSession.set({
    status: "ready",
    user: session.user,
    household,
    membership,
    error: null,
  });
}

export async function refreshHouseholdSession() {
  if (!supabase) {
    await loadHousehold(null);
    return;
  }

  const { data, error } = await supabase.auth.getSession();

  if (error) {
    householdSession.set({
      status: "error",
      user: null,
      household: null,
      membership: null,
      error: error.message,
    });
    return;
  }

  await loadHousehold(data.session);
}

export function startHouseholdSession() {
  if (!supabase) {
    householdSession.set({ ...initialState, status: "unconfigured" });
    return () => {};
  }

  let stopped = false;

  void refreshHouseholdSession();
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    window.setTimeout(() => {
      if (!stopped) void loadHousehold(session);
    }, 0);
  });

  return () => {
    stopped = true;
    data.subscription.unsubscribe();
  };
}

export async function signIn(email: string, password: string) {
  if (!supabase) throw new Error("Supabase is not configured");
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signUp(email: string, password: string) {
  if (!supabase) throw new Error("Supabase is not configured");
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: window.location.href },
  });
  if (error) throw error;
  return { needsConfirmation: !data.session };
}

export async function signOut() {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export type HouseholdOnboardingInput = {
  name: string;
  settings: AppSettings;
};

export async function completeHouseholdOnboarding({
  name,
  settings,
}: HouseholdOnboardingInput) {
  if (!supabase) throw new Error("Supabase is not configured");

  const profiles = settings.profiles.map((profile, index) => ({
    name: profile.name,
    avatar: profile.avatar,
    color: profile.color,
    family: profile.family,
    sortOrder: index,
    calendars: profile.calendars,
  }));
  const { error } = await supabase.rpc("complete_household_onboarding", {
    household_name: name,
    household_language: settings.language,
    household_color_mode: "auto",
    household_location: settings.location.name,
    household_latitude: settings.location.latitude,
    household_longitude: settings.location.longitude,
    household_timezone: settings.location.timezone,
    household_profiles: profiles,
  });

  if (error) throw error;
  await refreshHouseholdSession();
}

export async function createHouseholdInvite(profileId: string | null) {
  if (!supabase) throw new Error("Supabase is not configured");
  const { data, error } = await supabase.rpc("create_household_invite", {
    invited_profile_id: profileId,
  });

  if (error) throw error;
  const invitation = data?.[0];
  if (!invitation) throw new Error("Invite could not be created");

  return {
    code: invitation.invite_code,
    expiresAt: invitation.expires_at,
  } satisfies HouseholdInvite;
}

export async function joinHousehold(inviteCode: string) {
  if (!supabase) throw new Error("Supabase is not configured");
  const { error } = await supabase.rpc("join_household", {
    invite_code: inviteCode,
  });

  if (error) throw error;
  await refreshHouseholdSession();
}

export async function getHouseholdMembers() {
  if (!supabase) throw new Error("Supabase is not configured");
  const { household } = readyHousehold();
  const { data, error } = await supabase
    .from("household_members")
    .select("*")
    .eq("household_id", household.id)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data;
}

export function currentLocalSettings() {
  return structuredClone(get(appSettings));
}

export async function createCalendarSource(
  profileId: string,
  input: Pick<CalendarFeed, "name" | "url" | "enabled">,
) {
  if (!supabase) throw new Error("Supabase is not configured");
  const { household } = readyHousehold();
  const { data, error } = await supabase
    .from("calendar_sources")
    .insert({
      household_id: household.id,
      profile_id: profileId,
      name: input.name,
      feed_url: input.url,
      enabled: input.enabled,
    })
    .select("*")
    .single();

  if (error) throw error;
  const calendar = calendarFeed(data);
  appSettings.update((settings) => ({
    ...settings,
    profiles: settings.profiles.map((profile) =>
      profile.id === profileId
        ? { ...profile, calendars: [...profile.calendars, calendar] }
        : profile,
    ),
  }));
  return calendar;
}

export async function updateCalendarSource(
  profileId: string,
  calendarId: string,
  patch: Partial<Pick<CalendarFeed, "name" | "url" | "enabled">>,
) {
  if (!supabase) throw new Error("Supabase is not configured");
  const { household } = readyHousehold();
  const databasePatch = {
    ...(patch.name === undefined ? {} : { name: patch.name }),
    ...(patch.url === undefined ? {} : { feed_url: patch.url }),
    ...(patch.enabled === undefined ? {} : { enabled: patch.enabled }),
  };
  const { data, error } = await supabase
    .from("calendar_sources")
    .update(databasePatch)
    .eq("id", calendarId)
    .eq("household_id", household.id)
    .select("*")
    .single();

  if (error) throw error;
  const calendar = calendarFeed(data);
  appSettings.update((settings) => ({
    ...settings,
    profiles: settings.profiles.map((profile) =>
      profile.id === profileId
        ? {
            ...profile,
            calendars: profile.calendars.map((item) =>
              item.id === calendarId ? calendar : item,
            ),
          }
        : profile,
    ),
  }));
}

export async function deleteCalendarSource(
  profileId: string,
  calendarId: string,
) {
  if (!supabase) throw new Error("Supabase is not configured");
  const { household } = readyHousehold();
  const { error } = await supabase
    .from("calendar_sources")
    .delete()
    .eq("id", calendarId)
    .eq("household_id", household.id);

  if (error) throw error;
  appSettings.update((settings) => ({
    ...settings,
    profiles: settings.profiles.map((profile) =>
      profile.id === profileId
        ? {
            ...profile,
            calendars: profile.calendars.filter(
              (calendar) => calendar.id !== calendarId,
            ),
          }
        : profile,
    ),
  }));
}

export async function createProfile(
  input: Pick<HouseholdProfile, "name" | "avatar" | "color">,
) {
  if (!supabase) throw new Error("Supabase is not configured");
  const { household } = readyHousehold();
  const sortOrder = get(appSettings).profiles.length;
  const { data, error } = await supabase
    .from("profiles")
    .insert({
      household_id: household.id,
      name: input.name,
      avatar: input.avatar,
      color: input.color,
      is_family: false,
      sort_order: sortOrder,
    })
    .select("*")
    .single();

  if (error) throw error;
  const profile = householdProfile(data, []);
  appSettings.update((settings) => ({
    ...settings,
    profiles: [...settings.profiles, profile],
  }));
  return profile;
}

export async function updateProfile(
  profileId: string,
  patch: Partial<Pick<HouseholdProfile, "name" | "avatar" | "color">>,
) {
  if (!supabase) throw new Error("Supabase is not configured");
  const { household } = readyHousehold();
  const { data, error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", profileId)
    .eq("household_id", household.id)
    .select("*")
    .single();

  if (error) throw error;
  appSettings.update((settings) => ({
    ...settings,
    profiles: settings.profiles.map((profile) =>
      profile.id === profileId
        ? {
            ...profile,
            name: data.name,
            avatar: data.avatar,
            color: data.color,
          }
        : profile,
    ),
  }));
}

export async function deleteProfile(profileId: string) {
  if (!supabase) throw new Error("Supabase is not configured");
  const { household } = readyHousehold();
  const { error } = await supabase
    .from("profiles")
    .delete()
    .eq("id", profileId)
    .eq("household_id", household.id)
    .eq("is_family", false);

  if (error) throw error;
  appSettings.update((settings) => ({
    ...settings,
    profiles: settings.profiles.filter((profile) => profile.id !== profileId),
  }));
}

export async function updateHouseholdSettings(
  patch: Partial<{
    language: AppLanguage;
    location: DashboardLocation;
  }>,
) {
  if (!supabase) throw new Error("Supabase is not configured");
  const { household } = readyHousehold();
  const databasePatch = {
    ...(patch.language === undefined ? {} : { language: patch.language }),
    ...(patch.location === undefined
      ? {}
      : {
          location_name: patch.location.name,
          latitude: patch.location.latitude,
          longitude: patch.location.longitude,
          timezone: patch.location.timezone,
        }),
  };
  const { error } = await supabase
    .from("households")
    .update(databasePatch)
    .eq("id", household.id);

  if (error) throw error;
  appSettings.update((settings) => ({
    ...settings,
    ...(patch.language === undefined ? {} : { language: patch.language }),
    ...(patch.location === undefined ? {} : { location: patch.location }),
  }));
}
