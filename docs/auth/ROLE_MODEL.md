# Role model — one Supabase project, multiple surfaces

## Principles

1. **One `auth.users` row per identity** (same Gmail = one account) for this Supabase project.
2. **Surface access** is enforced by **`user_metadata.role`** (and fleet `organizationId` where applicable), **RLS**, **Edge Functions**, and **UI guards** — not by duplicating users.
3. **Privileged roles** (fleet / platform) must not be overwritten by rider/driver OAuth signup flows.

## Canonical `user_metadata.role` strings

| Value | Used by |
|-------|---------|
| `passenger` | Roam Rides (rider) — booking via `rides` Edge Function |
| `driver` | Roam Driver app + driver flows in `rides` Edge Function |
| `fleet_owner`, `fleet_manager`, `fleet_accountant`, `fleet_viewer` | Roam Fleet / Dash (see `packages/auth-client` RBAC) |
| `platform_owner`, `platform_support`, `platform_analyst` | Super-admin / platform tooling |
| Legacy: `superadmin`, `admin`, `manager`, `viewer` | Mapped to canonical roles in `resolveRole()` |

`passenger` is **not** part of the Fleet `Role` union in TypeScript; treat it as a **rides-surface** role alongside `driver`.

## Multi-hat users (same person, multiple products)

Today a **single** `user_metadata.role` cannot express “fleet manager AND rider” without overwriting. Options (pick when you need it):

- **A.** Keep one role; use **separate accounts** for separate hats (simplest).
- **B.** Add **`app_metadata`** (server-writable only) e.g. `surfaces: ['fleet','passenger']` + Auth Hook to put claims in JWT; RLS reads `auth.jwt()`.
- **C.** Use **domain tables only** (`rides.rider_profiles`, org membership) and relax Edge checks to “participant” instead of strict `role === passenger` where safe.

## OAuth / Google — role patch rules (client)

Implemented in `packages/auth-client/src/oauthRoleGuard.ts`:

- Never apply `passenger` or `driver` OAuth patch if the current metadata role is a **privileged** fleet/platform role (or unknown non-rides string).
- Allow switching between `passenger` and `driver` for the same account.
- If role is already the intended surface, skip `updateUser`.

Canonical redirect paths per app: **[`docs/auth/CANONICAL_LOGIN_PATHS.md`](CANONICAL_LOGIN_PATHS.md)**.

## RLS vs Edge Functions

- **Postgres RLS** is the last line of defense for **direct** PostgREST access.
- **`rides` Edge Function** already enforces `passenger` / `driver` for sensitive routes; keep that even when RLS exists.
