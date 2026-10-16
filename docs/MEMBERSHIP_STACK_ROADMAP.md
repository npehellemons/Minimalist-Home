# Membership Stack Roadmap

This document parks the membership work while product development returns to the
dashboard. It records the current behavior, known gaps, recommended decisions,
and a staged implementation plan so the work can resume without reconstructing
the reasoning.

This is a backlog, not a description of features promised for the next release.

## Goals

- Let a household owner safely invite and manage other household members.
- Keep a person's login identity separate from the household profile used to
  color and filter dashboard data.
- Give the wall display reliable access without storing an owner's credentials.
- Make authorization rules explicit and enforce them in PostgreSQL, not only in
  the interface.
- Keep the flow simple enough for non-technical household members on a phone.
- Preserve a low-cost, static SvelteKit deployment backed by Supabase.

## Current Baseline

The following foundation is implemented and deployed:

- Supabase Auth provides email and password authentication.
- `households` stores the shared household.
- `household_members` links an authenticated user to a household with an
  `owner`, `admin`, or `member` role.
- A membership can optionally link to one personal `profile` through
  `profile_id`.
- Every household has a protected family profile for shared data.
- Profiles own calendar sources, and their colors identify calendar events.
- Owners and admins can create a seven-day, one-use invite link, optionally
  linked to an existing personal profile.
- Invite codes are stored as hashes in the private schema. The browser never
  receives direct table access.
- Authenticated users join through a narrowly scoped `SECURITY DEFINER` RPC.
- Invite consumption uses row locking so two requests cannot accept the same
  invite successfully.
- Row-level security isolates households and prevents members from performing
  admin mutations.
- Members can see household data but receive a restricted Settings experience.
- Appearance remains device-specific and is not synchronized through the
  household.
- Automated invite coverage verifies valid and invalid joins, profile linking,
  read access, member restrictions, and one-use consumption.

## Current Domain Model

Three concepts should remain distinct:

| Concept | Meaning | Example |
| --- | --- | --- |
| Auth user | A human's private sign-in identity | Nicky's email account |
| Household member | That user's role and access inside a household | Owner of Minimalist Home |
| Profile | A person or shared identity used by dashboard data | Nicky, Noor, Family |

The Family profile is a shared data owner and should not normally represent a
human login. A personal member may have one linked personal profile. A future
wall-display identity should be a device, not a human member or profile.

## Recommended Product Decisions

These defaults remove ambiguity from later schema and interface work. Revisit
them only when a real product requirement conflicts with them.

1. **One household per account for the first release.** The schema currently
   permits multiple memberships while the app loads only the first one. Add a
   unique constraint on `household_members.user_id`. Support household switching
   only as a deliberate future feature.
2. **At most one account per personal profile.** Add a partial unique constraint
   on `(household_id, profile_id)` where `profile_id is not null`. This prevents
   two logins from silently becoming the same person.
3. **One personal profile per member.** Keep `profile_id` nullable for an
   unassigned member, but do not support multiple profiles per login initially.
4. **The Family profile cannot be linked to a human member.** Enforce this in the
   assignment and invitation functions.
5. **Owners and admins can invite ordinary members.** Only an owner can promote
   another owner or admin, transfer ownership, or delete the household.
6. **Household data is shared by default.** Profile filtering is a presentation
   feature, not a privacy boundary. Introduce explicit resource visibility before
   claiming personal calendars or tasks are private.
7. **The frame receives a separate device identity.** It should be paired by an
   owner, have read/write capabilities chosen for the dashboard, and be revocable
   without changing a person's password.
8. **Appearance and active-profile preferences stay per device.** Shared content
   belongs in Supabase; local viewing preferences do not.

## Correctness And Data Model

### Household cardinality

- Decide and enforce one household per user before membership management grows.
- If multi-household support is chosen instead, add a household switcher, persist
  the selected household per device, and require every query and mutation to use
  the selected household explicitly.
- Never continue with a schema that allows many households while the client
  silently selects the first row.

### Profile assignment

- Ask the owner which personal profile belongs to them during household setup.
- Let an owner assign, reassign, or clear a member's personal profile.
- Prevent assignment of the Family profile to a human account.
- Prevent the same personal profile from being linked to multiple accounts.
- Show unassigned members clearly and provide a direct assignment action.
- When a personal member signs in on a phone, default the active filter to their
  linked profile. Keep Family as the default on the wall display.

### Roles and invariants

- Replace the free-text role check with a PostgreSQL enum or a stable roles table
  when role behavior expands.
