<script lang="ts">
  import { EllipsisVertical, ImagePlus, Images, LoaderCircle } from "@lucide/svelte";
  import { onMount } from "svelte";
  import { get } from "svelte/store";

  import { appSettings } from "#lib/app-settings.js";
  import * as Alert from "#lib/components/ui/alert/index.js";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as Card from "#lib/components/ui/card/index.js";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import {
    deleteHouseholdPhoto,
    getHouseholdPhotos,
    PHOTO_URL_REFRESH_INTERVAL,
    subscribeToHouseholdPhotos,
    uploadHouseholdPhoto,
    type HouseholdPhoto,
  } from "#lib/household-photos.js";
  import { householdSession } from "#lib/household-session.js";
  import { translations } from "#lib/i18n.js";

  let fileInput: HTMLInputElement;
  let photos = $state<HouseholdPhoto[]>([]);
  let loading = $state(true);
  let uploading = $state(false);
  let removingIds = $state<string[]>([]);
  let error = $state("");
  let text = $derived(translations[$appSettings.language]);

  async function loadPhotos(showLoader = false) {
    const session = get(householdSession);
    if (!session.household) return;

    if (showLoader) loading = true;
    error = "";

    try {
      photos = await getHouseholdPhotos(session.household.id);
    } catch (loadError) {
      console.error("Unable to load household photos", loadError);
      error = text.photos.loadErrorDescription;
    } finally {
      loading = false;
    }
  }

  async function uploadPhotos(event: Event) {
    const session = get(householdSession);
    const input = event.currentTarget as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    if (!session.household || files.length === 0) return;

    uploading = true;
    error = "";

    try {
      for (const file of files) {
        await uploadHouseholdPhoto(session.household.id, file);
      }
      await loadPhotos();
    } catch (uploadError) {
      console.error("Unable to upload household photos", uploadError);
      error = text.photos.uploadErrorDescription;
    } finally {
      uploading = false;
      input.value = "";
    }
  }

  async function removePhoto(photo: HouseholdPhoto) {
    const session = get(householdSession);
    if (!session.household) return;

    removingIds = [...removingIds, photo.id];
    error = "";

    try {
      await deleteHouseholdPhoto(session.household.id, photo);
      photos = photos.filter((candidate) => candidate.id !== photo.id);
    } catch (removeError) {
      console.error("Unable to remove household photo", removeError);
      error = text.photos.removeErrorDescription;
    } finally {
      removingIds = removingIds.filter((id) => id !== photo.id);
    }
  }

  onMount(() => {
    const session = get(householdSession);
    if (!session.household) return;

    void loadPhotos(true);
    const refreshUrls = window.setInterval(
      () => void loadPhotos(),
      PHOTO_URL_REFRESH_INTERVAL,
    );
    const unsubscribePhotos = subscribeToHouseholdPhotos(
      session.household.id,
      () => void loadPhotos(),
    );

    return () => {
      window.clearInterval(refreshUrls);
      unsubscribePhotos();
    };
  });
</script>

<Card.Root size="sm">
  <Card.Header class="border-b">
    <div class="flex items-center justify-between gap-3">
      <div class="flex min-w-0 items-center gap-2">
        <Images class="size-5 shrink-0" aria-hidden="true" />
        <Card.Title>{text.photos.library}</Card.Title>
        <Badge variant="outline">{photos.length}</Badge>
      </div>
      <Button
        size="sm"
        disabled={uploading}
        onclick={() => fileInput.click()}
      >
        {#if uploading}
          <LoaderCircle class="animate-spin" aria-hidden="true" />
          {text.photos.uploading}
        {:else}
          <ImagePlus aria-hidden="true" />
          {text.photos.add}
        {/if}
      </Button>
      <input
        bind:this={fileInput}
        class="sr-only"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        onchange={uploadPhotos}
      />
    </div>
    <Card.Description>{text.photos.libraryDescription}</Card.Description>
  </Card.Header>

  <Card.Content class="grid gap-4">
    {#if error}
      <Alert.Root variant="destructive">
        <Alert.Title>{text.photos.error}</Alert.Title>
        <Alert.Description>{error}</Alert.Description>
      </Alert.Root>
    {/if}

    {#if loading}
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {#each Array(6) as _}
          <Skeleton class="aspect-[4/3] w-full rounded-lg" />
        {/each}
      </div>
    {:else if photos.length === 0}
      <div class="grid min-h-40 place-items-center rounded-lg border border-dashed p-6 text-center">
        <div class="grid justify-items-center gap-2 text-muted-foreground">
          <Images class="size-8" aria-hidden="true" />
          <p class="text-sm">{text.photos.emptyLibrary}</p>
        </div>
      </div>
    {:else}
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {#each photos as photo (photo.id)}
          <figure class="group relative min-w-0 overflow-hidden rounded-lg border bg-muted">
            <img
              class="aspect-[4/3] size-full object-cover"
              src={photo.url}
              alt={photo.original_name}
              loading="lazy"
            />
            <DropdownMenu.Root>
              <DropdownMenu.Trigger>
                {#snippet child({ props })}
                  <Button
                    {...props}
                    variant="secondary"
                    size="icon-sm"
                    class="absolute right-2 top-2 shadow-sm"
                    disabled={removingIds.includes(photo.id)}
                    aria-label={`${text.photos.actions}: ${photo.original_name}`}
                  >
                    {#if removingIds.includes(photo.id)}
                      <LoaderCircle class="animate-spin" aria-hidden="true" />
                    {:else}
                      <EllipsisVertical aria-hidden="true" />
                    {/if}
                  </Button>
                {/snippet}
              </DropdownMenu.Trigger>
              <DropdownMenu.Content align="end">
                <DropdownMenu.Item
                  variant="destructive"
                  onSelect={() => void removePhoto(photo)}
                >
                  {text.photos.remove}
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Root>
            <figcaption class="truncate bg-background px-2 py-1.5 text-xs text-muted-foreground">
              {photo.original_name}
            </figcaption>
          </figure>
        {/each}
      </div>
    {/if}
  </Card.Content>
</Card.Root>
