<script lang="ts">
  import { Images } from "@lucide/svelte";
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import { fade } from "svelte/transition";

  import { appSettings } from "#lib/app-settings.js";
  import * as Alert from "#lib/components/ui/alert/index.js";
  import * as Card from "#lib/components/ui/card/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import WeatherIcon from "#lib/components/weather-icon.svelte";
  import {
    getHouseholdPhotos,
    PHOTO_URL_REFRESH_INTERVAL,
    subscribeToHouseholdPhotos,
    type HouseholdPhoto,
  } from "#lib/household-photos.js";
  import { householdSession } from "#lib/household-session.js";
  import { appLocale, translations } from "#lib/i18n.js";
  import { getWeatherStore } from "#lib/weather-store.js";

  const PHOTO_DURATION = 15_000;

  let { onExit }: { onExit: () => void } = $props();

  const weatherStore = getWeatherStore();
  let photos = $state<HouseholdPhoto[]>([]);
  let currentIndex = $state(0);
  let now = $state(new Date());
  let loading = $state(true);
  let loadError = $state("");
  let weather = $derived($weatherStore.current);
  let weatherUnavailable = $derived($weatherStore.unavailable);
  let text = $derived(translations[$appSettings.language]);
  let locale = $derived(appLocale($appSettings.language));
  let currentPhoto = $derived(photos[currentIndex]);
  let formattedDate = $derived(
    new Intl.DateTimeFormat(locale, {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: $appSettings.location.timezone,
    }).format(now),
  );
  let formattedTime = $derived(
    new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: $appSettings.location.timezone,
    }).format(now),
  );

  function shuffledPhotos(
    source: HouseholdPhoto[],
    avoidFirstId?: string,
  ) {
    const shuffled = [...source];

    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[randomIndex]] = [
        shuffled[randomIndex],
        shuffled[index],
      ];
    }

    if (
      avoidFirstId &&
      shuffled.length > 1 &&
      shuffled[0]?.id === avoidFirstId
    ) {
      const swapIndex = 1 + Math.floor(Math.random() * (shuffled.length - 1));
      [shuffled[0], shuffled[swapIndex]] = [
        shuffled[swapIndex],
        shuffled[0],
      ];
    }

    return shuffled;
  }

  function advancePhoto() {
    if (photos.length < 2) return;
    if (currentIndex < photos.length - 1) {
      currentIndex += 1;
      return;
    }

    const previousPhotoId = photos[currentIndex]?.id;
    photos = shuffledPhotos(photos, previousPhotoId);
    currentIndex = 0;
  }

  async function loadPhotos() {
    const session = get(householdSession);
    if (!session.household) return;

    loadError = "";

    try {
      const loadedPhotos = await getHouseholdPhotos(session.household.id);
      const currentPhotoId = photos[currentIndex]?.id;
      const loadedById = new Map(
        loadedPhotos.map((photo) => [photo.id, photo]),
      );
      const samePhotoSet =
        photos.length === loadedPhotos.length &&
        photos.every((photo) => loadedById.has(photo.id));

      if (samePhotoSet) {
        photos = photos.map((photo) => loadedById.get(photo.id) ?? photo);
      } else if (currentPhotoId && loadedById.has(currentPhotoId)) {
        const activePhoto = loadedById.get(currentPhotoId);
        const remainingPhotos = shuffledPhotos(
          loadedPhotos.filter((photo) => photo.id !== currentPhotoId),
        );
        photos = activePhoto ? [activePhoto, ...remainingPhotos] : remainingPhotos;
        currentIndex = 0;
      } else {
        photos = shuffledPhotos(loadedPhotos);
        currentIndex = 0;
      }
    } catch (error) {
      console.error("Unable to load photo slideshow", error);
      loadError = text.photos.loadErrorDescription;
    } finally {
      loading = false;
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" || event.key === " " || event.key === "Escape") {
      event.preventDefault();
      onExit();
    }
  }

  $effect(() => {
    const nextPhoto = photos[(currentIndex + 1) % photos.length];
    if (typeof window === "undefined" || !nextPhoto || photos.length < 2) return;

    const image = new Image();
    image.src = nextPhoto.url;
  });

  onMount(() => {
    const session = get(householdSession);
    let clockTimeout: number;

    function scheduleClockUpdate() {
      const delayUntilNextMinute = 60_000 - (Date.now() % 60_000) + 50;
      clockTimeout = window.setTimeout(() => {
        now = new Date();
        scheduleClockUpdate();
      }, delayUntilNextMinute);
    }

    scheduleClockUpdate();
    void loadPhotos();
    const photoInterval = window.setInterval(advancePhoto, PHOTO_DURATION);
    const photoUrlRefreshInterval = window.setInterval(
      () => void loadPhotos(),
      PHOTO_URL_REFRESH_INTERVAL,
    );
    const unsubscribePhotos = session.household
      ? subscribeToHouseholdPhotos(session.household.id, () => void loadPhotos())
      : () => undefined;

    return () => {
      window.clearTimeout(clockTimeout);
      window.clearInterval(photoInterval);
      window.clearInterval(photoUrlRefreshInterval);
      unsubscribePhotos();
    };
  });