- Guarantee that every household always has at least one owner.
- Prevent the last owner from leaving, deleting their membership, or demoting
  themselves.
- Make ownership transfer an explicit transaction with reauthentication.
- Define whether admins may remove other admins; the recommended default is no.
- Keep role checks in database policies and functions. Hidden buttons are not an
  authorization boundary.

### Database constraints

- Add a unique user membership constraint if one-household-per-account is kept.
- Add the partial unique profile-assignment constraint.
- Add explicit indexes for pending invite lookups and member-management queries.
- Add collision retry around invite-token generation, even though collisions are
  currently very unlikely.
- Keep composite foreign keys that prove a linked profile belongs to the same
  household.
- Generate and commit database types after every schema migration.

## Invitation Improvements

### Management

- List pending, accepted, expired, and revoked invitations in Settings.
- Show the linked profile, creator, creation time, expiry time, and status.
- Let an owner or admin revoke a pending invitation.
- Allow regeneration without leaving multiple valid links for the same profile.
- Prevent duplicate active invitations for one profile, or explicitly label that
  duplicates are allowed.
- Add configurable expiration only if households demonstrate a need for it; keep
  seven days as the simple default.
- Clean up expired and consumed invitation rows with a scheduled retention job.

### Joining experience

- Preview the household name and assigned profile before consuming an invite.
- Require an explicit **Join household** action instead of joining immediately
  after authentication.
- Give already-associated users a useful explanation and recovery route.
- Preserve the invite through sign-up, email confirmation, sign-in, and password
  reset redirects.
- Add a clear success state before entering the dashboard.
- Map database failures to localized, actionable messages without exposing token
  validity details to unauthenticated users.
- Format pasted short codes automatically and support accessible keyboard focus.

### Sharing

- Add the Web Share API on supported phones with copy-link fallback.
- Generate a QR code so the frame can hand an invitation to a phone.
- Consider email delivery only through a trusted Vercel Function or Supabase Edge
  Function. Never expose a secret or service-role key to the browser.
- Configure production SMTP before depending on email invitations or password
  recovery; hosted default email limits are not a product-grade delivery system.

### Abuse resistance

- Use a high-entropy URL token for shared links. If a short pairing code is added,
  treat it as a separate, rate-limited flow.
- Rate-limit join attempts and invite creation per user and household.
- Add cooldowns and a maximum number of pending invitations.
- Consider CAPTCHA only if abuse appears; it should not burden the normal family
  flow preemptively.
- Bind an invite to an email address only if the product needs that stronger
  guarantee. The current model intentionally grants access to whoever possesses
  the link.

## Member Management

- Show each member's display identity, linked profile, and role.
- Add an account-level display name rather than attempting to read another user's
  private Auth email from the browser.
- Allow profile assignment and reassignment.
- Allow owners to promote or demote members within the role rules.
- Allow authorized removal with a Shadcn Alert Dialog and a clear consequence
  summary.
- Add a **Leave household** action for non-owners.
- Add explicit ownership transfer before an owner leaves.
- Add household deletion with reauthentication, typed confirmation, and an export
  warning.
- Refresh membership state immediately after role, profile, or removal changes.
- Use Supabase Realtime or focused invalidation so another open device reflects
  changes without a full reload.
- Treat removal as effective at the database immediately. Also refresh local UI
  state because an existing Auth token remains valid even though RLS should deny
  subsequent household queries.

## Device Identity And Pairing

The wall display currently signs in like a human. This is workable during
development but is the largest architectural membership improvement remaining.

- Add a `household_devices` table with a stable device ID, household ID, name,
  status, capabilities, creation time, and last-seen time.
- Let an owner generate a short-lived pairing code on a signed-in phone.
- Let the frame exchange the code for a revocable device session.
- Do not store an owner's password on the frame.
- Give device sessions only the capabilities the dashboard needs.
- Let an owner rename, inspect, and revoke devices from Settings.
- Show last seen, app version, and basic health without collecting unnecessary
  personal telemetry.
- Define an offline grace period so a temporary outage does not log the frame out
  or leave it blank.
- Keep a maintenance recovery flow for a revoked or factory-reset frame.
- Decide whether the frame may mutate tasks and calendars. Prefer granular
  capabilities over pretending the device is an owner.

## Authorization And Privacy

### Permission matrix

Create and test a written matrix for every resource and action:

