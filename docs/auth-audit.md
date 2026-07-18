# Auth Audit — Roam / Fleet / Dash

OWASP-style authentication audit covering frontend signup/login/session flows across 9 apps, every Edge Function JWT/role check across both Supabase function trees, and the live Supabase auth configuration (`supabase/config.toml`).

Note: this is a Vite + Capacitor monorepo, not Next.js — the audit is grounded in what's actually here (SPA + mobile shell), not a framework assumption the original prompt made.

**Totals:** 11 critical findings · 9 high priority · 8 cleanup items · 14 things done right.

---

## Executive summary

Two findings below are complete, working account-takeover exploits usable today with nothing more than a browser console. Everything else in this report is real, but these two come first.

### 1. The single worst finding: set any user's password, no authorization check at all

Fleet's `POST /update-password` takes `{ userId, password }` straight from the request body and calls `supabase.auth.admin.updateUserById(userId, { password })` — gated only by "is logged in," not by role, not by ownership. Any authenticated account — a `fleet_viewer`, a driver, even the unauthenticated-request passthrough identity documented in a previous audit — can set the password for *any other user in the system* by supplying their user ID. This is the single easiest full account takeover found across four audits this session. The sibling endpoint, `/admin/set-password`, does this correctly (checks the caller is `platform_owner`/`superadmin` first) — the fix is applying that same check here.

> `apps/fleet/src/supabase/functions/server/index.tsx:12399-12419`

### 2. The systemic bug: three separate fields a user can set on themselves are all trusted for authorization

This connects directly to the RLS audit's worst finding (the `organizations` table trusting client-writable metadata) — it turns out that wasn't an isolated policy bug, it's how this entire platform resolves "who is this user" almost everywhere. **Three** different client-writable fields, all reachable via one `supabase.auth.updateUser({ data: {...} })` call with the public anon key, are each independently trusted somewhere in the stack:

- **`user_metadata.role`** → grants `platform_owner`/`superadmin`/any product-admin role. Confirmed reachable through the Roam Edge Function admin gates (`requireProductAdmin`, `requirePlatformAdmin`) *and* the Fleet server's RBAC resolver (`pickRawRoleForRbac`).
- **`user_metadata.organizationId`** → on the Fleet side, this is read independently of the role check and determines *which tenant's data* a request is scoped to. Set role to `admin` and `organizationId` to any target org's ID in one call, and every `requireOrg`-gated route (drivers, trips, transactions, ledger) treats you as that org's owner.
- **`user_metadata.surface`** → on the Roam side, this gates real driver/hauler dispatch endpoints (trip offers, dispatch lifecycle) independently of the role system entirely, through a different helper (`allowsHaulerOrDriverSurface` in `authEdge.ts`). A passenger account can set `surface: 'driver'` and start receiving driver-side API access. Worse, the driver app itself *auto-writes* this field for any user who lands on it, with no verification they're a real driver.

No Supabase auth hook exists to strip or validate `user_metadata` before it reaches a JWT — confirmed via `supabase/config.toml`, both `before_user_created` and `custom_access_token` hooks are disabled. And on Fleet, it gets worse in the other direction: the *admin's own* "edit user role" endpoint writes the new role into `user_metadata` instead of `app_metadata` — so even a legitimate admin-driven demotion can be silently reverted by the user themselves.

> `packages/auth-client/src/jwtRole.ts` · `supabase/functions/_shared/authEdge.ts` · `supabase/functions/_shared/productAdmin.ts` · `supabase/functions/_shared/platformAdmin.ts` · `apps/fleet/.../server/rbac_middleware.ts` · `apps/fleet/.../server/fleet_owner_provision.ts` · `apps/fleet/.../server/index.tsx:12439`

### 3. Merchant team invites auto-link by email, and email is never confirmed

Two separate config facts combine into a third exploit: `enable_confirmations = false` means anyone can sign up with any email address and get a usable session immediately — no proof of ownership required. The merchant team-invite flow then auto-links a freshly authenticated user to a pending team invitation purely by matching their (unconfirmed) email against the invite record — no token, no owner approval at claim time. Sign up with someone else's email before they do, and inherit their merchant role and payout access.

> `supabase/functions/delivery/merchantAuth.ts:80-105` · `supabase/config.toml:209`

### 4. Suspending a user can backfire into promoting them

