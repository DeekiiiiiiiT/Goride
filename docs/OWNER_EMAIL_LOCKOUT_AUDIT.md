# Owner Email Switch — Login Lockout Audit

**Date:** 2026-10-25 · **Status:** Fixed and deployed 2026-10-25. Dominion login now uses the trusted owner role. The public recovery link is gone (404). The old super-admin record is deleted. The owner profile field was left as `admin` so Fleet still works. Google sign-in is on roamdominion.co. The owner still needs to sign in once with Google to confirm the dashboard.
**Scope:** Roam Dominion (roamdominion.co) super-admin login, plus every place that decides who the platform owner is.
**Project:** Supabase `GoRide` (`csfllzzastacofsvcdsc`)

---

## 1. Plain-English summary

Your password is correct. Supabase accepted it. The app then turned you away for a different reason and showed the same "Incorrect credentials" message.

- At **20:50 UTC today** an "owner switch" moved the **owner** role from `sadikithomas@hotmail.com` to `deekiiiiiii@gmail.com`. The old account was reduced to a plain **driver**. So `sadikithomas@hotmail.com` is no longer an owner anywhere. **This is working as the switch intended.**
- The new owner, `deekiiiiiii@gmail.com`, **also cannot get into Dominion.** Dominion's login server doesn't check the owner role at all. It checks two old markers that the switch never updated:
  1. a self-editable profile field (`user_metadata.role`) that must say `superadmin`, and it says `admin`
  2. a stored "who is the super admin" record that still says **`prodigiousinvestments101@gmail.com`**
- Every other admin portal uses the correct owner role, so `deekiiiiiii@gmail.com` works there. **Dominion is the only portal still using the old markers.**

**Short version:** you didn't do anything wrong. The owner was switched in one place, but Dominion's login reads two other places that were never switched.

---

## 2. Evidence (all read-only, captured 2026-10-25)

### 2.1 Dominion server log at the moment of your screenshot (`fleet-core`)

| Time (UTC) | Log line |
|---|---|
| 22:50:16 | `User sadikithomas@hotmail.com signed in but role is 'driver', not superadmin — checking KV record` |
| 22:50:16 | `User sadikithomas@hotmail.com is not the registered superadmin (KV email: prodigiousinvestments101@gmail.com)` |
| 22:50:30 | `[AdminLogin] Login failed for deekiiiiiii@gmail.com: Invalid login credentials` |
| 22:50:39 | (same two lines as 22:50:16, second attempt) |

The 22:50:16 and 22:50:39 attempts **passed the password check** (`last_sign_in_at` = 22:50:39 on that account). The 22:50:30 attempt with the new email used a password that account doesn't have. That account mostly signs in with Google.

### 2.2 Account state now

| | `sadikithomas@hotmail.com` | `deekiiiiiii@gmail.com` | `prodigiousinvestments101@gmail.com` |
|---|---|---|---|
| Auth user id | `5f6a08ec-…f81c` | `8cfa606a-…a823` | `8d5b714b-…1d1f` |
| `app_metadata.roles` (trusted) | `["driver"]` | `["platform_owner","admin","driver"]` | 7 product-admin roles |
| `user_metadata.role` (user-editable, legacy) | `driver` | `admin` | **`superadmin`** |
| `platform.user_roles` | none | `platform_owner` | none |
| Sign-in methods | password | password + Google | password |
| Last sign-in | today 22:50 | today 22:49 | 2026-08-04 |

### 2.3 The "who is super admin" record (`public.kv_store_37f42386`, key `platform:superadmin_created`)

```json
{ "email": "prodigiousinvestments101@gmail.com",
  "userId": "b5789e2c-9250-4480-bbca-b2e6c224c85d",
  "created": true, "createdAt": "2026-03-06T11:08:42.216Z" }
```

`userId b5789e2c…` **no longer exists** in `auth.users`. This record points at a deleted account, and at an email that `supabase/scripts/provision_platform_admin.sql` says **must not** be the platform super admin.

### 2.4 The owner switch (`platform.permission_audit_log`)

| Time (UTC) | Action | Target | Source |
|---|---|---|---|
| 2026-06-20 14:16 | `role.granted platform_owner` | sadikithomas | `provision_platform_admin.sql` |
| **2026-10-25 20:50:57** | `role.granted platform_owner` | deekiiiiiii | `owner-switch` |
| **2026-10-25 20:50:57** | `role.revoked platform_owner` | sadikithomas | `owner-switch` |

The word `owner-switch` appears **nowhere in the repo**. The switch was a one-off database change, not a reviewed script. It updated `platform.user_roles` and both accounts' `app_metadata`. It also changed sadikithomas's `user_metadata.role` to `driver`. It did **not** update the KV record or deekiiiiiii's `user_metadata.role`.

