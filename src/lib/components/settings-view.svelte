<script lang="ts">
  import {
    CalendarDays,
    Languages,
    LoaderCircle,
    MapPin,
    Palette,
    Plus,
    Trash2,
    Users,
  } from "@lucide/svelte";
  import { onMount } from "svelte";
  import {
    appSettings,
    type AppLanguage,
    type CalendarFeed,
    type ColorModePreference,
    type HouseholdProfile,
  } from "#lib/app-settings.js";
  import {
    createCalendarSource,
    createProfile as createHouseholdProfile,
    deleteCalendarSource,
    deleteProfile as deleteHouseholdProfile,
    updateCalendarSource,
    updateHouseholdSettings,
    updateProfile as updateHouseholdProfile,
  } from "#lib/household-session.js";
  import { translations } from "#lib/i18n.js";
  import * as Avatar from "#lib/components/ui/avatar/index.js";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as Card from "#lib/components/ui/card/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { Label } from "#lib/components/ui/label/index.js";
  import * as ScrollArea from "#lib/components/ui/scroll-area/index.js";
  import { Switch } from "#lib/components/ui/switch/index.js";

  let calendarNames = $state<Record<string, string>>({});
  let calendarUrls = $state<Record<string, string>>({});
  let profileName = $state("");
  let profileAvatar = $state("");
  let profileColor = $state("#2563eb");
  let locationQuery = $state("");
  let locationStatus = $state<"idle" | "loading" | "saved" | "error">("idle");
  let syncStatus = $state<"idle" | "saving" | "saved" | "error">("idle");
  let text = $derived(translations[$appSettings.language]);

  async function persist(action: () => Promise<unknown>) {
    syncStatus = "saving";

    try {
      await action();
      syncStatus = "saved";
      return true;
    } catch (error) {
      console.error("Unable to save household settings", error);
      syncStatus = "error";
      return false;
    }
  }

  async function updateCalendar(
    profileId: string,
    calendarId: string,
    patch: Partial<CalendarFeed>,
  ) {
    await persist(() => updateCalendarSource(profileId, calendarId, patch));
  }

  async function addCalendar(event: SubmitEvent, profileId: string) {
    event.preventDefault();

    const name = (calendarNames[profileId] ?? "").trim();
    const url = (calendarUrls[profileId] ?? "").trim();
    if (!name || !url) return;

    const saved = await persist(() =>
      createCalendarSource(profileId, { name, url, enabled: true }),
    );
    if (!saved) return;

    calendarNames[profileId] = "";
    calendarUrls[profileId] = "";
  }

  async function removeCalendar(profileId: string, calendarId: string) {
    await persist(() => deleteCalendarSource(profileId, calendarId));
  }

  async function updateProfile(id: string, patch: Partial<HouseholdProfile>) {
    await persist(() => updateHouseholdProfile(id, patch));
  }

  async function addProfile(event: SubmitEvent) {
    event.preventDefault();

    const name = profileName.trim();
    if (!name) return;

    const saved = await persist(() =>
      createHouseholdProfile({
        name,
        avatar: profileAvatar.trim() || name.slice(0, 1).toUpperCase(),
        color: profileColor,
      }),
    );
    if (!saved) return;

    profileName = "";
    profileAvatar = "";
    profileColor = "#2563eb";
  }

  async function removeProfile(id: string) {
    await persist(() => deleteHouseholdProfile(id));
  }

  async function setLanguage(language: AppLanguage) {
    await persist(() => updateHouseholdSettings({ language }));
  }

  async function setColorMode(colorMode: ColorModePreference) {
    await persist(() => updateHouseholdSettings({ colorMode }));
  }

  async function saveLocation(event: SubmitEvent) {
    event.preventDefault();
    const query = locationQuery.trim();
    if (!query) return;

    locationStatus = "loading";

    try {
      const response = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=${$appSettings.language}&format=json`,
      );

      if (!response.ok) throw new Error("Geocoding request failed");

      const data = (await response.json()) as {
        results?: Array<{
          name: string;
          latitude: number;
          longitude: number;
          timezone?: string;
        }>;
      };
      const result = data.results?.[0];

      if (!result) {
        locationStatus = "error";
        return;
      }

      const location = {
          name: result.name,
          latitude: result.latitude,
          longitude: result.longitude,
          timezone: result.timezone ?? "Europe/Amsterdam",
      };
      const saved = await persist(() => updateHouseholdSettings({ location }));
      if (!saved) throw new Error("Unable to save location");
      locationQuery = result.name;
      locationStatus = "saved";
    } catch {
      locationStatus = "error";
    }
  }

  onMount(() => {
    locationQuery = $appSettings.location.name;
  });
</script>

<ScrollArea.Root class="h-full bg-muted/30">
  <div class="mx-auto grid gap-4 p-6">
    <div class="flex items-center justify-between gap-3">
      <h2 class="text-2xl font-semibold">{text.settings.title}</h2>
      {#if syncStatus !== "idle"}
        <Badge variant={syncStatus === "error" ? "destructive" : "secondary"}>
          {text.settings[syncStatus]}
        </Badge>
      {/if}
    </div>

    <Card.Root size="sm">
      <Card.Header class="border-b">
        <div class="flex items-center gap-2">
          <Users class="size-5" aria-hidden="true" />
          <Card.Title>{text.settings.profiles}</Card.Title>
        </div>
        <Card.Description>{text.settings.profilesDescription}</Card.Description>
      </Card.Header>
      <Card.Content class="gap-4">
        {#each $appSettings.profiles as profile (profile.id)}
          <section class="grid gap-4 border-b pb-5 last:border-b-0">
            <div
              class="grid grid-cols-[auto_1fr_7rem_auto_auto] items-end gap-3"
            >
              <Avatar.Root size="lg">
                <Avatar.Fallback
                  style={`background-color: ${profile.color}; color: white`}
                >
                  {profile.avatar}
                </Avatar.Fallback>
              </Avatar.Root>
              <div class="grid gap-2">
                <Label for={`${profile.id}-name`}
                  >{text.settings.profileName}</Label
                >
                <Input
                  id={`${profile.id}-name`}
                  value={profile.name}
                  onchange={(event) =>
                    updateProfile(profile.id, {
                      name: event.currentTarget.value,
                    })}
                />
              </div>
              <div class="grid gap-2">
                <Label for={`${profile.id}-avatar`}
                  >{text.settings.profileAvatar}</Label
                >
                <Input
                  id={`${profile.id}-avatar`}
                  maxlength={2}
                  value={profile.avatar}
                  onchange={(event) =>
                    updateProfile(profile.id, {
                      avatar: event.currentTarget.value,
                    })}
                />
              </div>
              <div class="grid gap-2">
                <Label for={`${profile.id}-color`}
                  >{text.settings.profileColor}</Label
                >
                <input
                  id={`${profile.id}-color`}
                  class="h-9 w-12 cursor-pointer rounded-md border bg-background p-1"
                  type="color"
                  value={profile.color}
                  onchange={(event) =>
                    updateProfile(profile.id, {
                      color: event.currentTarget.value,
                    })}
                />
              </div>
              {#if profile.family}
                <Badge variant="secondary">{text.settings.family}</Badge>
              {:else}
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={text.settings.removeProfile}
                  onclick={() => removeProfile(profile.id)}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              {/if}
            </div>

            <div class="ml-14 grid gap-3 rounded-md border bg-muted/30 p-3">
              <div class="flex items-center gap-2">
                <CalendarDays class="size-4" aria-hidden="true" />
                <h3 class="text-sm font-medium">{text.settings.calendars}</h3>
                <Badge variant="outline">{profile.calendars.length}</Badge>
                <p class="ml-auto text-xs text-muted-foreground">
                  {text.settings.calendarsDescription}
                </p>
              </div>

              {#each profile.calendars as calendar (calendar.id)}
                <div class="grid grid-cols-[1fr_2fr_auto_auto] items-end gap-3">
                  <div class="grid gap-2">
                    <Label for={`${profile.id}-${calendar.id}-name`}>
                      {text.settings.calendarName}
                    </Label>
                    <Input
                      id={`${profile.id}-${calendar.id}-name`}
                      value={calendar.name}
                      onchange={(event) =>
                        updateCalendar(profile.id, calendar.id, {
                          name: event.currentTarget.value,
                        })}
                    />
                  </div>
                  <div class="grid min-w-0 gap-2">
                    <Label for={`${profile.id}-${calendar.id}-url`}>
                      {text.settings.calendarUrl}
                    </Label>
                    <Input
                      id={`${profile.id}-${calendar.id}-url`}
                      value={calendar.url}
                      onchange={(event) =>
                        updateCalendar(profile.id, calendar.id, {
                          url: event.currentTarget.value,
                        })}
                    />
                  </div>
                  <div class="grid justify-items-center gap-2">
                    <Label for={`${profile.id}-${calendar.id}-enabled`}>
                      {text.settings.enabled}
                    </Label>
                    <Switch
                      id={`${profile.id}-${calendar.id}-enabled`}
                      checked={calendar.enabled}
                      onCheckedChange={(enabled) =>
                        updateCalendar(profile.id, calendar.id, { enabled })}
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={text.settings.removeCalendar}
                    onclick={() => removeCalendar(profile.id, calendar.id)}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
              {/each}

              <form
                class="grid grid-cols-[1fr_2fr_auto] items-end gap-3"
                onsubmit={(event) => addCalendar(event, profile.id)}
              >
                <div class="grid gap-2">
                  <Label for={`${profile.id}-new-calendar-name`}>
                    {text.settings.calendarName}
                  </Label>
                  <Input
                    id={`${profile.id}-new-calendar-name`}
                    value={calendarNames[profile.id] ?? ""}
                    oninput={(event) =>
                      (calendarNames[profile.id] = event.currentTarget.value)}
                    required
                  />
                </div>
                <div class="grid gap-2">
                  <Label for={`${profile.id}-new-calendar-url`}>
                    {text.settings.calendarUrl}
                  </Label>
                  <Input
                    id={`${profile.id}-new-calendar-url`}
                    placeholder="webcal://..."
                    value={calendarUrls[profile.id] ?? ""}
                    oninput={(event) =>
                      (calendarUrls[profile.id] = event.currentTarget.value)}
                    required
                  />
                </div>
                <Button type="submit">
                  <Plus aria-hidden="true" />
                  {text.settings.addCalendar}
                </Button>
              </form>
            </div>
          </section>
        {/each}

        <form
          class="grid grid-cols-[1fr_7rem_auto_auto] items-end gap-3"
          onsubmit={addProfile}
        >
          <div class="grid gap-2">
            <Label for="new-profile-name">{text.settings.profileName}</Label>
            <Input id="new-profile-name" bind:value={profileName} required />
          </div>
          <div class="grid gap-2">
            <Label for="new-profile-avatar">{text.settings.profileAvatar}</Label
            >
            <Input
              id="new-profile-avatar"
              maxlength={2}
              bind:value={profileAvatar}
            />
          </div>
          <div class="grid gap-2">
            <Label for="new-profile-color">{text.settings.profileColor}</Label>
            <input
              id="new-profile-color"
              class="h-9 w-12 cursor-pointer rounded-md border bg-background p-1"
              type="color"
              bind:value={profileColor}
            />
          </div>
          <Button type="submit">
            <Plus aria-hidden="true" />
            {text.settings.addProfile}
          </Button>
        </form>
      </Card.Content>
    </Card.Root>

    <div class="grid grid-cols-2 gap-4">
      <Card.Root size="sm">
        <Card.Header class="border-b">
          <div class="flex items-center gap-2">
            <MapPin class="size-5" aria-hidden="true" />
            <Card.Title>{text.settings.location}</Card.Title>
          </div>
          <Card.Description
            >{text.settings.locationDescription}</Card.Description
          >
        </Card.Header>
        <Card.Content>
          <form class="grid gap-3" onsubmit={saveLocation}>
            <div class="grid gap-2">
              <Label for="weather-location">{text.settings.locationName}</Label>
              <Input
                id="weather-location"
                bind:value={locationQuery}
                required
              />
            </div>
            <div class="flex items-center gap-3">
              <Button type="submit" disabled={locationStatus === "loading"}>
                {#if locationStatus === "loading"}
                  <LoaderCircle class="animate-spin" aria-hidden="true" />
                {/if}
                {text.settings.saveLocation}
              </Button>
              {#if locationStatus === "saved"}
                <span class="text-sm text-muted-foreground"
                  >{text.settings.locationSaved}</span
                >
              {:else if locationStatus === "error"}
                <span class="text-sm text-destructive"
                  >{text.settings.locationNotFound}</span
                >
              {/if}
            </div>
          </form>
        </Card.Content>
      </Card.Root>

      <div class="grid gap-4">
        <Card.Root size="sm">
          <Card.Header class="border-b">
            <div class="flex items-center gap-2">
              <Languages class="size-5" aria-hidden="true" />
              <Card.Title>{text.settings.language}</Card.Title>
            </div>
            <Card.Description
              >{text.settings.languageDescription}</Card.Description
            >
          </Card.Header>
          <Card.Content>
            <div
              class="flex rounded-lg bg-muted p-1"
              role="group"
              aria-label={text.settings.language}
            >
              <Button
                variant={$appSettings.language === "nl" ? "default" : "ghost"}
                class="flex-1"
                aria-pressed={$appSettings.language === "nl"}
                onclick={() => setLanguage("nl")}>{text.settings.dutch}</Button
              >
              <Button
                variant={$appSettings.language === "en" ? "default" : "ghost"}
                class="flex-1"
                aria-pressed={$appSettings.language === "en"}
                onclick={() => setLanguage("en")}
                >{text.settings.english}</Button
              >
            </div>
          </Card.Content>
        </Card.Root>

        <Card.Root size="sm">
          <Card.Header class="border-b">
            <div class="flex items-center gap-2">
              <Palette class="size-5" aria-hidden="true" />
              <Card.Title>{text.settings.appearance}</Card.Title>
            </div>
            <Card.Description
              >{text.settings.appearanceDescription}</Card.Description
            >
          </Card.Header>
          <Card.Content>
            <div
              class="flex rounded-lg bg-muted p-1"
              role="group"
              aria-label={text.settings.appearance}
            >
              {#each ["auto", "light", "dark"] as colorMode}
                <Button
                  variant={$appSettings.colorMode === colorMode
                    ? "default"
                    : "ghost"}
                  class="flex-1"
                  aria-pressed={$appSettings.colorMode === colorMode}
                  onclick={() => setColorMode(colorMode as ColorModePreference)}
                >
                  {text.settings[colorMode as ColorModePreference]}
                </Button>
              {/each}
            </div>
          </Card.Content>
        </Card.Root>
      </div>
    </div>
  </div>
</ScrollArea.Root>