| Capability | Owner | Admin | Member | Device |
| --- | --- | --- | --- | --- |
| Read shared dashboard data | Yes | Yes | Yes | Configurable |
| Edit ordinary household data | Yes | Yes | Yes, when allowed | Configurable |
| Manage profiles and calendars | Yes | Yes | No | No |
| Create or revoke member invites | Yes | Yes | No | No |
| Change roles or transfer ownership | Yes | No | No | No |
| Manage devices | Yes | Optional | No | No |
| Delete household | Yes | No | No | No |

The matrix should become executable RLS and RPC regression tests, not remain only
documentation.

### Resource visibility

- Decide whether calendars, tasks, notes, and future resources are household
  visible or private to selected profiles.
- Do not confuse the active-profile UI filter with access control. A member can
  currently read all household data allowed by RLS.
- If privacy is required, add explicit visibility and sharing fields to each
  resource and enforce them in RLS using the member's linked profile.
- Store `household_id`, creator, assignee/owner profile, and visibility on future
  shared tables from the start.
- Define how the Family profile participates in sharing before adding personal
  privacy rules.

### Supabase hardening

- Never use user-editable `user_metadata` for authorization.
- Keep secret and service-role keys out of the static client.
- Keep privileged tables in a private schema.
- For each `SECURITY DEFINER` function, fix the `search_path`, validate
  `auth.uid()`, revoke execution from `PUBLIC`, and grant only required roles.
- Prefer invoker functions and ordinary RLS where privilege escalation is not
  genuinely required.
- Give update policies both `USING` and `WITH CHECK` clauses.
- Use explicit Data API grants and RLS for every exposed table.
- Re-run database linting and security advisors after every authorization change.
- Add tests proving cross-household reads and writes fail for every new table.
- Add concurrency tests for invite consumption, owner transfer, and final-owner
  protection.

## Authentication Improvements

- Add password reset and account recovery flows before inviting general users.
- Confirm production redirect URLs for sign-up, confirmation, reset, and invites.
- Configure custom SMTP and localized email templates.
- Consider magic links or passkeys after the email/password flow is complete and
  reliable; avoid supporting multiple unfinished sign-in methods.
- Add optional MFA for owners and admins if sensitive household data grows.
- Require recent authentication for ownership transfer, household deletion, and
  other high-impact changes.
- Provide an account page for sign-out, password changes, and account deletion.
- Define account deletion behavior when the user is the last household owner.
- Keep access-token lifetime reasonable and account for the fact that deleting a
  user alone does not immediately invalidate every existing access token.

## User Experience

- Build membership surfaces from existing Shadcn components wherever suitable:
  Card, Avatar, Badge, Button, Input, Select, Tabs, Alert Dialog, Dialog, Drawer,
  Table, Skeleton, Tooltip, and Toast/Sonner.
- Give the member list explicit loading, empty, failure, and retry states.
- Keep administrative controls usable on both the frame and narrow phones.
- Use drawers or dialogs for focused mobile edits instead of dense inline forms.
- Add responsive QR and share actions without crowding the frame interface.
- Show copy/share feedback and reset it predictably.
- Localize role names, invitation states, errors, and confirmations in Dutch and
  English.
- Meet keyboard, screen-reader, focus-trap, contrast, and touch-target needs.
- Never expose raw database errors in the interface.

## Performance And Reliability

Households are small, so correctness matters more than elaborate caching. The
following optimizations are sufficient:

- Load the current membership and household once during session bootstrap.
- Consider a single typed bootstrap RPC if separate profile, calendar, and member
  queries become measurable overhead.
- Fetch only required columns and avoid per-member queries.
- Cache stable household data in memory, then invalidate it after mutations or
  Realtime events.
- Do not persist sensitive membership responses in the service-worker cache.
- Keep the service worker focused on the application shell and public assets.
- Add indexes based on measured query plans, especially membership lookup,
  pending invites, and profile assignment.
- Track last successful synchronization separately from the last attempt.
- Render stale household data with a connection state during brief outages rather
  than replacing the dashboard with a blank screen.
- Bound retries with exponential backoff and jitter.

## Operations And Observability

- Separate development, preview/staging, and production Supabase projects before
  membership changes become risky.
- Keep all schema changes in reviewed migrations and regenerate TypeScript types.
- Add membership RLS tests to CI with onboarding and invite integration tests.
- Run `pnpm check`, `pnpm build`, database linting, and security advisors in CI.
- Add a private audit log for invites, role changes, profile assignments, member
  removal, device pairing, and ownership transfer.
- Record actor, household, action, target, timestamp, and minimal safe metadata.
- Avoid storing invite tokens, passwords, calendar URLs, or unnecessary PII in
  logs.