### 2.5 What the git change actually did

Commit `f462276a` changed one line: the email in `supabase/scripts/provision_platform_admin.sql`. That file is a manual script and only runs when someone runs it, so **this commit by itself locks nobody out.** Today's other auth change, `aebeee9e` (`custom-access-token`), only *adds* roles and is not a cause.

---

## 3. Root cause

**RC-1: Dominion's server login gate reads the wrong source of truth.**
`supabase/functions/_fleet-server/register_residual_monolith_routes.tsx` ~L10991–11019 (`POST /make-server-37f42386/admin-login`, deployed in `fleet-core`):

```ts
let role = data.user?.user_metadata?.role;          // user-editable field
if (role !== "superadmin") {
  const kvRecord = await kv.get("platform:superadmin_created");
  if (kvRecord?.email === email) { /* promote */ }
  else { return c.json({ error: "Incorrect credentials" }, 401); }
}
```

It ignores `app_metadata` / `platform.user_roles`, which is where ownership actually lives. And it only accepts the literal string `superadmin`. `platform_owner` is rejected, even though that is the role the rest of the platform uses for the owner.

**RC-2: Ownership is stored in four places and the switch updated two.**

| # | Where ownership is recorded | Who reads it | Updated by switch? |
|---|---|---|---|
| 1 | `platform.user_roles` | RBAC, audit | ✅ |
| 2 | `auth.users.app_metadata.roles` (JWT) | All product admin portals, Dominion **browser** gate (`apps/admin/src/utils/permissions.ts` `pickAuthRawRole`) | ✅ |
| 3 | `auth.users.user_metadata.role` | Dominion **server** login, platform-team list, recovery guard, rate-limit stats | ⚠️ old owner only |
| 4 | KV `platform:superadmin_created` | Dominion **server** login, `/admin-check` | ❌ |

**RC-3: The two Dominion gates disagree.** The browser gate (`apps/admin/src/App.tsx` → `isPlatformUser`) would let `deekiiiiiii@gmail.com` in. The server gate refuses it first, so the browser gate never gets the chance.

---

## 4. Findings

Severity: **Critical** = blocks the owner or is exploitable · **High** = wrong behaviour / data drift · **Medium** = UX or ops risk · **Low** = cleanup.

### Critical

**OWN-C1: Owner cannot sign in to Dominion** (RC-1 + RC-2). Described above.

**OWN-C2: Dominion server login trusts a field any user can edit.**
`user_metadata` is writable by any signed-in user through `supabase.auth.updateUser({ data: { role: 'superadmin' } })`. Any account can set its own `role` to `superadmin` and pass `/admin-login`, which then hands out tokens.
- *Today:* the browser gate kicks that user out, and most platform API routes check `app_metadata`.
- *But:* `GET /rate-limit-stats` (~L11045) authorises on `user_metadata.role === 'superadmin'` alone. Any other route copied from this pattern would be open as well.
- This also goes against commit `8b6610d4` ("trusting app_metadata only").

**OWN-C3: Unauthenticated "recover platform owner" route with a secret that's in the repo.**
`POST /make-server-37f42386/recover-platform-owner` (~L8987) is live in the deployed `fleet-core` bundle. Its secret `ROAMFLEET-RECOVER-2026-EMERGENCY` is committed in plain text.
- Its only guard is "no user has `user_metadata.role` = `platform_owner`/`superadmin`". **Right now the only account holding that is `prodigiousinvestments101@gmail.com`.**
- If you clean that account up (a natural step after this fix), the guard opens. Anyone who has seen the repo could then create an account labelled `platform_owner`.
- **Remove this route before or together with any cleanup of `prodigiousinvestments101`.**

### High

**OWN-H1: Stale KV record points at a deleted user and the wrong email.** See §2.3. `/admin-check` and `/admin-seed` also read it.

**OWN-H2: `prodigiousinvestments101@gmail.com` still carries `user_metadata.role = superadmin`.**
It is a product-admin account, and the provisioning script says it must never be the super admin. Under the current server code it **can pass Dominion's server login**: its role matches, so the KV check never runs. The browser gate would then reject it, because it has no platform role in `app_metadata`. So: harmless today, wrong on paper, and fragile.

**OWN-H3: No single "transfer ownership" procedure.**
The switch was hand-written SQL that touched some sources of truth and missed others. Nothing checks afterwards that all four agree.

**OWN-H4: `user_metadata.role = 'admin'` on the owner is load-bearing for Fleet.**
Several Fleet routes check `user_metadata.role === 'admin'` to mean "this is a fleet manager". Examples: `fleet-admin/customers/:userId/approve` (~L13181), `admin/migrate-product-lines` (~L13411), and the organisation-owner check (~L8444). Your owner account is also your fleet organisation (`organizationId = 8cfa606a…`).
**⇒ Do NOT fix the lockout by changing deekiiiiiii's `user_metadata.role` to `superadmin`.** That includes the KV shortcut in §5 Option C, which makes the server do exactly that on your next sign-in. It would quietly break those Fleet checks.