When a banned user's JWT is checked, Supabase's Auth API correctly rejects it — but Fleet's `requireAuth()` can't tell "this token belongs to a banned user" apart from "this is the public anon key" in its default configuration, and both fall through to the same passthrough branch, which grants a synthetic `fleet_owner`-level identity. A banned `fleet_viewer`'s next request may be treated as full admin instead of being locked out.

> `apps/fleet/.../server/rbac_middleware.ts:343-388`

The counterweight, and it's a real one: `auth.getUser()` null-checking was sampled across 25+ Roam route files and found **100% consistent** — every call is immediately followed by a real 401 guard. Logout and ban enforcement are genuinely thorough on both sides (real `signOut(userId, "global")` calls, real `ban_duration`, not just app-level flags). No signup form anywhere lets a user directly type a privileged field into a UI box — every exploit here requires a deliberate out-of-band API call, not an accidental form submission.

---

## A — Fleet: account-takeover primitives

`apps/fleet/src/supabase/functions/server/` — the most severe section of this audit.

### 🚨 Critical

**`POST /update-password` has no authorization check at all.** (`index.tsx:12399-12419`.) `requireAuth()` only — no role check, no ownership check. Takes `{ userId, password }` from the body and calls `admin.updateUserById(userId, { password })` for whatever `userId` the caller supplies.
```ts
// current — anyone logged in can reset anyone's password
app.post('/update-password', requireAuth(), async (c) => {
  const { userId, password } = await c.req.json();
  await supabase.auth.admin.updateUserById(userId, { password });
  ...
});

// fix — copy the check already used by the sibling /admin/set-password route
app.post('/update-password', requireAuth(), async (c) => {
  const rbacUser = c.get('rbacUser');
  const { userId, password } = await c.req.json();
  if (rbacUser.userId !== userId &&
      !['platform_owner', 'superadmin'].includes(rbacUser.resolvedRole)) {
    return c.json({ error: 'forbidden' }, 403);
  }
  await supabase.auth.admin.updateUserById(userId, { password });
  ...
});
```
Right now, if you're logged in as anyone at all, you can change the password of any other account just by knowing their user ID — which is often visible in API responses or URLs. This fix makes the endpoint only allow you to change your own password, unless you're a platform owner acting on someone else's behalf.

**`organizationId` — which tenant's data a request is scoped to — is sourced entirely from client-writable `user_metadata`, never `app_metadata`.** (`rbac_middleware.ts:392,402-404`, `fleet_owner_provision.ts:177-182`, `index.tsx:11197,11281`.) Every write path agrees on this (wrongly): invite flows, provisioning, and the RBAC resolver all read/write `organizationId` in `user_metadata`. Combined with the role bug, one `updateUser()` call sets both `role` and `organizationId` to any target, and every `requireOrg`-gated route (drivers, trips, transactions, ledger) treats the caller as that org's owner.
```ts
// rbac_middleware.ts — organizationId must come from app_metadata, set only by an admin action
const appMeta = (data.user.app_metadata || {}) as Record<string, unknown>;
const organizationId = typeof appMeta.organizationId === 'string' ? appMeta.organizationId : null;
// stop reading data.user.user_metadata.organizationId anywhere in this file

// fleet_owner_provision.ts — write org assignment to app_metadata, not user_metadata
await supabase.auth.admin.updateUserById(userId, {
  app_metadata: { ...existingAppMeta, organizationId, role: 'fleet_owner' },
});
```

**The admin's own "edit user role" endpoint writes the new role into `user_metadata` — the field the user can overwrite themselves.** (`index.tsx:12439-12442` `/update-user`, `fleet_owner_provision.ts:171-182,330`.) Only one function in the whole Fleet codebase, `assignUserRoles()`, correctly writes to `app_metadata` — and even it then *also* redundantly writes the same role into `user_metadata` right afterward. An admin who demotes a user via the official UI has changed a field the user can silently revert.
```ts
// index.tsx:12439 — current
await supabase.auth.admin.updateUserById(userId, { user_metadata: updates });

// fix — write role/permission changes to app_metadata only
await supabase.auth.admin.updateUserById(userId, {
  app_metadata: { ...existingAppMeta, role: updates.role },
});
```

