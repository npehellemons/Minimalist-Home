<script lang="ts">
  import {
    CalendarDays,
    Check,
    Copy,
    Languages,
    LoaderCircle,
    MapPin,
    Palette,
    Plus,
    Trash2,
    UserPlus,
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
    createHouseholdInvite,
    createProfile as createHouseholdProfile,
    deleteCalendarSource,
    deleteProfile as deleteHouseholdProfile,
    getHouseholdMembers,
    householdSession,
    updateCalendarSource,
    updateHouseholdSettings,
    updateProfile as updateHouseholdProfile,
  } from "#lib/household-session.js";
  import { appLocale, translations } from "#lib/i18n.js";
  import ProfileAvatar from "#lib/components/profile-avatar.svelte";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as Card from "#lib/components/ui/card/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { Label } from "#lib/components/ui/label/index.js";
  import * as ScrollArea from "#lib/components/ui/scroll-area/index.js";
  import { Separator } from "#lib/components/ui/separator/index.js";
  import { Switch } from "#lib/components/ui/switch/index.js";

  let calendarNames = $state<Record<string, string>>({});
  let calendarUrls = $state<Record<string, string>>({});
  let profileName = $state("");
  let profileColor = $state("#2563eb");
  let locationQuery = $state("");
  let locationStatus = $state<"idle" | "loading" | "saved" | "error">("idle");
  let syncStatus = $state<"idle" | "saving" | "saved" | "error">("idle");
  let members = $state<Awaited<ReturnType<typeof getHouseholdMembers>>>([]);
  let inviteProfileId = $state<string | null>(null);
  let inviteUrl = $state("");
  let inviteExpiresAt = $state("");
  let inviteStatus = $state<"idle" | "loading" | "error">("idle");
  let inviteCopied = $state(false);
  let text = $derived(translations[$appSettings.language]);
  let canManageHousehold = $derived(
    $householdSession.membership?.role === "owner" ||
      $householdSession.membership?.role === "admin",
  );
  let personalProfiles = $derived(
    $appSettings.profiles.filter((profile) => !profile.family),
  );

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
        avatar: name.slice(0, 1).toUpperCase(),
        color: profileColor,
      }),
    );
    if (!saved) return;

    profileName = "";
    profileColor = "#2563eb";
  }

  async function removeProfile(id: string) {
    await persist(() => deleteHouseholdProfile(id));
  }

  async function setLanguage(language: AppLanguage) {
    await persist(() => updateHouseholdSettings({ language }));
  }

  async function setColorMode(colorMode: ColorModePreference) {
    appSettings.update((settings) => ({ ...settings, colorMode }));
  }

  async function loadMembers() {
    try {
      members = await getHouseholdMembers();
    } catch (error) {
      console.error("Unable to load household members", error);
    }
  }

  async function makeInvite() {
    inviteStatus = "loading";
    inviteCopied = false;

    try {
      const invitation = await createHouseholdInvite(inviteProfileId);
      const url = new URL(window.location.origin);
      url.searchParams.set("invite", invitation.code);
      inviteUrl = url.toString();
      inviteExpiresAt = invitation.expiresAt;
      inviteStatus = "idle";
    } catch (error) {
      console.error("Unable to create household invitation", error);
      inviteStatus = "error";
    }
  }

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      inviteCopied = true;
    } catch (error) {
      console.error("Unable to copy household invitation", error);
    }
  }

  function memberProfile(profileId: string | null) {
    return $appSettings.profiles.find((profile) => profile.id === profileId);
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
    void loadMembers();
  });
</script>

