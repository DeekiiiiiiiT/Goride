# User Management Architecture Audit — Roam Rush Admin

**Date:** 2026-08-23 · **Revised:** 2026-08-23 (Update 2 — post-implementation review)
**Scope:** `roamrush.app/admin` (the Rush Ops Console, `packages/dash-admin`) and every identity surface behind the three apps — **Roam Rush** (customer), **Roam Rush Courier**, **Roam Rush Partner** (merchant).
**Type:** Audit + target architecture. **No code was changed.**

> ### 📌 Update 2 — read this first
>
> A substantial implementation landed after the original audit. **The backend is roughly 60% of the way to the target architecture and is genuinely good work.** The frontend is about 15% — and that gap is exactly what you're seeing.
>
> **You are not missing the controls. They mostly do not exist in the UI yet, and some do not exist at all.**
>
> `IdentityDetailPage.tsx` is 165 lines and contains **zero buttons** — no suspend, no sign-out, no ban, no password reset. It is a read-only viewer with five tabs. Meanwhile the backend already ships working `ban`, `revoke-all-sessions`, and `revoke-merchant-staff` endpoints that **nothing in the UI ever calls**, and the client SDK only wires up 3 of them.
>
> **The single most urgent problem: you can ban a person but there is no way to un-ban them.** No endpoint, no UI. Ban is currently a one-way door.
>
> **Second most urgent: `platform.identities` is populated by a one-time backfill with no ongoing sync.** Every user who signs up from now on will be invisible in your Users directory.
>
> Full review in **[Part I](#part-i--implementation-review-update-2)**. Original findings status table in **[I1](#i1--status-of-the-original-13-findings)**. What to build next, in order, in **[I5](#i5--the-work-remaining-ordered)**.

---

## Executive summary

You do not have a user management problem. You have an **identity model** problem, and user management is where it becomes visible.

Today the admin console has no concept of a *person*. It has four disconnected directories — Customers, Couriers, Merchants, Team — each with its own status field, its own suspension mechanism, its own audit trail, and its own permission gate. The same human being with one `auth.users` row can appear in three of them with three different statuses and no cross-links. There is no screen that answers "who is this person, across all three apps, and what can they do."

Worse, there are **two RBAC systems running at once** and they are not connected. An enterprise DB-backed RBAC schema (`platform.roles` / `permissions` / `user_roles`) exists, is well designed, is documented, and is used by the Fleet product — but the entire Roam Rush delivery backend ignores it and gates on hardcoded JWT role-name lists instead. The result is a **confirmed live bug**: anyone you invite through the Team page today can log in and read everything, but every write action returns 403, with an error message that doesn't explain why. Details in Finding 1.

The good news: the foundation you'd want to build on already exists and is correct. `platform.roles`, `platform.permissions`, `platform.role_permissions`, `platform.user_roles`, `platform.permission_audit_log`, and a permission catalog that already defines `users.suspend`, `users.ban`, `users.manage_roles`, and per-product `dash.users.write` / `courier.users.write`. It's built and unused. The work is mostly **wiring and consolidation**, not greenfield.

---

# PART A — Current-state inventory

## A1. The console surface

`packages/dash-admin/src/DashAdminPortal.tsx` defines 24 routes across two nav tiers (`packages/dash-admin/src/config/dashAdminNav.ts:47-111`).

**Top nav (flat items):** Dashboard, Live Ops, Orders, Customers, Finance, Pricing, Reviews, Support, Play Store, Platform Settings
**Sections (collapsible):** Merchants (→ Onboarding → Applications, Business Types), Couriers (→ Directory, Compliance, Presence, Delivery Ledger), Markets (→ Delivery Markets), Team (→ Team Members, Activity Log)

Of these, **six surfaces manage humans**, and none of them know about each other:

| Surface | Route | Manages | Backing table | Backing routes |
|---|---|---|---|---|
| Customers | `/customers`, `/customers/:id` | Rush app users | `delivery.customers` | `admin/customerRoutes.ts` |
| Couriers → Directory | `/couriers`, `/couriers/:userId` | Courier app users | `delivery.courier_profiles` | `admin/courierRoutes.ts` |
| Couriers → Compliance | `/couriers/compliance` | Courier documents | `delivery.courier_documents` | `admin/courierRoutes.ts:216-338` |
| Couriers → Presence | `/couriers/presence` | Courier live state | presence tables | `admin/courierRoutes.ts:340` |
| Merchants | `/merchants/*`, `/merchants/:id` | Partner **businesses** + their owner accounts | `delivery.merchants` | `admin/merchantRoutes.ts` |
| Team | `/team` **and** `/users` | Admin console operators | `platform.user_roles` | `admin/dashTeamRoutes.ts` |

Note `/team` and `/users` both render the same `DashTeamPage` (`DashAdminPortal.tsx:183-184`) — a placeholder route already reserved for the section you're now asking for.

## A2. The five identity planes (today)

There is no unified person record. Instead there are five overlapping planes:

**Plane 1 — `auth.users` (Supabase).** The only true identity. One row per human. All three apps and the admin console share this one table.

**Plane 2 — `delivery.customers`** (`supabase/migrations/20260511140000_delivery_schema.sql:66-79`). `user_id` FK unique to `auth.users`. Later migrations added `account_status`, `suspended_at`, `suspended_reason`, `suspended_by`, `admin_internal_notes`.

**Plane 3 — `delivery.courier_profiles`** (`supabase/migrations/20260620120000_courier_profiles.sql:3-30`). PK *is* `user_id`. Has its own `status` enum (`pending|active|suspended|deactivated`), plus its own `suspended_at/reason/by` and `deactivated_at/reason/by`.

**Plane 4 — merchant identity, which is split in two:**
- `delivery.merchants` — the **business**, with `owner_id → auth.users`. Its status is operational (`active|suspended|deactivated`), i.e. a property of the store, not the person.
- `delivery.merchant_team_members` / `merchant_team_invites` (`supabase/migrations/20260629120100_merchant_team.sql:3,23`) — staff of a store, with their **own private role namespace**: `staff | manager | admin` (line 9, 27), completely unrelated to the platform role catalog. Managed by the merchant themselves in the Partner app via `supabase/functions/delivery/merchantTeam.ts:333-827` — **not visible in the admin console at all.**

**Plane 5 — `platform.user_roles`** (`supabase/migrations/20260627100000_platform_rbac_schema.sql:57-65`). Admin/operator roles. 18 seeded roles (lines 95-114) spanning 7 products.

A single person can hold rows in planes 2, 3, 4, and 5 simultaneously. **Nothing in the system joins them.**

## A3. The two RBAC systems

**System A — DB-backed enterprise RBAC (designed, documented, mostly unused in Rush).**
- Schema: `platform.roles`, `permissions`, `role_permissions`, `user_roles`, `permission_audit_log`
- Catalog: `docs/rbac/PERMISSION_CATALOG.md` — already defines `users.read/create/edit/delete/manage_roles/suspend/ban`, `roles.manage`, `audit.read`, plus per-product `portal.access`, `users.read`, `users.write`, `compliance.read`, `compliance.approve`, `ledger.read`, `support.write`, `settings.read/write`, `presence.read`
- Edge helpers: `supabase/functions/_shared/rbacQuery.ts`, `requirePermission.ts`, `requireMinRoleLevel.ts`
- Client helper: `usePermissions` in `@roam/auth-client`
- **Consumed by:** the Fleet product only — 20 files under `supabase/functions/_fleet-server/` call `requirePermission`

**System B — hardcoded JWT role-name sets (what Rush actually runs on).**
- `supabase/functions/delivery/admin/dashPermissions.ts:3-20` — `DASH_WRITE_ROLES`, `DASH_DELETE_ROLES`, `DASH_FORCE_APPROVE_ROLES` as literal `Set`s of role names
- `supabase/functions/delivery/admin/permissions.ts:4-20` — `COURIER_WRITE_ROLES`, `COURIER_DELETE_ROLES`, same pattern
- Gate entry point: `supabase/functions/_shared/productAdmin.ts:52-103` (`requireProductAdmin`)

**Grep result: `requirePermission` appears 0 times anywhere under `supabase/functions/delivery/`.** The entire Roam Rush backend — all three apps — runs on System B.

---

# PART B — Findings

Ranked by severity. Every claim is cited.

---

### 🔴 Finding 1 — Invited team members can read everything but write nothing (confirmed live bug)

This is the most important finding in the audit, and it means your Team page is currently **half-broken in production**.

The write path and the read path disagree about where roles live.

**The Team page writes roles to the database.** `admin/dashTeamRoutes.ts:103-106` upserts into `platform.user_roles`. It never touches `app_metadata`.

**The JWT never learns about it.** `supabase/functions/custom-access-token/index.ts:59-60` explicitly passes through only what is already on `app_metadata` — *"Authz only from app_metadata already on the user record."* It does **not** read `platform.user_roles`. So a DB-granted role never reaches the token.

**Access check passes** — `requireProductAdmin` has a DB fallback (`_shared/productAdmin.ts:73`, `userHasProductAccessResolved` at `rbacQuery.ts:148-156`), so the invited user gets in, and `effectiveRole` is synthesised as `dash_admin` at `productAdmin.ts:94`.

**But the write check reads a different field.** `productAdmin.ts:100` populates `roles: roles` — and `roles` came from `getJwtRoles(user)` at line 69, which for a DB-invited user is **empty**. Then:

- `dashPermissions.ts:27` → `hasAnyDashRole(admin.roles, DASH_WRITE_ROLES)` — checks `.roles`, not `.role`
- `permissions.ts:23` → `hasAnyCourierRole(admin.roles, COURIER_WRITE_ROLES)` — same

**Net effect:** you invite someone as Dash Admin through the UI. They log in fine. They see every page. The moment they try to approve a merchant, suspend a courier, or edit pricing, they get `403 forbidden — "dash_admin or platform role required for write actions"` — while the Team page shows them as Dash Admin. There is no diagnostic anywhere that explains the contradiction.

The only reason this hasn't burned you yet is that you're presumably operating as `platform_owner` with the role baked into `app_metadata` from the SQL provisioning scripts.

> **Fix direction:** either (a) make the custom-access-token hook resolve `platform.user_roles` into the JWT claim, or (b) make `productAdmin.ts` populate `.roles` from the DB resolution too, or (c) — correct long-term — delete the role-name sets entirely and gate on permission keys (Finding 2). Do **not** fix this by writing to `app_metadata` from the Team page; that entrenches the dual system.

---

### 🔴 Finding 2 — Two RBAC systems, and the good one is unused in Rush

`docs/auth-rbac.md:1-25` declares the DB tables "authoritative." The permission catalog already defines exactly the keys a user management section needs. None of it is enforced in the delivery backend.

Consequences:
- **Roles are not composable.** Every new capability means editing a hardcoded `Set` in Deno and redeploying an edge function. You cannot create a "Support Agent who can refund but not suspend" without a code change.
- **No least privilege.** `DASH_WRITE_ROLES` is one bucket: if you can edit a merchant, you can also edit pricing, markets, and finance. There is no separation between an ops person and a finance person.
- **`platform_support` has full write.** `dashPermissions.ts:6` grants `platform_support` the same write powers as `dash_admin` across the whole Rush console. That is a broad grant for a support tier.
- **Permission changes require a deploy.** DB-backed RBAC would make them a row update.

---

### 🔴 Finding 3 — Three incompatible suspension mechanisms, and one of them silently nukes the person's other apps

| Who | What suspension does | Auth-level ban? | Sessions revoked? | Enforced where |
|---|---|---|---|---|
| **Customer** | `customers.account_status = 'suspended'` (`customerRoutes.ts:230-235`) | ❌ No | ❌ No | Order creation only (`customerOrderRoutes.ts:102`) |
| **Courier** | `courier_profiles.status = 'suspended'` **+ `ban_duration: "8760h"`** on `auth.users` (`courierRoutes.ts:780-789`) | ✅ Yes, 1 year | ✅ Implicitly | Auth layer — total lockout |
| **Merchant** | `merchants` operational status (`merchantRoutes.ts:768-775`) | ❌ No | ❌ No | Store-level, not person-level |

Three problems fall out of this:

**3a — Suspended customers keep their session.** No ban, no `signOut`. They stay logged in, keep browsing, keep building carts, and only hit a wall at order submission. Force-sign-out exists but is a *separate manual button* (`customerRoutes.ts:269-300`) that an admin has to remember to press.

**3b — Suspending a courier can lock them out of the customer app.** `auth.admin.updateUserById(userId, { ban_duration: "8760h" })` bans the **`auth.users` row**, which is shared across all three apps. If a courier also orders food on the Rush app — extremely likely, since couriers are local — suspending them as a courier silently terminates their customer account too. There is no warning in the UI and no code anywhere that checks for the collision.

**3c — Unsuspending is asymmetric.** Courier suspend applies a 1-year auth ban; you must verify the unsuspend path clears `ban_duration` or the courier stays locked out after being "reactivated."

---

### 🟠 Finding 4 — No unified person view; the same human is three unlinked records

There is no route, no table, and no API that answers "show me everything about this person." `customerRoutes.ts`, `courierRoutes.ts`, and `merchantRoutes.ts` each independently call `auth.admin.getUserById` to hydrate an email (`customerRoutes.ts:52,105`; `courierRoutes.ts:245,326,596,883`; `merchantRoutes.ts:58`) — the shared `auth.users` id is right there in every one of them, and nothing joins on it.

Operationally this means:
- You cannot see that the courier you're about to suspend is also a customer with 40 orders (see 3b).
- You cannot see that a merchant owner is also a courier.
- Fraud rings using one identity across roles are invisible.
- Support cannot answer "this person says they can't log in" without checking four screens.

---

### 🟠 Finding 5 — Merchant staff are completely invisible to the admin console

`delivery.merchant_team_members` uses its own role namespace — `staff | manager | admin` (`20260629120100_merchant_team.sql:9`) — with a full invite/accept/decline lifecycle managed entirely by merchants in the Partner app (`merchantTeam.ts:333-827`, 12 endpoints).

The admin console has **zero visibility** into it. You cannot see who has access to a store, revoke a rogue employee's access, or audit merchant staff changes. If a merchant employee commits fraud, your only lever is suspending the entire store.

Compounding this, there are **two more parallel merchant-staff role systems**: `job_station` (`counter|kitchen|manager|pos`, `20260707120000_restaurant_management.sql:130`) and station device enrollment (`20260708120001_station_devices_pos.sql:7`). Three role vocabularies inside the Partner app, none reconciled with the platform catalog.

---

### 🟠 Finding 6 — Three parallel audit sinks; the Activity Log shows one of them

`writeKvAudit` (`admin/merchantAdminShared.ts:238-270`) writes to **two** places on every call: a KV blob table `kv_store_37f42386` keyed `audit:<timestamp>:<random>` (lines 250-261), and a structured mirror table `admin_audit_events` (line 268), described in the code as *"best-effort; table optional."*

Meanwhile `platform.permission_audit_log` (`20260627100000_platform_rbac_schema.sql:73-86`) exists as the designed enterprise audit table with proper columns — `actor_user_id`, `target_user_id`, `action`, `permission_key`, `role_name`, `ip_address`, `user_agent` — and the Rush console never writes to it.

Courier actions use a *fourth* path: `courierAudit(...)` (`courierRoutes.ts:790`).

The Activity Log page (`pages/activity/ActivityLogPage.tsx`) reads only one of these. Your audit trail is fragmented across four sinks, one of which is a best-effort write into an optional table, and another of which is an unindexed KV blob. **This is a compliance liability**, not just an inconvenience.

---

### 🟠 Finding 7 — No MFA, anywhere

Grep for `mfa|MFA|totp|aal2` across `packages/auth-client/src` and `supabase/functions/_shared` returns **nothing**. `platform_owner` — an account that can delete merchants, issue refunds, and change pricing — is protected by a password alone. There is no step-up authentication for destructive actions and no enrollment flow.

---

### 🟡 Finding 8 — No session or credential policy

No session TTL, no idle timeout, no forced re-auth for sensitive operations, no password rotation policy, no device/session listing per user, no "sign out everywhere" outside of two hardcoded buttons (`customerRoutes.ts:288`, `courierRoutes.ts:871,919`). An admin laptop left open is an indefinitely valid admin session.

---

### 🟡 Finding 9 — Platform-tier role management has no UI at all

`DashTeamPage.tsx:247` tells the operator: *"Platform-level roles are provisioned via Dominion Platform Team."* That console does not manage them either — platform roles are granted by **manually running SQL scripts**: `supabase/scripts/provision_platform_admin.sql`, `provision_product_admin.sql`, `grant_courier_admin_by_email.sql`, `grant_driver_admin_by_email.sql`, `grant_rides_admin_by_email.sql`.

So your **most privileged tier** — the accounts that can do the most damage — is provisioned by hand-run SQL with no audit trail, no approval step, no expiry, and no UI to review who currently holds it.

Related: `platform.user_roles` has an `expires_at` column (`20260627100000_platform_rbac_schema.sql:63`) that nothing reads or writes. Time-boxed access is designed but not implemented.

---

### 🟡 Finding 10 — The Team page manages 4 of 18 roles and can't see the rest

`dashTeamRoutes.ts:27` — `MANAGED_ROLE_NAMES = ["dash_admin", "dash_ops", "courier_admin", "courier_ops"]`. The `GET /team` listing filters to those four (line 33), so **a `platform_owner` or `platform_support` operator is invisible in the team list**. You cannot see the full set of people with access to your console from inside your console.

---

### 🟡 Finding 11 — Invite flow can create accounts as a side effect of a failed invite

`dashTeamRoutes.ts:80-100`: if `inviteUserByEmail` fails for any reason, the code falls through to `createUser({ email, email_confirm: true })` — creating a **pre-confirmed account** — and if that also fails, pages through `listUsers({ page: 1, perPage: 200 })` to find a match. Three problems: a transient invite failure silently creates a confirmed account; the `perPage: 200` lookup **silently fails past 200 users**, at which point invites to existing users start erroring for no visible reason; and there is no pending-invite state, so you cannot see or revoke an outstanding invite.

---

### 🟡 Finding 12 — No RBAC on courier compliance approval, and no separation of duties

`courierRoutes.ts:285` gates compliance patching behind the same `requireWrite` as everything else. The catalog defines a dedicated `courier.compliance.approve` permission — unused. Anyone who can edit a courier can also approve their background check. There is no maker/checker split on any sensitive action: the same operator can approve a merchant, set their pricing, and issue their refunds.

---

### ⚪ Finding 13 — Role checks duplicated client-side and server-side, independently

`packages/dash-admin/src/utils/dashAdminRoles.ts` (`canWriteDashAdmin`, `canDeleteDashAdmin`) reimplements client-side what `dashPermissions.ts` enforces server-side. Two lists to keep in sync, in two languages. When they drift, the UI shows buttons that 403 — which is exactly the symptom of Finding 1.

---

# PART C — Target architecture

## C1. Core principle

> **One person = one identity. Roles are grants against that identity, scoped by product and market. Every mutation is a permission check, and every permission check is logged.**

Everything below follows from that sentence.

## C2. The identity spine

Introduce **one canonical person record** that all five planes hang off. It does not replace the existing tables — it indexes them.

```
platform.identities                       ← NEW: the person
  user_id            uuid PK → auth.users(id)
  primary_email      text
  primary_phone      text
  display_name       text
  global_status      text   -- active | restricted | suspended | banned | deleted
  status_reason      text
  status_changed_at  timestamptz
  status_changed_by  uuid
  risk_score         int
  mfa_enrolled       bool
  created_at, updated_at
```

Then a derived, always-current view of what that person *is*:

```
platform.identity_personas                ← NEW: derived, one row per (person, persona)
  user_id     uuid
  persona     text   -- customer | courier | merchant_owner | merchant_staff | operator
  ref_id      uuid   -- customers.id / courier_profiles.user_id / merchants.id / member id
  status      text   -- that plane's own status, surfaced
  market_id   uuid   -- nullable, for market-scoped operators
```

This is what makes the unified person view possible, and it's a view/materialised view over tables you already have — not a migration of your data.

## C3. Status model — separate the three questions

The current mess comes from conflating three genuinely different questions. Split them:

| Layer | Question | Where it lives | Effect |
|---|---|---|---|
| **Identity status** | Can this human authenticate at all? | `platform.identities.global_status` + `auth.users.ban_duration` | Locks every app. Reserved for fraud/abuse/legal. |
| **Persona status** | Can they act in *this* role? | `customers.account_status`, `courier_profiles.status`, `merchant_team_members` | Scoped. Suspending a courier does **not** touch their customer account. |
| **Entity status** | Is this *business* trading? | `merchants` operational status | Store-level, unrelated to any person. |

**This single change resolves Findings 3a, 3b, 3c.** Courier suspension stops applying a global auth ban and instead sets persona status plus a targeted session revocation for that app. Global ban becomes an explicit, separately-permissioned action (`users.ban`) that the UI makes clear affects **all three apps**, with the person's other personas listed on the confirmation dialog.

Every status transition writes to one audit table with actor, target, reason, and prior value. Reason becomes mandatory on every restrictive action (courier suspend already requires it — `courierRoutes.ts:774-776`; customer suspend does not — `customerRoutes.ts:227`).

## C4. Authorization — collapse to one system

Delete System B. Gate everything on permission keys resolved from `platform.user_roles` → `role_permissions` → `permissions`.

**Grant model, three dimensions:**

```
platform.user_roles (extend the existing table)
  user_id, role_id                  -- exists today
  granted_by, granted_at            -- exists today
  expires_at                        -- EXISTS, currently unused — start honouring it
  + scope_type   text               -- NEW: global | product | market
  + scope_id     uuid               -- NEW: market id when scope_type = 'market'
```

Market scoping matters for you specifically: as you expand past Spanish Town into the other 15 St. Catherine towns and beyond, you will want a Portmore ops lead who can act on Portmore couriers and merchants only. Build the column now even if every row is `global` on day one — retrofitting scope later is a migration across every permission check.

**Resolution order (single path, no fallbacks):**
1. `platform.user_roles` (honouring `expires_at` and scope)
2. → `role_permissions` → permission key set
3. Cached into the JWT by the `custom-access-token` hook, with a short TTL
4. Edge functions call `requirePermission('dash.users.write')` — the helper that already exists at `_shared/requirePermission.ts`

`app_metadata.role` becomes a **read-only cache**, never a source of truth, and never written by product code. **This resolves Findings 1, 2, 13 simultaneously.**

**Permission keys to add** to the catalog (everything else you need is already defined):

```
identity.read              View unified person profile
identity.status.restrict   Persona-level suspend/restrict
identity.status.ban        Global identity ban (all apps)
identity.merge             Merge duplicate identities
identity.pii.read          View full PII (unmasked)
identity.export            GDPR/DPA data export
identity.delete            Right-to-erasure
sessions.read              View active sessions/devices
sessions.revoke            Force sign-out
roles.grant                Assign roles at/below own level
roles.grant_platform       Assign platform-tier roles
invites.manage             Create/revoke pending invites
merchant.staff.read        View merchant staff across stores
merchant.staff.revoke      Revoke merchant staff access
audit.read                 (exists) — read audit log
```

## C5. Role model

Keep the 18 seeded roles. Add the missing tier and formalise the ladder:

| Level | Role | Scope | Purpose |
|---|---|---|---|
| 1000 | `platform_owner` | Global | Sovereignty. Should be ≤2 accounts, MFA mandatory. |
| 950 | `platform_support` | Global | Cross-product support. **Should lose blanket write** (Finding 2). |
| 900 | `identity_admin` | Global | **NEW** — owns user management: roles, bans, merges, PII. |
| 800 | `dash_admin` / `courier_admin` | Product | Product administration. |
| 700 | `dash_ops` / `courier_ops` | Product / market | Day-to-day ops. |
| 600 | `support_agent` | Product | **NEW** — the tier you actually need most: read + refund + notes, no suspend, no role grants, no pricing. |
| 500 | `platform_analyst` | Global | Read-only analytics. |

**Invariants to enforce in code:**
- No operator may grant a role at or above their own level (prevents privilege escalation)
- No operator may modify their own roles — `DashTeamPage.tsx:86-89` already does this client-side; it must be enforced server-side too
- `platform_owner` count has a floor of 1 (cannot lock yourself out)
- Every grant supports `expires_at`; contractor/vendor grants **require** it

## C6. The User Management section

One top-level nav item, replacing the four scattered ones.

```
Users                                    ← top-level, above Merchants
├── Directory            All people, all personas, one searchable list
├── Person detail        /users/:userId — the unified view (below)
├── Operators            Console access: roles, invites, expiry, last-active
├── Merchant Staff       Cross-store staff visibility (fills Finding 5)
├── Access Reviews       Periodic recertification of who has what
└── Audit                Single unified log (fills Finding 6)
```

**Person detail — the screen that doesn't exist today.** `/users/:userId`, tabbed:

| Tab | Contents |
|---|---|
| **Overview** | Identity status, all personas with per-persona status, risk flags, MFA state, `auth.users` linkage |
| **Customer** | Orders, addresses, payment methods, disputes, notes — today's `CustomerDetailPage` content |
| **Courier** | Compliance docs, deliveries, presence, ledger, ratings — today's `CourierDetailPage` content |
| **Merchant** | Stores owned, staff memberships, role per store |
| **Access** | Console roles, scope, granted-by, expiry, permission preview ("what can this person actually do") |
| **Sessions** | Active sessions/devices, last seen, revoke individually or all |
| **Actions** | Restrict persona · Ban identity · Force sign-out · Reset password · Export data · Delete — each permission-gated, each requiring a reason |
| **Audit** | Everything ever done *to* and *by* this person, one timeline |

The Actions tab is where Finding 3b gets fixed in the UI: banning an identity shows *"This person is also an active Customer (40 orders) and a Merchant Owner (Island Grill). Banning locks all three."*

## C7. Unified audit

One table. `platform.permission_audit_log` already has the right shape (`20260627100000_platform_rbac_schema.sql:73-86`).

- **Retire** `kv_store_37f42386` audit keys and the "table optional" `admin_audit_events` mirror
- **Retire** `courierAudit` as a separate path
- Every admin mutation across all three apps writes one row: actor, target, action, permission key used, reason, before/after, IP, user agent
- Backfill from the KV store where recoverable
- Make the write **non-optional** — if the audit write fails, the mutation fails. An unauditable admin action should not succeed.

## C8. Security baseline

| Control | Requirement |
|---|---|
| **MFA** | Mandatory for level ≥800. Enforced at the portal gate (`DashAdminPortal.tsx:121-132` is where it goes), not per-route. |
| **Step-up auth** | Re-authenticate for: ban, delete, role grant, platform-tier grant, bulk actions. |
| **Session policy** | Admin sessions: 8h absolute, 30min idle. Customer/courier: longer, configurable. |
| **Least privilege** | Strip blanket write from `platform_support`. Introduce `support_agent`. |
| **Separation of duties** | Compliance approval ≠ courier editing. Refund issuance ≠ refund approval above a threshold. |
| **Break-glass** | One documented emergency account, offline credentials, alert on every use. |
| **Access reviews** | Quarterly recertification; auto-expire grants unconfirmed for 90 days. |
| **PII masking** | Default-masked email/phone in lists; unmask is `identity.pii.read` and is itself audited. |

---

# PART D — What to remove or consolidate

You explicitly asked what should be deleted so nothing outside User Management does the same job. Here it is.

## D1. Delete outright

| What | Where | Why |
|---|---|---|
| Duplicate `/users` route | `DashAdminPortal.tsx:184` | Both `/team` and `/users` render `DashTeamPage`. Once the real section lands, `/team` becomes a redirect to `/users/operators`. |
| `DASH_WRITE_ROLES`, `DASH_DELETE_ROLES`, `DASH_FORCE_APPROVE_ROLES` | `admin/dashPermissions.ts:3-20` | Replaced by permission keys. |
| `COURIER_WRITE_ROLES`, `COURIER_DELETE_ROLES` | `admin/permissions.ts:4-20` | Same. |
| `canWriteDashAdmin` / `canDeleteDashAdmin` | `utils/dashAdminRoles.ts` | Replaced by `usePermissions().has('dash.users.write')`. Kills the client/server drift in Finding 13. |
| KV audit writes | `admin/merchantAdminShared.ts:250-261` | Superseded by `platform.permission_audit_log`. |
| `admin_audit_events` "best-effort" mirror | `admin/merchantAdminShared.ts:268` | Same. |
| Fallback `createUser` in invite | `dashTeamRoutes.ts:85-96` | Replaced by a proper pending-invite table. Stops accidental pre-confirmed account creation (Finding 11). |
| `listUsers({ perPage: 200 })` lookup | `dashTeamRoutes.ts:93` | Silently breaks past 200 users. Replace with a direct email lookup. |

## D2. Move under User Management

| What | From | To |
|---|---|---|
| Customer directory + detail | `/customers`, `/customers/:id` | `/users` filtered `persona=customer`; detail merges into the Customer tab |
| Courier directory + detail | `/couriers`, `/couriers/:userId` | `/users` filtered `persona=courier`; detail merges into the Courier tab |
| Courier compliance | `/couriers/compliance` | `/users/compliance` — it's identity verification, not fleet ops |
| Team members | `/team` | `/users/operators` |
| Activity log | `/activity` | `/users/audit` |
| Merchant owner password reset | `merchantRoutes.ts:856` | Person detail → Actions. Credential management belongs in one place. |
| Customer force-sign-out | `customerRoutes.ts:269` | Person detail → Sessions |
| Courier sign-out / reset-password | `courierRoutes.ts:865,877` | Person detail → Sessions / Actions |

## D3. Keep where they are (deliberately)

| What | Why |
|---|---|
| Courier **Presence** (`/couriers/presence`) | Live operational state, not identity. Belongs in Live Ops — consider moving it there rather than into Users. |
| Courier **Delivery Ledger** | Financial record. Belongs under Finance. |
| **Merchants** section | Manages *businesses*. Correctly separate — only the owner/staff *accounts* move to Users. |
| **Markets** | Geography, unrelated. |

## D4. Consolidate

- **Three merchant staff role vocabularies** (`merchant_team_members.role`, `job_station`, station device enrollment) → one model: platform-namespaced role + optional station assignment.
- **Four audit sinks** → one.
- **Two suspension mechanisms + one entity status** → the three-layer status model in §C3.

---

# PART E — Phased roadmap

Sequenced so each phase is independently shippable and nothing is left half-migrated.

### Phase 0 — Stop the bleeding (days)
1. **Fix Finding 1.** Make `productAdmin.ts:96-102` populate `.roles` from the DB resolution, not JWT-only. This alone makes your Team page functional. Do it as a stopgap even though Phase 2 supersedes it.
2. Make suspension reason mandatory on customer suspend (`customerRoutes.ts:227`) to match courier.
3. Verify courier unsuspend clears `ban_duration` (Finding 3c) — if it doesn't, reactivated couriers are still locked out.
4. Add a warning to courier suspend when the target also has an active customer persona (Finding 3b).

### Phase 1 — Identity spine (1–2 weeks)
5. `platform.identities` + `identity_personas` view.
6. Backfill from `customers`, `courier_profiles`, `merchants`, `merchant_team_members`.
7. `GET /admin/identities` and `GET /admin/identities/:userId` returning the unified person.
8. Ship **read-only** `/users` Directory and Person detail. No actions yet. Immediately valuable to support, zero risk.

### Phase 2 — RBAC unification (2–3 weeks)
9. Add `scope_type` / `scope_id` to `platform.user_roles`; start honouring `expires_at`.
10. Seed the new permission keys (§C4) and the `identity_admin` / `support_agent` roles.
11. Update `custom-access-token` to resolve roles from `platform.user_roles`.
12. Migrate delivery routes from `requireDashWrite`/`requireWrite` → `requirePermission`, **route by route**, verifying each.
13. Delete the hardcoded role sets and the client-side role helpers.

### Phase 3 — Status & lifecycle (1–2 weeks)
14. Implement the three-layer status model; decouple courier suspension from global auth ban.
15. Real invite lifecycle with a pending-invites table; delete the `createUser` fallback.
16. Sessions tab: list + revoke.
17. Wire person-detail Actions to the new permission-gated endpoints.

### Phase 4 — Audit & compliance (1–2 weeks)
18. Route every admin mutation through one audit writer; make it blocking.
19. Backfill from KV where recoverable; retire the old sinks.
20. Ship `/users/audit` with actor/target/action/date filtering and export.

### Phase 5 — Security hardening (2–3 weeks)
21. MFA enrollment + enforcement for level ≥800.
22. Step-up auth on destructive actions.
23. Session TTL and idle timeout.
24. Quarterly access review workflow.
25. Break-glass account + alerting.

### Phase 6 — Merchant staff federation (1–2 weeks)
26. Surface `merchant_team_members` in the admin console.
27. Reconcile the three merchant role vocabularies.
28. Admin-side revoke of merchant staff access.

---

# PART F — Permission matrix (target)

| Capability | `platform_owner` | `identity_admin` | `platform_support` | `dash_admin` | `courier_admin` | `support_agent` | `*_ops` | `analyst` |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| View person profile | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ➖ |
| View unmasked PII | ✅ | ✅ | ➖ | ➖ | ➖ | ➖ | ❌ | ❌ |
| Restrict persona | ✅ | ✅ | ➖ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Ban identity (all apps) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Force sign-out | ✅ | ✅ | ✅ | ✅ | ✅ | ➖ | ❌ | ❌ |
| Reset password | ✅ | ✅ | ✅ | ✅ | ✅ | ➖ | ❌ | ❌ |
| Grant product role | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Grant platform role | ✅ | ➖ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Approve compliance | ✅ | ➖ | ❌ | ➖ | ✅ | ❌ | ❌ | ❌ |
| Issue refund | ✅ | ❌ | ➖ | ✅ | ➖ | ✅ | ❌ | ❌ |
| Delete person | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Export person data | ✅ | ✅ | ➖ | ➖ | ➖ | ❌ | ❌ | ❌ |
| Read audit log | ✅ | ✅ | ✅ | ➖ | ➖ | ❌ | ❌ | ✅ |
| Revoke merchant staff | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |

✅ full · ➖ scoped/conditional · ❌ denied

Note the deliberate changes from today: `platform_support` loses ban, role-grant, and delete. `identity_admin` cannot issue refunds. `dash_admin` cannot grant platform roles. No single non-owner role can both approve a courier and grant themselves more access.

---

# PART G — Enhancements you'll need that don't exist yet

Beyond fixing what's broken:

1. **Identity merge/dedupe.** Same person signs up twice (phone vs. Google). No merge tooling exists; order history and ratings fragment silently.
2. **Phone as a first-class identifier.** In Jamaica, phone is the primary identity. `customers.phone` and `courier_profiles.phone` are free-text, unverified, unindexed, and not unique. Add verification + uniqueness.
3. **Risk/fraud signals on the person.** Shared devices, shared payment instruments, courier-and-customer collusion on the same orders. The unified identity record is what makes this detectable at all.
4. **GDPR/DPA workflows.** Data export and right-to-erasure. `customerRoutes.ts:302-340` hard-deletes orders on customer delete — that destroys financial records. Erasure must anonymise, not delete, anything with accounting significance. **Flag this one for legal review before it's used in production.**
5. **Impersonation / "view as user"** with mandatory reason, hard time limit, and a banner visible to the operator. Support will ask for it; build it audited rather than have people share credentials.
6. **Notification preferences and communication log** per person — what was sent, when, through which channel.
7. **Bulk operations** with dry-run preview and per-record audit rows.
8. **Directory search** across email, phone, name, order number, and persona in one box. Today you must know which of four screens to check.

---

# PART H — Open decisions for you

These are product calls, not engineering ones. They change the design.

1. **Can one person hold multiple personas simultaneously?** Can a courier order food? Can a merchant owner also courier? The architecture above assumes **yes** (and it's the realistic answer for a Jamaica launch), which is precisely why the shared-`auth.users` ban in Finding 3b is dangerous. If the answer is no, you need enforcement at signup — but you almost certainly don't want that.
2. **Should market scope gate operators from day one?** You have 16 towns in St. Catherine and one live. When Portmore opens, do you want a Portmore-only ops lead? If yes, the scope columns go in during Phase 2 rather than being retrofitted.
3. **Does merchant staff management stay self-service?** Merchants currently manage their own team with no oversight. Admin visibility is non-negotiable; admin *control* (can you revoke a merchant's employee?) is a policy choice.
4. **Support tier boundary.** Should a support agent be able to refund without approval? Up to what amount? This sets where `support_agent` sits.
5. **Retention.** How long do audit logs live? How long does a deleted person's data persist? Drives the Phase 4 schema.

---

# PART I — Implementation review (Update 2)

Audited against what actually shipped: 76 files changed, +5,424 / −846 lines since the original audit.

## I1 — Status of the original 13 findings

| # | Finding | Status | Evidence |
|---|---|---|---|
| 1 | Invited members can read but not write | ✅ **Fixed** | `custom-access-token/index.ts:56-63` now merges DB roles into the JWT; `productAdmin.ts:71` uses `resolveEffectiveRoleNames` instead of `getJwtRoles` |
| 2 | Two RBAC systems | ✅ **Fixed** | `dashPermissions.ts` and `permissions.ts` rewritten to permission-key checks; `ProductAdminUser.permissions` added (`productAdmin.ts:38`); hardcoded role `Set`s gone |
| 3a | Suspended customers keep session | ⚠️ **Partial** | Still no session revocation on customer suspend |
| 3b | Courier suspend bans all apps | ✅ **Fixed** — but see **Finding 16** | `ban_duration` removed from courier suspend; cross-persona warning added (`courierAdminActions.ts:18-34`) |
| 3c | Unsuspend may not clear ban | ✅ **Fixed** | `COURIER_UNSUSPEND_AUTH_PATCH = { ban_duration: "none" }` applied at `courierRoutes.ts:824` |
| 4 | No unified person view | ✅ **Built** | `platform.identities` + `identity_personas` view; `/users` directory + detail page |
| 5 | Merchant staff invisible | 🟡 **Half** | Visible on the person detail Merchant tab; revoke endpoint exists but **no UI button** |
| 6 | Four audit sinks | 🟡 **Half** | `writeAdminAudit` blocking writer added; `/admin/audit/events` reads `permission_audit_log` first — but KV + `admin_audit_events` writes still live at `merchantAdminShared.ts:250,282`, and see **Finding 19** |
| 7 | No MFA | ✅ **Built** | `AdminMfaGate.tsx`, `adminMfa.ts`, AAL2 gate at `DashAdminPortal.tsx:125-135` (⚠️ uncommitted) |
| 8 | No session policy | ❌ **Open** | No TTL, no idle timeout, no session listing |
| 9 | Platform roles have no UI | ❌ **Open** | Still SQL-script-only |
| 10 | Team page manages 4 of 18 roles | ❌ **Open** | `MANAGED_ROLE_NAMES` unchanged |
| 11 | Invite flow side effects | 🟡 **Partial** | `pending_invites` migration added; `createUser` fallback still present |
| 12 | No separation of duties | ✅ **Mostly** | `dash.compliance.approve` now gates force-approve; `identity_admin` / `support_agent` roles seeded; `platform_support` blanket write stripped (`20260823130000:63-68`) |
| 13 | Client/server role duplication | ✅ **Fixed** | `useDashAdminAccess.tsx` + rewritten `dashAdminRoles.ts` |

**Score: 6 fixed, 4 partial, 3 open.** The hard architectural work — RBAC unification, identity spine, permission catalog — is done and done well. What's missing is the layer you actually touch.

## I2 — What shipped, precisely

**Backend (strong):**
- `platform.identities` table + `identity_personas` view (`20260823120000_platform_identities.sql`)
- Scope columns `scope_type` / `scope_id` on `user_roles`, 15 new permission keys, `identity_admin` + `support_agent` roles (`20260823130000_rbac_unification.sql`)
- `pending_invites` table (`20260823140000`)
- `identityRoutes.ts` — 6 endpoints
- `adminAuditWriter.ts` — blocking unified audit writer
- Permission-key gating across dash + courier routes

**Frontend (thin):**
- `IdentityDirectoryPage.tsx` — 100 lines: search box, 5 persona filter chips, 5-column table
- `IdentityDetailPage.tsx` — 165 lines: 5 tabs, all read-only
- Nav section "Users" with Directory / Operators / Audit (`dashAdminNav.ts:85-95`)
- `identities.ts` client SDK — **3 functions only**

## I3 — Why it feels old-fashioned: the UI gap, quantified

**Backend endpoints vs. UI buttons:**

| Endpoint | Exists | In SDK | Button in UI |
|---|:-:|:-:|:-:|
| `GET /identities` | ✅ | ✅ | ✅ |
| `GET /identities/:userId` | ✅ | ✅ | ✅ |
| `POST /identities/:userId/ban` | ✅ | ❌ | ❌ |
| `POST /identities/:userId/sessions/revoke-all` | ✅ | ❌ | ❌ |
| `DELETE /identities/merchant-staff/:memberId` | ✅ | ✅ | ❌ |
| `GET /identities/audit/events` | ✅ | ❌ | ❌ (dead — see F19) |

**Three working destructive/corrective actions are shipped server-side and unreachable from the console.**

**Actions that exist elsewhere in the admin but are absent from the person view** — every one of these is already implemented and permission-gated, just not surfaced where you'd look for it:

| Action | Lives at | Missing from person view |
|---|---|---|
| Suspend / unsuspend customer | `customerRoutes.ts:222,247` | ✅ missing |
| Force sign-out customer | `customerRoutes.ts:269` | ✅ missing |
| Delete customer | `customerRoutes.ts:302` | ✅ missing |
| Suspend / unsuspend courier | `courierRoutes.ts:771,806` | ✅ missing |
| Deactivate / reactivate courier | `courierRoutes.ts:815,841` | ✅ missing |
| Courier sign-out | `courierRoutes.ts:865` | ✅ missing |
| Courier reset password | `courierRoutes.ts:877` | ✅ missing |
| Approve courier | `courierRoutes.ts:703` | ✅ missing |
| Merchant suspend / deactivate | `merchantRoutes.ts:768,783` | ✅ missing |
| Reset merchant owner password | `merchantRoutes.ts:856` | ✅ missing |
| Grant / change console role | `dashTeamRoutes.ts:119` | ✅ missing |

The person detail page's Customer and Courier tabs currently render *one status line and a link that sends you somewhere else* (`IdentityDetailPage.tsx:107-123`). That is the definition of old-fashioned: it's an index card that points at four other screens rather than a place where work gets done.

**Also missing from the directory** (`IdentityDirectoryPage.tsx`): pagination (backend supports it, UI ignores it — you will only ever see the first 50 people), sort, column selection, saved views, bulk selection, row-level quick actions, status/risk badges, "joined" or "last active" columns, empty state, error state, result count, CSV export, and keyboard navigation. The status column renders a bare lowercase string (`line 91`) rather than a badge.

## I4 — New findings from the implementation

---

### 🔴 Finding 14 — Ban is a one-way door: there is no unban

`POST /identities/:userId/ban` sets `global_status = 'banned'` and applies `ban_duration: "876000h"` — **100 years** (`identityRoutes.ts:203`). There is no unban endpoint anywhere in the codebase, and no UI to reach one.

If this ships and someone fat-fingers a ban, the only remedy is a manual `auth.admin.updateUserById` against production plus a hand-written UPDATE to `platform.identities`. **Do not expose the ban button until unban exists.** Every restrictive action needs its inverse built in the same commit.

---

### 🔴 Finding 15 — `platform.identities` has no ongoing sync; the directory goes stale immediately

`20260823120000_platform_identities.sql:56-78` backfills the table once at migration time. There is **no trigger, no scheduled job, and no application-level write** on customer signup, courier signup, or merchant creation. Grep confirms `platform.identities` is written in exactly one other place: the ban handler.

Consequences, starting the moment the migration ran:
- Every new customer, courier, and merchant owner is **absent from `/users`** — they simply don't appear
- Email/phone/name changes never propagate; the directory shows stale contact details forever
- `GET /identities/:userId` degrades to a synthetic stub (`identityRoutes.ts:146-151`) for anyone missing, so the detail page half-works with blank fields rather than failing loudly

This is the highest-impact defect in the build. The directory is the entry point to the whole section, and it is quietly wrong.

> Fix: `AFTER INSERT OR UPDATE` triggers on `delivery.customers`, `delivery.courier_profiles`, `delivery.merchants`, `delivery.merchant_team_members` that upsert into `platform.identities` — plus a trigger on `auth.users` for email changes. Add a reconciliation job as a backstop.

---

### 🔴 Finding 16 — Courier suspension now enforces nothing (regression)

The Finding 3b fix removed `ban_duration` from courier suspend (`courierRoutes.ts:793-802`) — correct, because it was nuking the person's customer account. But **no replacement enforcement was added.**

`courier_profiles.status` is set to `'suspended'`, and grep across `courierConsumerRoutes.ts` finds **no status check anywhere**. A suspended courier keeps their session, stays online, keeps receiving and accepting dispatches. Before the fix, suspension was too blunt; now it is decorative.

Compounding it, the cross-persona warning text is now **factually wrong**. `courierAdminActions.ts:26-27` tells the operator *"Suspending will lock them out of ordering food until unsuspended"* — which stopped being true when the auth ban was removed. The dialog now warns about a consequence that no longer happens, while the real consequence (nothing) goes unmentioned.

> Fix: gate courier dispatch/presence/acceptance on `courier_profiles.status = 'active'`, revoke sessions on suspend, and rewrite the warning to describe what suspension actually does.

---

### 🟠 Finding 17 — No persona-level restrict; the three-layer status model is only one-third built

The identity layer shipped (`global_status` with `active|restricted|suspended|banned|deleted`) and the `identity.status.restrict` permission was seeded (`20260823130000:13`) — but **nothing consumes it.** There is no persona-restrict endpoint.

So the operator's only identity-level tool is the 100-year global ban. The graduated response the architecture calls for — restrict one persona, leave the others intact — has a permission key, a status enum value, and no implementation. The `restricted` and `suspended` values of `global_status` are currently unreachable.

---

### 🟠 Finding 18 — `dash_admin` cannot perform any identity action

`20260823130000_rbac_unification.sql:70-79` grants `identity.*`, `sessions.*`, `roles.grant`, and `merchant.staff.*` to `platform_owner`, `superadmin`, and `identity_admin` only. `dash_admin` gets none of them.

Combined with Finding 9 (no UI to grant platform-tier roles) and the fact that `identity_admin` can only be assigned by hand-run SQL, this means: **in practice only your `platform_owner` account can use the Users section's actions**, and there is no way to delegate that through the console. Per the Part F matrix, `dash_admin` should hold `sessions.revoke` and persona-level restrict at minimum.

---

### 🟠 Finding 19 — Audit filters are silently ignored, and a duplicate audit endpoint is dead code

Two problems in `supportRoutes.ts:101-138`:

**19a — Filters silently dropped.** The `action` and `actor_id` query params are read at lines 131-132 and applied **only to the legacy `admin_audit_events` branch**. The primary `permission_audit_log` query (lines 111-115) ignores them entirely. Filter the audit log in the UI and you get unfiltered results back, with no error — the filter appears to work and doesn't.

**19b — Fallback triggers on empty pages.** Line 116 falls back to the legacy table whenever the platform query returns zero rows. Page past the end of the platform log and you silently start reading a completely different data source, interleaved into the same list.

**19c — Dead duplicate.** `identityRoutes.ts:98-113` implements `/admin/identities/audit/events`, a second audit reader with a different permission check (`audit.read`). Nothing calls it — the SDK points at `/admin/audit/events` (`dashAdminService.ts:1013`). Two implementations, divergent auth, one unused.

---

### 🟡 Finding 20 — The Audit nav item points at the old page

`DashAdminPortal.tsx:222` maps `users/audit` to the pre-existing `ActivityLogPage`, which renders a flat event list with no actor resolution (raw UUIDs, not names), no target links, no reason column, no date-range picker, and no export. The unified audit log is the compliance artifact from Part C7 — it needs to be a real screen, not the old one re-pointed.

---

### 🟡 Finding 21 — No PII masking despite the permission existing

`identity.pii.read` was seeded (`20260823130000:16`). Nothing enforces it. `IdentityDirectoryPage.tsx:86-87` renders full email and phone for every person to any admin who can reach the page, and `GET /identities` returns them unmasked to any `dash` admin. The permission is decorative.

---

### 🟡 Finding 22 — Directory search has an injection-shaped seam and no pagination UI

`identityRoutes.ts:53-55` interpolates raw user input into a PostgREST `.or()` filter string. PostgREST's `or` grammar is comma/parenthesis-delimited; a query containing `,`, `)`, or `.` can break out of the intended predicate. At minimum it produces confusing 500s on ordinary input (an email search containing a dot already alters parsing); at worst it widens the filter. Sanitise or parameterise.

Separately, the endpoint supports `page`/`limit` (lines 43-44) and returns `total` (line 95), but `IdentityDirectoryPage.tsx` requests neither and renders no pager — **you can only ever see the 50 most recently updated people.**

---

### ⚪ Finding 23 — MFA gate work is uncommitted and coarse

`AdminMfaGate.tsx` and `adminMfa.ts` are untracked (`git status`), so this isn't on any branch yet. The gate itself (`DashAdminPortal.tsx:125-135`) keys off `jwtPrimaryRole` — a single role string — rather than resolved role level, so a user whose primary role is `dash_ops` but who also holds `dash_admin` slips past. It also fails **open** on error (`.catch(() => setMfaBlocked(false))`), and there is no enrollment path: a privileged user without MFA is shown a wall whose only button is "Sign out."

---

## I5 — The work remaining, ordered

### Now — before the Users section is used in anger

1. **Build unban** (F14). Endpoint + UI. Do not ship the ban button without it.
2. **Add identity sync triggers** (F15). Without this the directory is wrong and gets wronger daily.
3. **Restore courier suspension enforcement** (F16) and fix the misleading warning text.
4. **Grant `dash_admin` the identity permissions it needs** (F18), or you cannot delegate any of this.

### Next — make it a working console, not a viewer

5. **Build the action layer.** Wire every endpoint in the I3 tables into the person detail page. Spec in I6.
6. **Extend the client SDK** — it has 3 functions and needs roughly 15.
7. **Persona-level restrict** (F17) so there's a response between "nothing" and "100-year ban."
8. **Directory pagination, sort, badges, bulk select** (F22).

### Then — the modern layer

9. Sessions tab: list devices, revoke individually (needs `sessions.read` backing).
10. Real audit screen with actor names, filters that work, date range, export (F19, F20).
11. PII masking with reveal-on-permission, itself audited (F21).
12. Operators screen: all 18 roles, scope, expiry, pending invites (F9, F10, F11).
13. Retire KV audit writes once backfilled (F6).
14. Commit and harden the MFA gate (F23).

## I6 — Spec: what "modern" means here

You said it feels old-fashioned. Concretely, this is the difference.

**The person detail page should open with a header card**, not a text heading: avatar, name, global status as a coloured badge, persona chips (`Customer` `Courier` `Merchant Owner`), risk score, MFA state, member-since, last-active — and a **primary action bar** pinned to that header:

```
[ Message ]  [ Reset password ]  [ Sign out everywhere ]  [ ⋯ More ]
                                                            ├ Restrict persona ▸
                                                            ├ Suspend account
                                                            ├ Ban identity (all apps)
                                                            ├ Export data
                                                            └ Delete identity
```

Rules that make it feel modern rather than dangerous:

- **Every action is permission-gated in the UI** — hidden, not disabled-with-no-explanation, except where a tooltip explaining "requires `identity.status.ban`" is more useful
- **Every destructive action opens a typed confirm** with a mandatory reason field — `AdminConfirmContext` already provides exactly this (`DashTeamPage.tsx:109-130` shows the pattern with `matchValue` typed confirmation)
- **Cross-persona impact is shown inline in the dialog**, not discovered afterward: *"Also active as: Customer (40 orders), Merchant Owner (Island Grill). Banning locks all three."* The backend already computes this (`courierAdminActions.ts`) — surface it
- **Optimistic update + toast + undo window** where the action is reversible
- **Every action appends to the person's own audit timeline in-place**, so the operator sees the consequence without navigating away

**Each persona tab should be operable, not a link.** The Courier tab shows compliance docs with approve/reject inline, current status with suspend/reactivate inline, recent deliveries, presence. The Customer tab shows orders, addresses, disputes, and refund/credit actions. Today both render one line and a link out.

**The directory should be a data grid**: pagination, sortable columns, status badges, persona chips, last-active, risk indicator, saved filter views ("Suspended couriers", "Merchant owners in Spanish Town", "High risk"), multi-select with bulk actions, and inline row actions on hover.

**Add the Sessions tab** — device, IP, location, last seen, revoke button per row plus revoke-all. This is table stakes for a modern user admin and the single most common support request after password reset.

---

## Appendix — Key file reference

| Concern | File |
|---|---|
| Admin routes & shell | `packages/dash-admin/src/DashAdminPortal.tsx` |
| Nav config & role filtering | `packages/dash-admin/src/config/dashAdminNav.ts` |
| Team page (operators) | `packages/dash-admin/src/pages/users/DashTeamPage.tsx` |
| Team API | `supabase/functions/delivery/admin/dashTeamRoutes.ts` |
| Dash role gates | `supabase/functions/delivery/admin/dashPermissions.ts` |
| Courier role gates | `supabase/functions/delivery/admin/permissions.ts` |
| Admin auth middleware | `supabase/functions/_shared/productAdmin.ts` |
| JWT claim hook | `supabase/functions/custom-access-token/index.ts` |
| RBAC schema | `supabase/migrations/20260627100000_platform_rbac_schema.sql` |
| Permission catalog | `docs/rbac/PERMISSION_CATALOG.md` |
| RBAC design doc | `docs/auth-rbac.md` |
| Customer admin API | `supabase/functions/delivery/admin/customerRoutes.ts` |
| Courier admin API | `supabase/functions/delivery/admin/courierRoutes.ts` |
| Merchant admin API | `supabase/functions/delivery/admin/merchantRoutes.ts` |
| Merchant staff API | `supabase/functions/delivery/merchantTeam.ts` |
| Audit writer | `supabase/functions/delivery/admin/merchantAdminShared.ts:238-270` |
| Identity tables | `supabase/migrations/20260511140000_delivery_schema.sql:66` · `20260620120000_courier_profiles.sql:3` · `20260629120100_merchant_team.sql:3` |

### Added by the Update 2 implementation

| Concern | File |
|---|---|
| Identity spine + personas view | `supabase/migrations/20260823120000_platform_identities.sql` |
| RBAC unification, scopes, new roles | `supabase/migrations/20260823130000_rbac_unification.sql` |
| Pending invites | `supabase/migrations/20260823140000_pending_invites.sql` |
| Identity admin API (6 endpoints) | `supabase/functions/delivery/admin/identityRoutes.ts` |
| Unified blocking audit writer | `supabase/functions/delivery/admin/adminAuditWriter.ts` |
| Cross-persona suspend warning | `supabase/functions/delivery/admin/courierAdminActions.ts` |
| Audit read endpoint | `supabase/functions/delivery/admin/supportRoutes.ts:101-142` |
| Directory page | `packages/dash-admin/src/pages/users/IdentityDirectoryPage.tsx` |
| Person detail page | `packages/dash-admin/src/pages/users/IdentityDetailPage.tsx` |
| Identity client SDK | `packages/dash-admin-client/src/identities.ts` |
| Permission-aware access hook | `packages/dash-admin/src/hooks/useDashAdminAccess.tsx` |
| MFA gate (⚠️ uncommitted) | `packages/dash-admin/src/components/AdminMfaGate.tsx` · `src/utils/adminMfa.ts` |