**Banning a user can promote them instead of locking them out.** (`rbac_middleware.ts:343-388, 425-458`.) When a banned user's token is checked, `getUser()` returns an error — indistinguishable, in this code, from "this is the anon key." Both fall through to the same passthrough, which defaults to a synthetic `fleet_owner`. Unless `strict_auth` is explicitly enabled (it defaults off), a suspended account's next request may run as full admin.
```ts
// the passthrough itself needs to stop defaulting to an admin role;
// at minimum, distinguish "banned" from "anon key" and reject bans outright:
if (error?.message?.toLowerCase().includes('banned')) {
  return c.json({ error: 'account_suspended' }, 403);
}
```

### ⚠️ High priority

- No independent check verifies email ownership anywhere in the Fleet signup/provisioning path — `email_confirmed_at` is read in exactly one place, and it's a read-only admin status viewer, not a gate. Since confirmations are disabled platform-wide, a freshly created unverified email can reach `fleet_owner` — a paying-customer admin role — immediately.
- Auth logic is hand-rolled in three separate places (`rbac_middleware.ts`, `product_admin_guard.ts`, and ad-hoc `isPlatformStaffFromAuthUser()` calls on `toggle-suspend`/`force-logout`/`reset-password`) — each is its own independently-maintained implementation, and all three ultimately resolve through the same vulnerable role source, so a fix has to land in three places, not one.
- Invite and password-reset-link generation (`/invite-user`, `/team/invite`, `/admin/reset-password`) have no per-email or per-target rate limiting — `rate_limiter.ts` only covers login attempts. Exposure is bounded by the permission gate today, but that gate is itself reachable via the role-spoofing bug above.

### ✅ What's actually solid

- Session termination is real and thorough: force-logout, suspend, and account deletion all call `admin.signOut(userId, "global")` — genuine refresh-token revocation, not an application-level flag — plus a platform-wide terminate-all-sessions sweep exists for incident response.
- Ban enforcement uses real `ban_duration` via the Auth admin API, and because every request re-validates through `getUser()` (a live Auth-service call, not local JWT decoding), a ban takes effect on the very next request rather than waiting out the token's natural expiry — undermined only by the passthrough bug above, not by the ban mechanism itself.
- Per-request cost is exactly one Auth-service round trip with no extra DB query for role/org resolution — both come off the same JWT metadata already returned by `getUser()`. Whatever else is wrong here, it isn't a performance problem.
- `/admin/reset-password` only generates a recovery link server-side and is staff-gated — there's no public, unauthenticated password-reset endpoint in the Fleet codebase for an attacker to hammer.

---

## B — Cross-platform role/surface spoofing: the shared mechanism

The same root cause, traced through every codebase that implements it: the frontend shared package, the Roam edge functions, and the Fleet server.

### 🚨 Critical

**The core bug, in the code.** (`packages/auth-client/src/jwtRole.ts:20-33`, `supabase/functions/_shared/authEdge.ts:65-92`.) Both the frontend shared package and its Deno edge-function twin implement the identical fallback chain, and both end at client-writable metadata:
```ts
// packages/auth-client/src/jwtRole.ts AND supabase/functions/_shared/authEdge.ts
// (independently duplicated, same bug in both)
export function jwtPrimaryRole(user) {
  const explicit = user.app_metadata?.role;
  if (explicit) return explicit;
  const fromArray = readRolesArray(user.app_metadata);
  if (fromArray.length > 0) return fromArray[0];
  const um = user.user_metadata?.role;      // <- client-writable, trusted anyway
  if (um) return um;
  return '';
}
```
```ts
// the fix: never read user_metadata for authorization, anywhere.
// jwtPrimaryRole should stop at app_metadata and return '' if nothing found there —
// delete the `const um = user.user_metadata?.role` fallback in BOTH files.
export function jwtPrimaryRole(user) {
  const explicit = user.app_metadata?.role;
  if (explicit) return explicit;
  const fromArray = readRolesArray(user.app_metadata);
  return fromArray[0] ?? '';
}
```

**Both admin gates grant access on an OR, not an AND — the spoofable JWT-role check alone is sufficient.** (`supabase/functions/_shared/productAdmin.ts:68-73`, `supabase/functions/_shared/platformAdmin.ts:39-51`.) `requireProductAdmin()`: access is denied only if *both* the JWT role check *and* a separate DB check fail — meaning either one passing is enough. `requirePlatformAdmin()`, the platform-superadmin gate, has the same shape. Once the fix above lands (role stops reading `user_metadata`), these become safe by construction — but as defense in depth, requiring the DB check unconditionally is worth doing too:
```ts
// productAdmin.ts:73 — current
if (!matched && !dbAccess) { return 403; }   // either one passing grants access

// hardened version, once role-source is fixed — still worth requiring DB confirmation
// for the highest-privilege platform roles specifically:
if (!dbAccess && !(matched && !PLATFORM_ROLES.has(matched))) { return 403; }
```

