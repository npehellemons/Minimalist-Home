<script lang="ts">
  import {
    ArrowRight,
    House,
    LoaderCircle,
    LockKeyhole,
    MailCheck,
    Monitor,
    Smartphone,
  } from "@lucide/svelte";

  import { appSettings, type AppLanguage } from "#lib/app-settings.js";
  import {
    completeHouseholdOnboarding,
    currentLocalSettings,
    householdSession,
    refreshHouseholdSession,
    signIn,
    signOut,
    signUp,
  } from "#lib/household-session.js";
  import { translations } from "#lib/i18n.js";
  import ProfileAvatar from "#lib/components/profile-avatar.svelte";
  import * as Alert from "#lib/components/ui/alert/index.js";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as Card from "#lib/components/ui/card/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { Label } from "#lib/components/ui/label/index.js";
  import { Progress } from "#lib/components/ui/progress/index.js";
  import { Separator } from "#lib/components/ui/separator/index.js";
  import { Switch } from "#lib/components/ui/switch/index.js";
  import * as Tabs from "#lib/components/ui/tabs/index.js";

  let authMode = $state("signup");
  let email = $state("");
  let password = $state("");
  let submitting = $state(false);
  let confirmationEmail = $state("");
  let errorMessage = $state("");
  let householdName = $state(
    $appSettings.language === "nl" ? "Familie Hellemons" : "Hellemons Family",
  );
  let locationName = $state($appSettings.location.name);
  let language = $state<AppLanguage>($appSettings.language);
  let importExisting = $state(true);
  let text = $derived(translations[language].onboarding);
  let sourceSettings = $state(currentLocalSettings());
  let profileCount = $derived(sourceSettings.profiles.length);
  let calendarCount = $derived(
    sourceSettings.profiles.reduce(
      (count, profile) => count + profile.calendars.length,
      0,
    ),
  );
  let progress = $derived(
    $householdSession.status === "needs-household" ? 66 : 33,
  );

  async function submitAuth(event: SubmitEvent) {
    event.preventDefault();
    submitting = true;
    errorMessage = "";

    try {
      if (authMode === "signup") {
        const result = await signUp(email.trim(), password);
        if (result.needsConfirmation) confirmationEmail = email.trim();
      } else {
        await signIn(email.trim(), password);
      }
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : text.error;
    } finally {
      submitting = false;
    }
  }

  async function finishHousehold(event: SubmitEvent) {
    event.preventDefault();
    submitting = true;
    errorMessage = "";

    try {
      const settings = currentLocalSettings();
      settings.language = language;

      if (locationName.trim() !== settings.location.name) {
        const response = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(locationName.trim())}&count=1&language=${language}&format=json`,
        );
        if (!response.ok) throw new Error(text.locationError);

        const data = (await response.json()) as {
          results?: Array<{
            name: string;
            latitude: number;
            longitude: number;
            timezone?: string;
          }>;
        };
        const location = data.results?.[0];
        if (!location) throw new Error(text.locationError);

        settings.location = {
          name: location.name,
          latitude: location.latitude,
          longitude: location.longitude,
          timezone: location.timezone ?? "Europe/Amsterdam",
        };
      }

      if (!importExisting) {
        const family = settings.profiles.find((profile) => profile.family);
        settings.profiles = family
          ? [{ ...family, calendars: [] }]
          : [
              {
                id: "family",
                name: language === "nl" ? "Gezin" : "Family",
                avatar: "F",
                color: "#e11d48",
                family: true,
                calendars: [],
              },
            ];
      }

      await completeHouseholdOnboarding({
        name: householdName.trim(),
        settings,
      });
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : text.error;
    } finally {
      submitting = false;
    }
  }
</script>

<main
  class="flex h-full min-h-0 w-full items-center justify-center overflow-hidden bg-muted/30 p-4 sm:p-8"
>
  <div
    class="grid max-h-full min-h-0 w-full max-w-5xl gap-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(26rem,1.2fr)]"
  >
    <section
      class="hidden flex-col justify-between p-8 lg:flex"
      aria-label={text.product}
    >
      <div class="grid gap-6">
        <div class="flex items-center gap-3">
          <Button size="icon-lg" aria-label={text.product}>
            <House aria-hidden="true" />
          </Button>
          <span class="text-xl font-semibold">{text.product}</span>
        </div>
        <div class="grid gap-3">
          <h1 class="text-4xl font-semibold">{text.welcome}</h1>
          <p class="max-w-md text-lg text-muted-foreground">
            {text.welcomeDescription}
          </p>
        </div>
      </div>

      <div class="grid gap-3 text-sm text-muted-foreground">
        <div class="flex items-center gap-3">
          <div class="flex items-center gap-1" aria-hidden="true">
            <Monitor class="size-5" />
            <Smartphone class="size-5" />
          </div>
          <span>{text.frameReady}</span>
        </div>
        <div class="flex items-center gap-3">
          <LockKeyhole class="size-5" aria-hidden="true" />
          <span>{text.secure}</span>
        </div>
      </div>
    </section>

    <Card.Root class="max-h-full min-h-0" size="sm">
      <Card.Header class="gap-4 border-b">
        <div class="flex items-center justify-between gap-4">
          <div class="flex items-center gap-2 lg:hidden">
            <House class="size-5" aria-hidden="true" />
            <Card.Title>{text.product}</Card.Title>
          </div>
          <Badge variant="secondary" class="ml-auto">
            {$householdSession.status === "needs-household"
              ? `2/3 · ${text.stepHousehold}`
              : `1/3 · ${text.stepAccount}`}
          </Badge>
        </div>
        <Progress value={progress} aria-label={`${progress}%`} />
      </Card.Header>

      <Card.Content class="min-h-0 flex-1 overflow-y-auto p-5 sm:p-8">
        {#if $householdSession.status === "loading"}
          <div
            class="flex min-h-72 flex-col items-center justify-center gap-3 text-muted-foreground"
          >
            <LoaderCircle class="size-8 animate-spin" aria-hidden="true" />
            <p>{text.loading}</p>
          </div>
        {:else if $householdSession.status === "error"}
          <div class="grid min-h-72 place-content-center gap-4">
            <Alert.Root variant="destructive">
              <Alert.Title>{text.error}</Alert.Title>
              <Alert.Description>{$householdSession.error}</Alert.Description>
            </Alert.Root>
            <Button onclick={() => void refreshHouseholdSession()}
              >{text.retry}</Button
            >
          </div>
        {:else if confirmationEmail}
          <div class="grid min-h-72 place-items-center gap-5 text-center">
            <div class="grid justify-items-center gap-4">
              <Button
                size="icon-lg"
                variant="secondary"
                aria-label={text.confirmTitle}
              >
                <MailCheck aria-hidden="true" />
              </Button>
              <div class="grid gap-2">
                <h2 class="text-2xl font-semibold">{text.confirmTitle}</h2>
                <p class="text-muted-foreground">
                  {text.confirmDescription}<br /><strong class="text-foreground"
                    >{confirmationEmail}</strong
                  >
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              onclick={() => {
                confirmationEmail = "";
                authMode = "signin";
              }}>{text.backToSignIn}</Button
            >
          </div>
        {:else if $householdSession.status === "signed-out"}
          <div class="grid gap-6">
            <div class="grid gap-2 lg:hidden">
              <h1 class="text-3xl font-semibold">{text.welcome}</h1>
              <p class="text-muted-foreground">{text.welcomeDescription}</p>
            </div>

            <Tabs.Root bind:value={authMode}>
              <Tabs.List class="grid w-full grid-cols-2">
                <Tabs.Trigger value="signup">{text.createAccount}</Tabs.Trigger>
                <Tabs.Trigger value="signin">{text.signIn}</Tabs.Trigger>
              </Tabs.List>
            </Tabs.Root>

            <form class="grid gap-5" onsubmit={submitAuth}>
              <div class="grid gap-2">
                <Label for="onboarding-email">{text.email}</Label>
                <Input
                  id="onboarding-email"
                  type="email"
                  autocomplete="email"
                  bind:value={email}
                  required
                />
              </div>
              <div class="grid gap-2">
                <div class="flex items-center justify-between gap-3">
                  <Label for="onboarding-password">{text.password}</Label>
                  <span class="text-xs text-muted-foreground"
                    >{text.passwordHint}</span
                  >
                </div>
                <Input
                  id="onboarding-password"
                  type="password"
                  autocomplete={authMode === "signup"
                    ? "new-password"
                    : "current-password"}
                  minlength={8}
                  bind:value={password}
                  required
                />
              </div>

              {#if errorMessage}
                <Alert.Root variant="destructive">
                  <Alert.Title>{text.error}</Alert.Title>
                  <Alert.Description>{errorMessage}</Alert.Description>
                </Alert.Root>
              {/if}

              <Button type="submit" size="lg" disabled={submitting}>
                {#if submitting}<LoaderCircle
                    class="animate-spin"
                    aria-hidden="true"
                  />{/if}
                {submitting
                  ? authMode === "signup"
                    ? text.creatingAccount
                    : text.signingIn
                  : authMode === "signup"
                    ? text.createAccount
                    : text.signIn}
                {#if !submitting}<ArrowRight aria-hidden="true" />{/if}
              </Button>
            </form>

            <Separator />
            <p class="flex justify-center gap-2 text-xs text-muted-foreground">
              <LockKeyhole class="size-3.5" aria-hidden="true" />
              {text.secure}
            </p>
          </div>
        {:else if $householdSession.status === "needs-household"}
          <form class="grid gap-6" onsubmit={finishHousehold}>
            <div class="grid gap-2">
              <h1 class="text-2xl font-semibold">{text.householdTitle}</h1>
              <p class="text-sm text-muted-foreground">
                {text.householdDescription}
              </p>
            </div>

            <div class="grid gap-4 sm:grid-cols-2">
              <div class="grid gap-2">
                <Label for="household-name">{text.householdName}</Label>
                <Input
                  id="household-name"
                  bind:value={householdName}
                  maxlength={80}
                  required
                />
              </div>
              <div class="grid gap-2">
                <Label for="household-location">{text.location}</Label>
                <Input
                  id="household-location"
                  bind:value={locationName}
                  required
                />
              </div>
            </div>

            <div class="grid gap-2">
              <Label>{text.language}</Label>
              <Tabs.Root bind:value={language}>
                <Tabs.List class="grid w-full grid-cols-2">
                  <Tabs.Trigger value="nl">{text.dutch}</Tabs.Trigger>
                  <Tabs.Trigger value="en">{text.english}</Tabs.Trigger>
                </Tabs.List>
              </Tabs.Root>
            </div>

            <Card.Root class="bg-muted/30" size="sm">
              <Card.Header>
                <div class="flex items-start justify-between gap-4">
                  <div class="grid gap-1">
                    <Card.Title>{text.importTitle}</Card.Title>
                    <Card.Description>{text.importDescription}</Card.Description
                    >
                  </div>
                  <Switch
                    bind:checked={importExisting}
                    aria-label={text.importTitle}
                  />
                </div>
              </Card.Header>
              {#if importExisting}
                <Card.Content class="gap-3">
                  <div class="flex flex-wrap items-center gap-2">
                    {#each sourceSettings.profiles as profile (profile.id)}
                      <ProfileAvatar name={profile.name} size="sm" />
                    {/each}
                    <Badge variant="outline"
                      >{profileCount} {text.profiles}</Badge
                    >
                    <Badge variant="outline"
                      >{calendarCount} {text.calendars}</Badge
                    >
                  </div>
                </Card.Content>
              {/if}
            </Card.Root>

            {#if errorMessage}
              <Alert.Root variant="destructive">
                <Alert.Title>{text.error}</Alert.Title>
                <Alert.Description>{errorMessage}</Alert.Description>
              </Alert.Root>
            {/if}

            <div
              class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between"
            >
              <Button
                type="button"
                variant="ghost"
                onclick={() => void signOut()}>{text.signOut}</Button
              >
              <Button
                type="submit"
                size="lg"
                disabled={submitting || !householdName.trim()}
              >
                {#if submitting}<LoaderCircle
                    class="animate-spin"
                    aria-hidden="true"
                  />{/if}
                {submitting ? text.finishing : text.finish}
                {#if !submitting}<ArrowRight aria-hidden="true" />{/if}
              </Button>
            </div>
          </form>
        {/if}
      </Card.Content>
    </Card.Root>
  </div>
</main>