### Medium

**OWN-M1: A wrong role counts as a failed login attempt.** A role mismatch calls `recordFailedAttempt` for both IP and email (~L11011–11013). The real owner, typing the correct password, burns through the rate limit and gets "Account temporarily locked". That makes the problem look like a password issue.

**OWN-M2: The generic error hides the cause from the owner too.** "Incorrect credentials" for both wrong password and wrong role is correct for the public. But there is no owner-visible way to see the reason (the server logs know it). This cost real time today.

**OWN-M3: Dominion has no "Sign in with Google".** The new owner account uses Google, and its password attempt failed (§2.1). Other apps were moved to Google sign-in (`f462276a` message: "point the owner setup at the Google login"). Dominion was not.

**OWN-M4: The Supabase auth audit table is empty.** `auth.audit_log_entries` returned no rows for either account in the last 3 days, so login history exists only in function logs (24 h window). Consider keeping an app-level login audit for admin portals.

### Low

**OWN-L1:** `docs/auth-audit.md` L446 still describes sadikithomas as `superadmin`/`platform_owner`. Update it after the fix.
**OWN-L2:** `supabase/scripts/provision_platform_admin.sql` does not touch `user_metadata` or the KV record, so running it alone would *not* have fixed Dominion either. Either make it complete, or retire it in favour of the procedure in §6.
**OWN-L3:** Other server routes still read `user_metadata.role` for platform decisions: platform-team list (~L8859), `/admin-check` heal (~L11069), recovery guard (~L9004). Move them to `app_metadata` with RC-1.

---

## 5. Fix options — choose one to get back in

| | What you do | Code deploy? | Side effects | Verdict |
|---|---|---|---|---|
| **A** | Change the Dominion server login to use the same role rule as the browser gate | Yes (`fleet-core`) | None; also closes OWN-C2 | **Recommended** |
| **B** | Temporarily reverse the owner switch (give sadikithomas back `platform_owner` in `app_metadata` + `user_metadata.role='superadmin'` + `platform.user_roles`) | No | Undoes your intended change; drift returns later | Stop-gap only |
| **C** | Point the KV record at deekiiiiiii | No | Server rewrites the owner's `user_metadata.role` to `superadmin` on next login → breaks Fleet checks (OWN-H4) | **Do not use** |

### Option A: steps

1. **`/admin-login`** (~L10991–11019 in `register_residual_monolith_routes.tsx`):
   - Delete the `user_metadata.role` check, the KV lookup, and the "promote user_metadata" block.
   - After a successful password check, allow the login only if the user's **`app_metadata`** roles include a platform role (`platform_owner`, `platform_support`, `platform_analyst`, `superadmin`). This is the same rule as `isPlatformRole(pickAuthRawRole(user))` in `apps/admin/src/utils/permissions.ts` and `PLATFORM_ROLES` in `packages/auth-client/src/productAdminRoles.ts`. Reuse the server-side `getJwtRoles` already used by `fleet_owner_provision.ts` rather than writing a new rule.
   - Keep the generic "Incorrect credentials" message for the public.
   - Do **not** record a failed attempt for a role mismatch (OWN-M1). Log a reason code instead.
   - Return the role from `app_metadata` in the response `user.role`, not from `user_metadata`.
2. **`/rate-limit-stats`** (~L11045): same change (OWN-C2).
3. **Delete `/recover-platform-owner`** (~L8984–9030) (OWN-C3). Recovery belongs in the Supabase dashboard, not on a public URL.
4. **`/admin-check`** and **`/admin-seed`** (~L10560–10640, ~L11055–11090): `/admin-check` should answer "does any user have `platform_owner` in `app_metadata`?". Retire `/admin-seed`. The setup screen in `AdminLoginPage.tsx` should never show in production again.
5. Rebuild and deploy **`fleet-core`** (the route lives in the bundled `index.ts`). Confirm the bundle no longer contains `superadmin_created` in the login path or `ROAMFLEET-RECOVER`.
6. **Password for the new owner:** the 22:50:30 attempt shows `deekiiiiiii@gmail.com`'s password isn't the one you typed. On roamdominion.co, type that email and click **Forgot password?**, then set one. (Or add Google sign-in to Dominion, OWN-M3.)

### Option B: SQL, only if you need in tonight and can't deploy

Run in the Supabase SQL editor. **This reverses your owner switch**, so redo it properly via §6 once Option A is live.