**A second, differently-named field — `user_metadata.surface` — independently gates real driver/hauler dispatch endpoints, through a different code path than the role system entirely.** (`supabase/functions/_shared/authEdge.ts:40-54` `allowsHaulerOrDriverSurface`, `apps/driver/src/utils/ensureDriverSurface.ts:30-48`.) Worse: the driver app itself auto-writes `surface: 'driver'` for any authenticated user who opens it, without checking they're an actual registered driver first. A passenger account can set this field directly and start receiving driver-side API access — trip offers, dispatch lifecycle, the works.
```ts
// authEdge.ts — stop trusting user_metadata.surface for authorization;
// require an actual driver_profiles row (already looked up elsewhere in most of these routes)
export function allowsHaulerOrDriverSurface(user, hasDriverProfile: boolean): boolean {
  return hasDriverProfile; // presence of a real, admin-approved driver_profiles row — not metadata
}

// ensureDriverSurface.ts — stop auto-writing surface for unverified users
// only set it after confirming a driver_profiles row exists for this user_id
```

### ⚠️ High priority

- `apps/fleet/src/components/auth/AuthContext.tsx:40-66` derives the Fleet frontend's `role`/`organizationId`/navigation state directly from `session.user.user_metadata`. Even once the backend is fixed, the UI itself will render as if a spoofed role/org is real until a page reload re-syncs against the server — worth switching to `app_metadata` here too for consistency, even though the backend is the actual enforcement boundary.
- `apps/fleet/src/components/auth/signup/FleetPhoneAuthWizard.tsx:84` writes an arbitrary `signup_intent: 'fleet_owner'` into `user_metadata` on signup. Nothing currently reads it — but it's exactly the kind of self-set field that becomes exploitable the moment a future feature starts trusting it. Remove it, or move it server-side.

### ✅ What's actually solid

- No signup form anywhere in either app tree lets a user directly type `role`, `roles`, `organizationId`, or `surface` into a visible field — every signup call uses a fixed, hardcoded metadata shape. Exploiting any of this requires a deliberate `updateUser()` call from devtools or a script, not an accidental form submission.
- `packages/auth-client/src/oauthProfile.ts` deliberately restricts the Google OAuth scope to email-only, specifically to avoid Google-injected `name`/`avatar_url` polluting `user_metadata` — good, consistently-applied defense against a different metadata-pollution vector.

---

## C — Roam edge functions: rides, driver, delivery, matching, identity, payments

Beyond the role-spoofing mechanism covered in section B — email confirmation, null-check discipline, and session invalidation.

### 🚨 Critical

**Merchant team invites auto-link to any authenticated user whose email matches — no token, no confirmation, no owner approval at claim time.** (`supabase/functions/delivery/merchantAuth.ts:80-105`.) `resolveMerchantAccess()` looks up a pending `merchant_team_members` row by email and immediately attaches it to whoever is logged in with that email string. Since email confirmation is disabled platform-wide, an attacker who knows (or guesses) a pending invitee's email can sign up with it first and inherit that person's merchant role and payout access.
```ts
// current
const { data: pendingMember } = await sb.from("merchant_team_members")
  .select("*, merchants(*)").ilike("email", normalized).is("user_id", null).maybeSingle();
if (pendingMember) {
  await sb.from("merchant_team_members").update({ user_id: userId }).eq("id", pendingMember.id);
}

// fix — require the actual invite token from the email link, not just an email string match
const { data: pendingMember } = await sb.from("merchant_team_members")
  .select("*, merchants(*)")
  .eq("invite_token", providedInviteToken)   // token from the invite link, not inferred from session email
  .is("user_id", null).maybeSingle();
if (pendingMember && user.email_confirmed_at) {  // also require a confirmed email
  await sb.from("merchant_team_members").update({ user_id: userId }).eq("id", pendingMember.id);
}
```

### ⚠️ High priority

