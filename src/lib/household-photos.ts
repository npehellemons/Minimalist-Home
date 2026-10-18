import type { RealtimeChannel } from "@supabase/supabase-js";

import { supabase } from "#lib/supabase/client.js";
import type { Tables } from "#lib/supabase/database.types.js";

const PHOTO_BUCKET = "household-photos";
const PHOTO_URL_LIFETIME_SECONDS = 6 * 60 * 60;
export const PHOTO_URL_REFRESH_INTERVAL = 5 * 60 * 60 * 1000;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const supportedPhotoTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

type HouseholdPhotoRow = Tables<"household_photos">;

export type HouseholdPhoto = HouseholdPhotoRow & {
  url: string;
};

let photoSubscriptionSequence = 0;

function requireSupabase() {
  if (!supabase) throw new Error("Supabase is not configured");
  return supabase;
}

export async function getHouseholdPhotos(householdId: string) {
  const client = requireSupabase();
  const { data: rows, error } = await client
    .from("household_photos")
    .select("*")
    .eq("household_id", householdId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw error;
  if (!rows || rows.length === 0) return [];

  const { data: signedPhotos, error: signedUrlError } = await client.storage
    .from(PHOTO_BUCKET)
    .createSignedUrls(
      rows.map((photo) => photo.storage_path),
      PHOTO_URL_LIFETIME_SECONDS,
    );

  if (signedUrlError) throw signedUrlError;

  return rows.flatMap((photo, index): HouseholdPhoto[] => {
    const url = signedPhotos?.[index]?.signedUrl;
    return url ? [{ ...photo, url }] : [];
  });
}

export async function uploadHouseholdPhoto(
  householdId: string,
  file: File,
) {
  const client = requireSupabase();
  const extension = supportedPhotoTypes.get(file.type);

  if (!extension) throw new Error("Unsupported photo type");
  if (file.size > MAX_PHOTO_BYTES) throw new Error("Photo is too large");

  const id = crypto.randomUUID();
  const storagePath = `${householdId}/${id}.${extension}`;
  const { error: uploadError } = await client.storage
    .from(PHOTO_BUCKET)
    .upload(storagePath, file, {
      cacheControl: "86400",
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) throw uploadError;

  const { error: metadataError } = await client.from("household_photos").insert({
    id,
    household_id: householdId,
    storage_path: storagePath,
    original_name: file.name.slice(0, 255),
    mime_type: file.type,
  });

  if (metadataError) {
    await client.storage.from(PHOTO_BUCKET).remove([storagePath]);
    throw metadataError;
  }
}

export async function deleteHouseholdPhoto(
  householdId: string,
  photo: Pick<HouseholdPhoto, "id" | "storage_path">,
) {
  const client = requireSupabase();
  const { error: storageError } = await client.storage
    .from(PHOTO_BUCKET)
    .remove([photo.storage_path]);

  if (storageError) throw storageError;

  const { error } = await client
    .from("household_photos")
    .delete()
    .eq("household_id", householdId)
    .eq("id", photo.id);

  if (error) throw error;
}

export function subscribeToHouseholdPhotos(
  householdId: string,
  onChange: () => void,
) {
  const client = requireSupabase();
  const subscriptionId = ++photoSubscriptionSequence;
  const channel: RealtimeChannel = client
    .channel(`household-photos:${householdId}:${subscriptionId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "household_photos",
        filter: `household_id=eq.${householdId}`,
      },
      onChange,
    );

  channel.subscribe();
  return () => void client.removeChannel(channel);
}