```sql
-- B1: give the old account back the owner role everywhere Dominion looks
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data
      || jsonb_build_object('role','platform_owner',
                            'roles', jsonb_build_array('platform_owner','driver')),
    raw_user_meta_data = raw_user_meta_data || jsonb_build_object('role','superadmin')
WHERE id = '5f6a08ec-2039-4225-91f6-a9a2c345f81c';

INSERT INTO platform.user_roles (user_id, role_id, granted_by)
SELECT '5f6a08ec-2039-4225-91f6-a9a2c345f81c', id, NULL
FROM platform.roles WHERE name = 'platform_owner'
ON CONFLICT (user_id, role_id) DO NOTHING;
```

Then sign in to Dominion as `sadikithomas@hotmail.com`. Sign out of all its tabs first so a fresh token is issued. Keep the `'driver'` role in that list if this account is still used in the driver app.

---

## 6. Target design (do after Option A)

1. **One source of truth for platform roles:** `platform.user_roles`, mirrored into `app_metadata` by the access-token hook (`supabase/functions/custom-access-token`). Nothing makes an authorisation decision from `user_metadata`. Keep `user_metadata.role` as a display hint at most, and migrate Fleet's "is fleet manager" checks (OWN-H4) to `app_metadata.roles` containing `admin`/`fleet_owner`, as `userCanAccessFleetPortal` already does.
2. **Delete the KV `platform:superadmin_created` record** once no code reads it.
3. **A single, reviewed "transfer platform ownership" script** in `supabase/scripts/`, run inside one transaction. It:
   - grants `platform_owner` to the new user in `platform.user_roles` and `app_metadata`
   - revokes it from the old user in both places, keeping their other roles; it never *replaces* the array
   - writes `permission_audit_log` rows with source `transfer_ownership.sql`
   - refuses to finish if the new owner can't sign in (no password and no Google identity)
   - ends with the consistency check below, and raises an error if it fails.
4. **Consistency check** (also suitable as a nightly control). It must return **zero rows**:

```sql
SELECT u.email, u.raw_app_meta_data->'roles' AS jwt_roles,
       array_agg(r.name) FILTER (WHERE r.name IS NOT NULL) AS table_roles
FROM auth.users u
LEFT JOIN platform.user_roles ur ON ur.user_id = u.id
LEFT JOIN platform.roles r ON r.id = ur.role_id AND r.product_key IS NULL
WHERE u.raw_app_meta_data->'roles' ?| array['platform_owner','platform_support','platform_analyst','superadmin']
   OR r.name IS NOT NULL
GROUP BY u.id, u.email, u.raw_app_meta_data
HAVING NOT (
  COALESCE(array_agg(r.name) FILTER (WHERE r.name IS NOT NULL), '{}')
  <@ ARRAY(SELECT jsonb_array_elements_text(u.raw_app_meta_data->'roles'))
);
```

   Also check: exactly **one** user holds `platform_owner`.
5. **UX** (Dominion login):
   - Add **Sign in with Google** (OWN-M3).
   - Keep the public message generic. After 2 consecutive role-mismatch sign-ins from the same browser, show: *"This account doesn't have access to Roam Dominion. If you recently changed the owner account, sign in with the new owner email."* This message confirms nothing about the password, because both cases already passed it.
   - Show "attempts remaining" before a lockout, as the Fleet login already does.

---

## 7. Verification checklist (after the fix)

| # | Check | Expected |
|---|---|---|
| V1 | Sign in to roamdominion.co as `deekiiiiiii@gmail.com` (new password or Google) | Dashboard loads |
| V2 | Same, as `sadikithomas@hotmail.com` | "Incorrect credentials"; **not** rate-limited after 5 tries (OWN-M1) |
| V3 | Same, as `prodigiousinvestments101@gmail.com` | Refused |
| V4 | Sign up a throwaway user, run `supabase.auth.updateUser({ data: { role: 'superadmin' } })`, try Dominion and `/rate-limit-stats` | Both refused |
| V5 | `POST …/fleet-core/make-server-37f42386/recover-platform-owner` | 404 |
| V6 | Fleet portal (roamfleet) as `deekiiiiiii@gmail.com` | Works, customer-approve still works |
| V7 | Other admin portals (driver, rides, haul, enterprise, courier/dash) as `deekiiiiiii@gmail.com` | Work (already true today) |
| V8 | Driver app as `sadikithomas@hotmail.com` | Works as a driver (if intended) |
| V9 | Consistency SQL in §6.4 | 0 rows; exactly one `platform_owner` |
| V10 | `fleet-core` function logs during V1–V3 | Reason codes logged; no `KV record` lines |

---

## 8. What was not changed

No code, no database rows and no settings were changed during this audit. All queries were `SELECT`s and log reads.