</script>

<div
  class="relative h-full w-full cursor-pointer overflow-hidden bg-black text-white outline-none"
  role="button"
  tabindex="0"
  aria-label={text.photos.exit}
  onclick={onExit}
  onkeydown={handleKeydown}
>
  {#if currentPhoto}
    {#key currentPhoto.id}
      <img
        class="absolute inset-0 size-full object-cover"
        src={currentPhoto.url}
        alt=""
        transition:fade={{ duration: 1_200 }}
      />
    {/key}
  {:else if loading}
    <Skeleton class="absolute inset-0 size-full rounded-none bg-zinc-900" />
  {:else}
    <div class="absolute inset-0 grid place-items-center p-6">
      {#if loadError}
        <Alert.Root variant="destructive" class="max-w-md bg-background text-foreground">
          <Alert.Title>{text.photos.error}</Alert.Title>
          <Alert.Description>{loadError}</Alert.Description>
        </Alert.Root>
      {:else}
        <Card.Root class="max-w-sm border-white/20 bg-black/60 text-white backdrop-blur-md">
          <Card.Content class="grid min-h-48 place-items-center gap-3 text-center">
            <Images class="size-10 text-white/70" aria-hidden="true" />
            <div class="grid gap-1">
              <Card.Title>{text.photos.emptyTitle}</Card.Title>
              <Card.Description class="text-white/70">
                {text.photos.emptyDescription}
              </Card.Description>
            </div>
          </Card.Content>
        </Card.Root>
      {/if}
    </div>
  {/if}

  <Card.Root
    class="absolute bottom-6 left-6 max-w-[calc(100%-3rem)] border-0 bg-black/45 py-0 text-white shadow-2xl backdrop-blur-sm md:bottom-10 md:left-10"
  >
    <Card.Content class="grid gap-3 px-5 py-4 md:px-7 md:py-5">
      <div class="grid gap-0.5">
        <time class="text-sm font-medium capitalize text-white/75" datetime={now.toISOString()}>
          {formattedDate}
        </time>
        <time class="text-5xl font-semibold leading-none tabular-nums drop-shadow-md md:text-7xl" datetime={now.toISOString()}>
          {formattedTime}
        </time>
      </div>

      <div class="flex min-h-8 items-center gap-2.5 text-white/90">
        {#if weather}
          <WeatherIcon kind={weather.kind} isDay={weather.isDay} class="size-6 md:size-7" />
          <strong class="text-lg leading-none md:text-xl">
            {Math.round(weather.temperature)}{weather.unit}
          </strong>
          <span class="max-w-48 truncate text-sm text-white/70">
            {weather.description}
          </span>
        {:else}
          <div class="flex items-center gap-2" aria-label={weatherUnavailable ? text.weather.unavailable : text.weather.loading}>
            <Skeleton class="size-6 rounded-full bg-white/20" />
            <Skeleton class="h-5 w-28 bg-white/20" />
          </div>
        {/if}
      </div>
    </Card.Content>
  </Card.Root>
</div>
