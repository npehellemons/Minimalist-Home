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
- First-run onboarding works on both the photo frame and responsive phone layouts.
- Household creation imports existing browser-local profiles and calendars in one database transaction.
- The dashboard hydrates its local settings from Supabase after sign-in.

## Commands

```sh
pnpm db:start
pnpm db:reset
pnpm db:lint
pnpm db:types
pnpm db:stop
pnpm test:onboarding
pnpm test:invites
pnpm test:tasks
```

For remote schema work, pull development variables with
`pnpm dlx vercel@latest env pull .env.local`. Never commit `.env.local`.

## Authentication URLs

Hosted Supabase Auth must use `https://minimalist-home.vercel.app` as its Site URL.
Allow `http://localhost:5173/**`, `http://127.0.0.1:5173/**`, and the Vercel preview
pattern in its redirect allow-list. The matching local values live in `supabase/config.toml`.

## Membership roadmap

Household invitations are now implemented. Further membership, authorization,
account-management, and device-pairing work is parked in
[`MEMBERSHIP_STACK_ROADMAP.md`](./MEMBERSHIP_STACK_ROADMAP.md) while development
returns to the dashboard experience.

The task data model and staged product plan are documented in
[`TASKS_ROADMAP.md`](./TASKS_ROADMAP.md).