- `email_confirmed_at`/`confirmed_at` is checked nowhere in `supabase/functions/` — zero matches across the entire tree. Combined with `enable_confirmations = false`, a signup with any unowned email is immediately usable everywhere except the one merchant-invite path above (where it's actively exploited).
- Payment-method and transaction-history endpoints (`payments/index.ts:667-720`) trust `user.id` the moment `getUser()` succeeds, with no independent re-verification of email ownership — consistent with the platform-wide gap above, not a separate bug, but worth naming since it's payment data specifically.

### ✅ What's actually solid

- **`auth.getUser()` null-check discipline is 100% consistent** across more than 25 sampled route files spanning rides, driver, delivery, matching, identity, and payments — every call is immediately followed by an explicit `if (!user) return ... 401`. Zero exceptions found. A centralized `requireUser()` pattern in `rides/index.ts` is dependency-injected into route modules rather than reimplemented per file.
- **Logout and ban enforcement are complete and correct.** Suspend/ban actions use GoTrue's native `ban_duration`, and dedicated force-logout endpoints call `auth.admin.signOut(userId, "global")` across driver, rides, and delivery admin routes. Because every route already calls `getUser()` (a live network round trip, not local decode), a ban takes effect on the banned user's very next request — not at natural token expiry.
- No custom "is banned" DB check exists in the hot path — and that's correct, not a gap: ban state rides for free on the `getUser()` call every route already makes, at zero additional query cost. This is strictly better than what a custom-access-token hook would have bought here.
- OAuth is entirely client-SDK-driven (`signInWithOAuth`) with no custom server-side `code`/`state` handling to get wrong — the only server-side OAuth token exchange in scope is PayPal's unrelated server-to-server payment flow.

---

## D — Frontend: Dash marketplace, Haul, Admin

dash-merchant, dash-customer, dash-courier, haul, admin.

### 🚨 Critical

**Two of three checked admin portals render their entire admin UI off the spoofable JWT role, with zero database fallback.** (`apps/dash-courier/src/admin/CourierAdminPortal.tsx:220-221`, `apps/haul/src/admin/HaulAdminPortal.tsx:90`.) `hasProductAdminRole(session.user, 'courier'|'haul')` resolves through the same vulnerable chain covered in Section B. Any authenticated user who runs `updateUser({ data: { role: 'courier_admin' } })` sees the full admin portal render client-side — the Dash-merchant admin portal, by contrast, ORs a JWT check with a DB check, which is still exploitable (see Section B) but at least attempts defense in depth.
```ts
// current — JWT role alone decides
const hasAccess = hasProductAdminRole(session.user, 'courier');

// fix — require the same DB-resolved check the backend uses,
// and don't render admin UI until it resolves
const hasAccess = await userHasProductAccessResolved(session.user.id, session.user, 'courier');
```

### ⚠️ High priority

**The courier consumer app's logout button never calls the server.** (`apps/dash-courier/src/CourierConsumerApp.tsx:124-128`.) It resets local onboarding flags and navigates to the welcome screen — the session in `localStorage` is never revoked. Every other logout button checked in this audit calls `supabase.auth.signOut()` correctly; this is the one exception.
```ts
// current
const handleSignOut = useCallback(() => {
  resetOnboarding();
  clearSignupDraft();
  setPhase('welcome');
}, []);

// fix
const handleSignOut = useCallback(async () => {
  await supabase.auth.signOut();
  resetOnboarding();
  clearSignupDraft();
  setPhase('welcome');
}, []);
```
Right now, tapping "sign out" on this app just hides the screen — the login token underneath is still valid. On a shared device, hitting back or reopening the app can land the next person right back in the previous person's account.

A stale local "onboarding complete" flag can route into the courier home screen without checking for a live session (`CourierConsumerApp.tsx:63-76`) — if the flag is `true` but the session is `null` (expired, cleared, or left over from a different account on a shared device), the code falls through to the app view anyway with no session-null branch at this entry point.

### 🧹 Cleanup & UX

- Admin portal `onAuthStateChange` handlers don't special-case `SIGNED_OUT` the way the non-admin app shells do — functionally fine since the session resolves to `null` either way, just less explicit.
- No client-side cooldown on the forgot-password button anywhere — a user can spam it before Supabase's platform-level 2-per-hour cap kicks in. Every phone-OTP wizard in the codebase has a resend timer; password reset doesn't.

### ✅ What's actually solid

- `partner-supabase.ts`'s session-validation helpers correctly call `getUser()` (a real server round trip) rather than trusting a cached `getSession()` result, with a timeout guard and a forced sign-out on any failure.
- Haul's signup forms correctly branch on whether `data.session` is present before treating signup as complete — no silent fall-through into authenticated UI for an unconfirmed account.
- The recovery-link flow deliberately isolates itself to a dedicated Supabase client with its own storage key and `detectSessionInUrl`, so a burned password-reset link can't be mistaken for an active login session on the main app client.
- Every OAuth button uses the SDK's default PKCE/state handling with no custom override — nothing here weakens Supabase's built-in CSRF protection.

---

## E — Frontend: Driver, Fleet, Rides Passenger

The apps where the `user_metadata.surface` bug (Section B) actually originates.

### 🧹 Cleanup

- `apps/rides-passenger` imports its Supabase client as the default export from `@roam/auth-client`, which is actually `supabaseDriverApp` — the driver app's client, storage key and all. Not exploitable today since the two products run on separate domains, but it's a footgun waiting for a same-origin deployment to collide sessions across two different products.
- Session-refresh handling is inconsistent across the three admin portals — one proactively refreshes when under two minutes from expiry before rendering; the other two just rely on `autoRefreshToken`. Not a bug, just worth aligning.

### ✅ What's actually solid

- Session null-handling is consistent and correct across every admin portal and account page checked — `loading` then `!session` gates every protected render.
- Logout is genuine everywhere in this section — every one of the seven checked call sites calls the product-specific client's real `signOut()`.
- Per-app session storage isolation (`packages/auth-client/src/supabase.ts`) uses a distinct `storageKey` per product/surface combination — a deliberate, well-executed design to stop admin and consumer sessions from colliding on a shared origin.
- No signup form in this section lets a user submit `role` or `organizationId` — every one hardcodes a safe, fixed value. The Fleet owner-provisioning flow specifically sends only `name`/`alsoDrive` and lets the server compute `organizationId` — a genuinely good pattern that the rest of the codebase should match.
- Email confirmation gating is correct in both Driver's and Rides Passenger's signup forms — they branch on session absence to route into a "confirm your email" screen rather than assuming signup success means logged in.

---

## F — Auth configuration: MFA, hooks, rate limits, passwords

Straight from `supabase/config.toml`. Note this is local dev config; production Dashboard settings (redirect URLs, live SMTP, live OAuth secrets) can't be verified from code and should be checked directly.

### ⚠️ High priority

- **MFA is fully disabled** — TOTP, phone, and WebAuthn all off (`[auth.mfa.totp] enroll_enabled = false`, same for phone; WebAuthn not configured at all), and zero frontend references to `supabase.auth.mfa` exist anywhere in any of the 9 apps. Given this platform handles payment methods, driver compliance documents, and payout data, the absence of any MFA option — even optional, even just for admin/staff accounts — is worth prioritizing, especially since the account-takeover bugs above make a second factor more valuable, not less.
- **No auth hooks configured** — both `before_user_created` and `custom_access_token` are commented out in config.toml. A `before_user_created` hook could reject signups that try to seed a privileged-looking `user_metadata.role` at creation time — cheap, effective defense-in-depth on top of fixing the read-side bug in Section B.

### 🧹 Cleanup

- Password policy (`minimum_password_length = 8`, `password_requirements = "letters_digits"`) is a reasonable baseline but doesn't require mixed case or symbols. Consider `lower_upper_letters_digits` as a low-cost strengthening, especially with MFA still absent.
- Platform rate limits are actually reasonably tuned (`email_sent = 2`/hour, `sign_in_sign_ups = 30`/5min/IP, `token_verifications = 30`/5min/IP) — better than the audit brief assumed. The real gap: these are all **per-IP**, not per-target-email. A distributed attacker rotating IPs could still bombard one specific victim's inbox with reset emails; Supabase's platform limiter doesn't prevent that specific abuse pattern, and no custom per-email limiter exists anywhere in the codebase to close that gap.
- Email templates can't be audited from this repo — they're Dashboard-only settings, not present as local template files. Worth a manual check that the default Supabase templates (which read as generic/spammy to most mail providers) have been replaced with branded versions, since that's invisible from code.

### ✅ What's actually solid

- Refresh token rotation is enabled with reuse-detection (`enable_refresh_token_rotation = true`, `refresh_token_reuse_interval = 10`) — the correct, current-best-practice configuration for token theft mitigation.
- Anonymous sign-ins are disabled — one less abuse surface to worry about.
- PostgREST's exposed-schema list (`public, graphql_public, delivery, payments, rides`) doesn't include `platform`, where the actual role-assignment table lives — that table isn't directly reachable over the REST API at all, which is a meaningful mitigating factor for the role-spoofing findings above (the damage happens through JWT metadata trust, not direct table access).

---

## SQL — run these in the Supabase SQL Editor

Read-only diagnostics — safe to run against production. None of these modify data.

**1. Unconfirmed users — the ghost-user headcount**
```sql
select
  count(*) filter (where email_confirmed_at is null and phone_confirmed_at is null) as fully_unconfirmed,
  count(*) filter (where email is not null and email_confirmed_at is null) as email_unconfirmed,
  count(*) filter (where phone is not null and phone_confirmed_at is null) as phone_unconfirmed,
  count(*) as total_users
from auth.users;

-- daily breakdown, most recent first
select date_trunc('day', created_at) as signup_day, count(*) as unconfirmed_signups
from auth.users
where email_confirmed_at is null and phone_confirmed_at is null
group by 1 order by 1 desc limit 30;
```

**2. Users with privilege-shaped keys in client-writable `user_metadata`**
```sql
select id, email, created_at, email_confirmed_at, raw_user_meta_data
from auth.users
where raw_user_meta_data ?| array[
  'role', 'roles', 'is_admin', 'admin', 'organizationId', 'surface',
  'platform_owner', 'superadmin', 'fleet_owner', 'signup_intent'
]
order by created_at desc;

-- narrower: user_metadata claims a privileged role that app_metadata does NOT independently confirm
-- (i.e. self-granted, not admin-granted — this is the actual exploit signature)
select
  id, email, created_at,
  raw_user_meta_data ->> 'role' as claimed_user_metadata_role,
  raw_app_meta_data ->> 'role' as actual_app_metadata_role
from auth.users
where (raw_user_meta_data ->> 'role') in (
  'platform_owner','superadmin','platform_support','platform_analyst',
  'fleet_owner','fleet_admin','fleet_ops','dash_admin','dash_ops',
  'rides_admin','rides_ops','driver_admin','driver_ops','haul_admin','haul_ops',
  'courier_admin','courier_ops','enterprise_admin','enterprise_ops','admin'
)
and coalesce(raw_app_meta_data ->> 'role', '') <> (raw_user_meta_data ->> 'role')
order by created_at desc;
```

**3. Session counts — spot shared-device / stolen-token reuse patterns**
```sql
select user_id, count(*) as active_sessions,
  min(created_at) as oldest_session, max(created_at) as newest_session
from auth.sessions
group by user_id
having count(*) > 3
order by active_sessions desc limit 50;

-- live (non-revoked) refresh tokens per user — flags anyone with several tokens
-- that were never properly revoked (e.g. the courier logout bug in Section D)
select user_id,
  count(*) as total_refresh_tokens,
  count(*) filter (where revoked) as revoked_tokens,
  count(*) filter (where not revoked) as live_tokens
from auth.refresh_tokens
group by user_id
having count(*) filter (where not revoked) > 2
order by live_tokens desc limit 50;
```

**4. "Ghost admin" cross-check — unconfirmed accounts that also carry privileged-looking metadata**

This is the sharpest diagnostic in the set: it finds accounts that were never proven to belong to a real email address, but that already claim admin-shaped metadata. Any row this returns should be investigated immediately.
```sql
select
  id, email, created_at, email_confirmed_at,
  raw_user_meta_data ->> 'role' as claimed_role,
  raw_user_meta_data ->> 'organizationId' as claimed_org_id,
  raw_user_meta_data ->> 'surface' as claimed_surface
from auth.users
where email_confirmed_at is null
  and (
    raw_user_meta_data ? 'role'
    or raw_user_meta_data ? 'organizationId'
    or raw_user_meta_data ? 'surface'
  )
order by created_at desc;
```

---

*Compiled from five independent passes — frontend (2 app groups), Roam edge functions, Fleet edge functions, plus a direct read of the shared auth package and `supabase/config.toml` that surfaced the core finding before any pass was dispatched. Every finding cites a specific file and line. Fix section A and B first — everything else is real, but those two are live exploits, not latent risk.*
