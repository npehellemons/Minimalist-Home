import type { Session, User } from "@supabase/supabase-js";
import { get, writable } from "svelte/store";

import {
  activeProfileId,
  appSettings,
  type AppLanguage,
  type AppSettings,
  type ColorModePreference,
} from "#lib/app-settings.js";
import { isSupabaseConfigured, supabase } from "#lib/supabase/client.js";
import type { Tables } from "#lib/supabase/database.types.js";

type Household = Tables<"households">;
type Membership = Tables<"household_members">;

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

const initialState: HouseholdSessionState = {
  status: isSupabaseConfigured ? "loading" : "unconfigured",
  user: null,
  household: null,
  membership: null,
  error: null,
};

export const householdSession = writable<HouseholdSessionState>(initialState);

let loadId = 0;

function supportedLanguage(value: string): AppLanguage {
  return value === "en" ? "en" : "nl";
}

function supportedColorMode(value: string): ColorModePreference {
  return value === "light" || value === "dark" ? value : "auto";
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
  const calendars = calendarsResult.data ?? [];
  const nextSettings: AppSettings = {
    profiles: profiles.map((profile) => ({
      id: profile.id,
      name: profile.name,
      avatar: profile.avatar,
      color: profile.color,
      family: profile.is_family,
      calendars: calendars
        .filter((calendar) => calendar.profile_id === profile.id)
        .map((calendar) => ({
          id: calendar.id,
          name: calendar.name,
          url: calendar.feed_url,
          enabled: calendar.enabled,
        })),
    })),
    location: {
      name: household.location_name,
      latitude: household.latitude,
      longitude: household.longitude,
      timezone: household.timezone,
    },
    language: supportedLanguage(household.language),
    colorMode: supportedColorMode(household.color_mode),
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
    options: { emailRedirectTo: window.location.origin },
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
    household_color_mode: settings.colorMode,
    household_location: settings.location.name,
    household_latitude: settings.location.latitude,
    household_longitude: settings.location.longitude,
    household_timezone: settings.location.timezone,
    household_profiles: profiles,
  });

  if (error) throw error;
  await refreshHouseholdSession();
}

export function currentLocalSettings() {
  return structuredClone(get(appSettings));
}
