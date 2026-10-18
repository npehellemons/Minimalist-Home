insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'household-photos',
  'household-photos',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table public.household_photos (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  storage_path text not null unique,
  original_name text not null check (char_length(original_name) between 1 and 255),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  sort_order integer not null default 0,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

create index household_photos_household_sort_idx
  on public.household_photos (household_id, sort_order, created_at);

alter table public.household_photos enable row level security;

create policy "Members can view household photos"
on public.household_photos for select
to authenticated
using ((select private.is_household_member(household_id)));

create policy "Admins can add household photos"
on public.household_photos for insert
to authenticated
with check (
  (select private.is_household_admin(household_id))
  and created_by = (select auth.uid())
);

create policy "Admins can update household photos"
on public.household_photos for update
to authenticated
using ((select private.is_household_admin(household_id)))
with check ((select private.is_household_admin(household_id)));

create policy "Admins can remove household photos"
on public.household_photos for delete
to authenticated
using ((select private.is_household_admin(household_id)));

grant select, insert, update, delete on public.household_photos to authenticated;

create function private.household_id_from_storage_path(object_name text)
returns uuid
language sql
stable
set search_path = ''
as $$
  select case
    when (storage.foldername(object_name))[1] ~
      '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
    then ((storage.foldername(object_name))[1])::uuid
    else null
  end;
$$;

revoke all on function private.household_id_from_storage_path(text) from public;
grant execute on function private.household_id_from_storage_path(text) to authenticated;

create policy "Members can view household photo objects"
on storage.objects for select
to authenticated
using (
  bucket_id = 'household-photos'
  and (select private.is_household_member(
    private.household_id_from_storage_path(name)
  ))
);

create policy "Admins can upload household photo objects"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'household-photos'
  and (select private.is_household_admin(
    private.household_id_from_storage_path(name)
  ))
);

create policy "Admins can remove household photo objects"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'household-photos'
  and (select private.is_household_admin(
    private.household_id_from_storage_path(name)
  ))
);