- Add privacy-conscious product metrics only when they answer an operational
  question, such as invite completion and failure rates.
- Document backup, export, household deletion, and data-retention behavior.
- Add support diagnostics for session state, sync age, and safe error identifiers.

## Test Backlog

- Owner, admin, member, signed-out, and device permission matrix tests.
- Cross-household read and mutation denial for every table.
- One-household and one-account-per-profile constraints.
- Family profile cannot be assigned to a human member.
- Duplicate, expired, revoked, malformed, and already-consumed invite behavior.
- Two concurrent consumers of one invite.
- Invite survival through sign-up and email confirmation.
- Reassignment and removal while another client is open.
- Last-owner demotion, removal, leave, and deletion guards.
- Ownership transfer transaction and rollback behavior.
- Device pairing expiration, replay prevention, revocation, and offline recovery.
- Responsive and accessible joining and management flows on phone and frame.
- Dutch and English copy for all membership states.

## Staged Delivery Plan

### Phase 1: Correctness and basic management

Priority: highest. Complete this before inviting a wider group.

- Enforce one household per account.
- Enforce one account per personal profile.
- Link the initial owner to a personal profile.
- Add pending-invite listing and revocation.
- Add profile reassignment, member removal, and role management.
- Protect the last owner and implement ownership transfer.
- Expand RLS and concurrency tests.

Acceptance criteria:

- The database cannot enter an ambiguous membership state.
- Every management action is enforced by RLS or a narrowly scoped RPC.
- Owners can recover from incorrect assignments without SQL access.
- Automated tests cover every role and final-owner invariant.

### Phase 2: Joining polish

- Add invite preview and explicit acceptance.
- Add QR code, Web Share, and copy fallback.
- Improve localized errors and recovery states.
- Add duplicate prevention, rate limits, retention, and invite status history.
- Configure production SMTP and account recovery.

Acceptance criteria:

- A non-technical member can join from a phone without typing a long value.
- Interrupted sign-up and confirmation flows resume correctly.
- Owners can understand and revoke all outstanding access links.

### Phase 3: Frame device identity

- Add device records, pairing codes, limited capabilities, and revocation.
- Migrate the frame away from the owner's credentials.
- Add offline grace and device health information.

Acceptance criteria:

- Factory-resetting or revoking the frame does not affect a human account.
- The frame has no owner password and cannot perform owner-only actions.
- Pairing and recovery can be completed from a phone.

### Phase 4: Resource permissions

- Finalize visibility rules for calendars, tasks, notes, and future data.
- Add resource-level sharing fields only where product requirements need them.
- Extend RLS, UI states, and tests for private and shared resources.

Acceptance criteria:

- The interface and database agree on exactly who can see and edit each resource.
- Profile filtering is never presented as privacy unless RLS enforces it.

### Phase 5: Security and operations

- Add audit history, reauthentication, optional MFA, cleanup jobs, diagnostics,
  environment separation, and CI security checks.

Acceptance criteria:

- High-impact actions are attributable and require appropriately recent trust.
- Authorization regressions fail CI.
- Support can diagnose membership failures without accessing sensitive values.

### Phase 6: Optional multi-household support

Only start this phase when a concrete use case exists.

- Remove the one-household constraint.
- Add household selection and per-device active-household persistence.
- Audit every query, cache key, route, and Realtime subscription for household
  context.

Acceptance criteria:

- Switching households never leaks data, state, active profiles, or cached
  resources between households.

## Resume Checklist

When membership work resumes:

1. Re-read this document and confirm the recommended product decisions.
2. Inspect the latest migrations, generated types, and session bootstrap logic.
3. Check the current Supabase changelog and relevant Auth/RLS documentation.
4. Start with Phase 1 and create one reviewed migration per coherent schema change.
5. Add failing authorization tests before changing policies or privileged RPCs.
6. Verify locally, run database advisors, deploy to preview, and test with separate
   owner and member accounts before production.

## Useful Commands

```sh
pnpm check
pnpm build
pnpm db:start
pnpm db:reset
pnpm db:lint
pnpm db:types
pnpm test:onboarding
pnpm test:invites
```

## Related Files

- `docs/BACKEND.md`
- `supabase/migrations/20261016090000_household_foundation.sql`
- `supabase/migrations/20261016152844_household_onboarding.sql`
- `supabase/migrations/20261016175938_household_invites.sql`
- `src/lib/household-session.ts`
- `src/lib/components/settings-view.svelte`
- `scripts/test-household-onboarding.mjs`
- `scripts/test-household-invites.mjs`
