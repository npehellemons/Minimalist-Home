# Backend

Supabase is provisioned through the Vercel Marketplace integration. Vercel owns
the environment-variable connection, while database migrations remain versioned
in this repository.

## Current foundation

- Supabase Auth identifies people using companion devices.
- A user can belong to one or more households with an owner, admin, or member role.
- Every household has one protected family profile plus personal profiles.
- Calendar sources belong to a profile, so calendar events inherit that profile's color.
- Row-level security prevents signed-out users and other households from reading data.
- The existing browser-local settings remain the active data source until onboarding and
  synchronization are added.

## Commands

```sh
pnpm db:start
pnpm db:reset
pnpm db:lint
pnpm db:types
pnpm db:stop
```

For remote schema work, pull development variables with
`pnpm dlx vercel@latest env pull .env.local`. Never commit `.env.local`.

## Next slice

Add email authentication and household onboarding, then migrate local settings once
after the owner signs in. A later device-pairing flow should give the photo frame a
revocable device credential rather than storing the owner's password on the frame.