<ScrollArea.Root class="h-full bg-muted/30">
  <div class="mx-auto grid gap-4 p-3 sm:p-6">
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
          <UserPlus class="size-5" aria-hidden="true" />
          <Card.Title>{text.settings.householdAccess}</Card.Title>
          <Badge variant="outline">{members.length} {text.settings.memberCount}</Badge>
        </div>
        <Card.Description>{text.settings.householdAccessDescription}</Card.Description>
      </Card.Header>
      <Card.Content class="gap-4">
        <div class="grid gap-1">
          {#each members as member (member.user_id)}
            {@const profile = memberProfile(member.profile_id)}
            <div class="flex min-h-12 items-center gap-3 border-b py-2 last:border-b-0">
              {#if profile}
                <ProfileAvatar name={profile.name} color={profile.color} />
              {:else}
                <Button variant="secondary" size="icon" disabled>
                  <Users aria-hidden="true" />
                </Button>
              {/if}
              <div class="min-w-0 flex-1">
                <p class="truncate font-medium">
                  {profile?.name ?? text.settings.unassigned}
                </p>
                {#if member.user_id === $householdSession.user?.id}
                  <p class="text-xs text-muted-foreground">{text.settings.you}</p>
                {/if}
              </div>
              <Badge variant="secondary">
                {text.settings[member.role as "owner" | "admin" | "member"]}
              </Badge>
            </div>
          {/each}
        </div>

        {#if canManageHousehold}
          <Separator />
          <div class="grid gap-3">
            <Label>{text.settings.inviteProfile}</Label>
            <div class="flex flex-wrap gap-2" role="group" aria-label={text.settings.inviteProfile}>
              <Button
                variant={inviteProfileId === null ? "default" : "outline"}
                size="sm"
                aria-pressed={inviteProfileId === null}
                onclick={() => (inviteProfileId = null)}
              >
                {text.settings.unassigned}
              </Button>
              {#each personalProfiles as profile (profile.id)}
                <Button
                  variant={inviteProfileId === profile.id ? "default" : "outline"}
                  size="sm"
                  aria-pressed={inviteProfileId === profile.id}
                  onclick={() => (inviteProfileId = profile.id)}
                >
                  <ProfileAvatar name={profile.name} color={profile.color} size="sm" />
                  {profile.name}
                </Button>
              {/each}
            </div>
            <Button
              class="w-full sm:w-fit"
              disabled={inviteStatus === "loading"}
              onclick={makeInvite}
            >
              {#if inviteStatus === "loading"}
                <LoaderCircle class="animate-spin" aria-hidden="true" />
                {text.settings.creatingInvite}
              {:else}
                <UserPlus aria-hidden="true" />
                {text.settings.createInvite}
              {/if}
            </Button>

            {#if inviteStatus === "error"}
              <p class="text-sm text-destructive">{text.settings.error}</p>
            {:else if inviteUrl}
              <div class="grid gap-2 rounded-md border bg-muted/30 p-3">
                <div class="flex items-center justify-between gap-3">
                  <p class="text-sm font-medium">{text.settings.inviteReady}</p>
                  <span class="text-xs text-muted-foreground">
                    {text.settings.inviteExpires}
                    {new Intl.DateTimeFormat(appLocale($appSettings.language), {
                      dateStyle: "medium",
                    }).format(new Date(inviteExpiresAt))}
                  </span>
                </div>
                <div class="flex min-w-0 gap-2">
                  <Input class="min-w-0 font-mono text-xs" value={inviteUrl} readonly />
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label={inviteCopied ? text.settings.copied : text.settings.copyInvite}
                    onclick={copyInvite}
                  >
                    {#if inviteCopied}
                      <Check aria-hidden="true" />
                    {:else}
                      <Copy aria-hidden="true" />
                    {/if}
                  </Button>
                </div>
              </div>
            {/if}
          </div>
        {/if}
      </Card.Content>
    </Card.Root>

    {#if canManageHousehold}
      <Card.Root size="sm">
      <Card.Header class="border-b">
        <div class="flex items-center gap-2">
          <Users class="size-5" aria-hidden="true" />
          <Card.Title>{text.settings.profiles}</Card.Title>
        </div>
        <Card.Description>{text.settings.profilesDescription}</Card.Description>
      </Card.Header>
      <Card.Content class="gap-0 px-0">
        {#each $appSettings.profiles as profile, index (profile.id)}
          {#if index > 0}
            <Separator />
          {/if}
          <section class="grid gap-5 px-4 py-5 sm:px-6">
            <div class="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto] sm:items-end">
              <ProfileAvatar
                name={profile.name}
                color={profile.color}
                size="lg"
                class="col-start-1 row-start-1 self-center"
              />
              <p class="col-start-2 row-start-1 truncate font-medium sm:hidden">{profile.name}</p>
              <div class="col-span-3 row-start-2 grid min-w-0 gap-2 sm:col-span-1 sm:col-start-2 sm:row-start-1">
                <Label for={`${profile.id}-name`}>{text.settings.profileName}</Label>
                <Input
                  id={`${profile.id}-name`}
                  value={profile.name}
                  onchange={(event) =>
                    updateProfile(profile.id, {
                      name: event.currentTarget.value,
                    })}
                />
              </div>
              <div class="col-span-3 row-start-3 grid gap-2 sm:col-span-1 sm:col-start-3 sm:row-start-1">
                <Label for={`${profile.id}-color`}>{text.settings.profileColor}</Label>
                <input
                  id={`${profile.id}-color`}
                  class="h-9 w-full min-w-16 cursor-pointer rounded-md border bg-background p-1 sm:w-16"
                  type="color"
                  value={profile.color}
                  onchange={(event) =>
                    updateProfile(profile.id, {
                      color: event.currentTarget.value,
                    })}
                />
              </div>
              {#if profile.family}
                <Badge variant="secondary" class="col-start-3 row-start-1 h-9 self-center px-3 sm:col-start-4 sm:self-end">
                  {profile.name}
                </Badge>
              {:else}
                <Button
                  variant="ghost"
                  size="icon"
                  class="col-start-3 row-start-1 self-center sm:col-start-4 sm:self-end"
                  aria-label={text.settings.removeProfile}
                  onclick={() => removeProfile(profile.id)}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              {/if}
            </div>

            <div class="grid gap-4 sm:pl-16">
              <div class="flex flex-wrap items-center gap-2">
                <CalendarDays class="size-4" aria-hidden="true" />
                <h3 class="text-sm font-medium">{text.settings.calendars}</h3>
                <Badge variant="outline">{profile.calendars.length}</Badge>
                <p
                  class="w-full text-xs text-muted-foreground sm:ml-auto sm:w-auto"
                >
                  {text.settings.calendarsDescription}
                </p>
              </div>

              {#each profile.calendars as calendar (calendar.id)}
                <div class="grid items-end gap-3 rounded-md bg-muted/40 p-3 sm:grid-cols-[1fr_2fr_auto_auto]">
                  <div class="col-span-2 grid gap-2 sm:col-span-1">
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
                  <div class="col-span-2 grid min-w-0 gap-2 sm:col-span-1">
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
                  <div class="col-span-2 flex items-center justify-end gap-2 sm:contents">
                    <div class="flex size-9 items-center justify-center">
                      <Label class="sr-only" for={`${profile.id}-${calendar.id}-enabled`}>
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
                </div>
              {/each}

              <form
                class="grid gap-3 sm:grid-cols-[1fr_2fr_auto] sm:items-end"
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
                <Button type="submit" class="w-full sm:w-auto">
                  <Plus aria-hidden="true" />
                  {text.settings.addCalendar}
                </Button>
              </form>
            </div>
          </section>
        {/each}

      </Card.Content>
      <Card.Footer class="border-t bg-muted/20">
        <form
          class="grid w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto] sm:items-end"
          onsubmit={addProfile}
        >
          <ProfileAvatar
            name={profileName || text.settings.addProfile}
            color={profileColor}
            size="lg"
            class="col-start-1 row-start-1 self-center"
          />
          <p class="col-start-2 row-start-1 font-medium sm:hidden">{text.settings.addProfile}</p>
          <div class="col-span-2 row-start-2 grid gap-2 sm:col-span-1 sm:col-start-2 sm:row-start-1">
            <Label for="new-profile-name">{text.settings.profileName}</Label>
            <Input id="new-profile-name" bind:value={profileName} required />
          </div>
          <div class="col-span-2 row-start-3 grid gap-2 sm:col-span-1 sm:col-start-3 sm:row-start-1">
            <Label for="new-profile-color">{text.settings.profileColor}</Label>
            <input
              id="new-profile-color"
              class="h-9 w-full min-w-16 cursor-pointer rounded-md border bg-background p-1 sm:w-16"
              type="color"
              bind:value={profileColor}
            />
          </div>
          <Button type="submit" class="col-span-2 row-start-4 w-full sm:col-span-1 sm:col-start-4 sm:row-start-1 sm:w-auto">
            <Plus aria-hidden="true" />
            {text.settings.addProfile}
          </Button>
        </form>
      </Card.Footer>
      </Card.Root>
    {/if}

    <div class={canManageHousehold ? "grid gap-4 lg:grid-cols-2" : "grid gap-4"}>
      {#if canManageHousehold}
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
      {/if}

      <div class="grid gap-4">
        {#if canManageHousehold}
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
        {/if}

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
