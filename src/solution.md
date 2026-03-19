# Portal Isolation Fix — Strict Credential Enforcement

## Problem Statement

Super admin credentials (and all platform-level roles) can currently log into the Fleet Manager portal at `/`. This violates the enterprise requirement that each portal only accepts credentials assigned to that portal. The Driver and Admin portals are already correctly locked down; the Fleet Manager portal is the gap.

### Root Cause Summary

| Layer | File | Current Behavior | Problem |
|---|---|---|---|
| Server login | `/supabase/functions/server/index.tsx` (`/fleet-login`) | Only blocks `driver` role (blacklist) | `superadmin`, `platform_owner`, `platform_support`, `platform_analyst` all pass through |
| Client rendering | `/App.tsx` (at `/` path) | Only redirects `driver` role to `/driver` | Platform roles fall through to the Fleet Manager dashboard |
| Session restoration | `/components/auth/AuthContext.tsx` | Restores ANY existing Supabase session | If a superadmin was logged into `/admin`, navigating to `/` auto-restores their session — bypassing `/fleet-login` entirely |
| Admin login recovery | `/supabase/functions/server/index.tsx` (`/admin-login`) | On failed login, resets the user's password and force-promotes to `superadmin` | Security concern for production — not directly related to the fleet portal gap, but needs hardening |

---

## Phase 1: Server-Side Fleet Login Hardening

**Goal:** The `/fleet-login` route should ONLY allow `admin` role users (fleet managers). All other roles are rejected with a generic error. This is the most critical fix because the server is the trust boundary.

### Step 1.1 — Identify the current role check

- **File:** `/supabase/functions/server/index.tsx`
- **Location:** Lines 10616–10627 inside the `/fleet-login` route handler
- **Current code logic:**
  ```
  const userRole = data?.user?.user_metadata?.role;
  if (userRole === 'driver') {
    // reject
  }
  ```
- **Problem:** This is a blacklist — it only blocks `driver`. Any other role (including `superadmin`, `platform_owner`, `platform_support`, `platform_analyst`, or even unknown/undefined roles) passes through.

### Step 1.2 — Switch from blacklist to whitelist

- **Change:** Replace the `if (userRole === 'driver')` check with a whitelist that ONLY allows `admin` role.
- **New logic:**
  ```
  const userRole = data?.user?.user_metadata?.role;
  if (userRole !== 'admin') {
    // Sign out the session immediately
    await anonClient.auth.signOut();
    // Record as failed attempt for rate limiting
    await recordFailedAttempt(clientIp, 'fleet');
    await recordFailedAttempt(email.toLowerCase(), 'fleet');
    // Return generic error — no hint about which portal to use
    return c.json({ error: "Invalid email or password." }, 401);
  }
  ```
- **Why whitelist:** If any new roles are added in the future, they are blocked by default. This is the enterprise-standard approach.

### Step 1.3 — Update the log message

- **Change:** The `console.log` inside the rejection block should say something like:
  ```
  console.log(`[FleetLogin] Non-fleet account ${email} (role: ${userRole}) rejected from fleet portal`);
  ```
- **Why:** The old message said "Driver account rejected" which is no longer accurate since we're rejecting all non-admin roles now.

### Step 1.4 — Verify no side effects

- The signup route (`/signup`) creates users with `role: 'admin'` — this is correct and won't be affected.
- The rate limiting logic (recording failures, clearing on success) stays unchanged.
- The session token return on success stays unchanged.

### Verification for Phase 1

After this change:
- Fleet manager (`role: admin`) logs into `/` — should work normally
- Driver (`role: driver`) logs into `/` — gets "Invalid email or password" (was already working, still works)
- Superadmin (`role: superadmin`) logs into `/` — gets "Invalid email or password" (NEW: was previously allowed)
- Platform support (`role: admin` with `resolvedRole: platform_support`) logs into `/` — need to verify how this role is stored. If their `user_metadata.role` is `admin`, they'd pass through. Need to check.

---

## Phase 2: Client-Side Fleet Portal Role Gate

**Goal:** Even if a session somehow exists (e.g., session restoration from browser storage), the client-side rendering at `/` should block non-fleet-manager roles with a silent sign-out, matching the pattern already used on `/driver` and `/admin`.

### Step 2.1 — Identify the current client-side logic

- **File:** `/App.tsx`
- **Location:** Lines 288–291
- **Current code logic:**
  ```
  if (role === 'driver') {
    window.location.href = '/driver';
    return <div>Redirecting to Driver Portal...</div>;
  }
  ```
- **Problem:** Only `driver` is handled. `superadmin` and platform roles fall through to the fleet manager dashboard.

### Step 2.2 — Add role gate for non-fleet-manager roles

- **Change:** After the `driver` redirect check, add a check for platform-level roles.
- **New logic (inserted after the driver redirect block):**
  ```
  // Enterprise gate: reject platform-level users from fleet portal
  const platformRoles = ['superadmin'];
  const platformSubRoles = ['platform_owner', 'platform_support', 'platform_analyst'];
  if (platformRoles.includes(role) || platformSubRoles.includes(resolvedRole || '')) {
    signOut();
    return <LoginPage />;
  }
  ```
- **Behavior:** Silent sign-out, then show the fleet login page with no error message. This matches the pattern already established on the `/driver` and `/admin` portals — no cross-portal hints.

### Step 2.3 — Consider edge case: role is undefined or null

- If a user somehow has no role in their metadata, they should NOT be allowed into the fleet dashboard.
- **Add an additional check:** If `role` is not `admin`, sign out. This makes the client-side a whitelist too.
- **Refined logic:**
  ```
  if (role !== 'admin') {
    signOut();
    return <LoginPage />;
  }
  ```
- **Caution:** Need to confirm that ALL fleet manager users have `role: 'admin'` in their `user_metadata`. This includes:
  - Fleet managers who signed up via `/signup`
  - Team members invited via the invitation flow
  - Users with client-level sub-roles (e.g., `fleet_viewer`, `fleet_dispatcher`)
  
  **These users should all have `user_metadata.role = 'admin'`** with their sub-role stored separately (in `resolvedRole` from KV). If any of them have a different top-level role, this whitelist would lock them out incorrectly.

### Step 2.4 — Verify the role resolution chain

- Check how `resolvedRole` is populated in `AuthContext.tsx` to ensure fleet sub-roles (`fleet_viewer`, `fleet_dispatcher`, etc.) still have `role = 'admin'` at the top level.
- If confirmed, the `role !== 'admin'` check is safe.

### Verification for Phase 2

After this change:
- Fleet manager with `role: admin` at `/` — renders fleet dashboard normally
- Fleet manager with sub-role (e.g., `fleet_viewer`, still `role: admin`) at `/` — renders fleet dashboard normally
- Superadmin at `/` (session restored from `/admin`) — silently signed out, sees fleet login page
- Platform support at `/` — silently signed out, sees fleet login page

---

## Phase 3: Session Isolation — Preventing Cross-Portal Session Bleed

**Goal:** Address the scenario where a user logs into one portal (e.g., `/admin`) and then manually navigates to another portal (e.g., `/`). Because Supabase stores the session in browser storage (shared across all paths on the same domain), the session auto-restores and bypasses the login route entirely.

### Step 3.1 — Understand the current session restoration flow

- **File:** `/components/auth/AuthContext.tsx`
- **Behavior:** On app mount, `supabase.auth.getSession()` is called. If a valid session exists in localStorage, it's restored — regardless of which portal created it.
- This means: if you log into `/admin` as superadmin, then type `/` in the browser bar, the app restores your superadmin session and (after Phase 2) signs you out. But this creates a brief flash and also signs you out of the admin portal.

### Step 3.2 — Evaluate whether Phase 2 is sufficient

- With Phase 2 in place, the client at `/` will catch the superadmin session and sign out. This means:
  - The user is signed out of ALL portals (Supabase session is global)
  - They'd need to log back into `/admin` too
- **Question:** Is this acceptable behavior, or should portals maintain independent sessions?

### Step 3.3 — Option A: Accept global sign-out (simpler, recommended for now)

- Phase 2's silent sign-out approach is the same pattern used on `/driver` and `/admin` already.
- If a superadmin accidentally navigates to `/`, they get signed out and can just go back to `/admin` and log in again.
- **Trade-off:** Minor inconvenience for the admin, but maintains strict isolation with zero code complexity.
- **Recommendation:** Go with this approach for now. It's what the `/driver` and `/admin` portals already do.

### Step 3.4 — Option B: True session isolation (future enhancement)

- Would require separate Supabase client instances per portal, each with its own storage key.
- Significantly more complex — would need changes to `AuthContext.tsx`, all login pages, and all API calls.
- **Recommendation:** Document as a future enhancement, don't implement now. The current architecture doesn't support it without major refactoring.

### Step 3.5 — Document the decision

- Add a code comment in `App.tsx` explaining why global sign-out is the chosen approach.
- This prevents future developers from "fixing" it back to a redirect.

### Verification for Phase 3

- Superadmin logged into `/admin`, navigates to `/` — gets signed out, sees fleet login page. Must re-login at `/admin`.
- Fleet manager logged into `/`, navigates to `/admin` — gets signed out (already working), sees admin login page.
- Driver logged into `/driver`, navigates to `/` — gets signed out (Phase 2 handles `role !== 'admin'`), sees fleet login page.

---

## Phase 4: Admin Login Route Hardening & Final Verification

**Goal:** Clean up the auto-recovery mechanism in `/admin-login` and perform a comprehensive cross-portal verification.

### Step 4.1 — Audit the admin-login auto-recovery mechanism

- **File:** `/supabase/functions/server/index.tsx`
- **Location:** Lines 10762–10792 inside the `/admin-login` route handler
- **Current behavior:** When login fails, the route:
  1. Searches ALL users by email using `admin.listUsers()`
  2. If found, resets their password to whatever was submitted
  3. Force-sets their `user_metadata.role` to `superadmin`
  4. Retries the login
- **Security concerns:**
  - A fleet manager's password could be overwritten if they try to log in at `/admin`
  - The password reset happens before role verification
  - `admin.listUsers()` with `perPage: 1000` is expensive and could be used for enumeration timing attacks

### Step 4.2 — Harden the auto-recovery mechanism

- **Option A (Recommended):** Remove the auto-recovery entirely. The superadmin account is created during setup and should not need password auto-reset in production.
- **Option B (If keeping):** Move the role check BEFORE the password reset. Only reset password if the user's existing role is already `superadmin` or a platform role.
- **Decision:** Will confirm with you before proceeding.

### Step 4.3 — Final cross-portal verification matrix

After all phases are complete, verify the following 12 scenarios:

| # | User Role | Portal | Login Route | Expected Result |
|---|---|---|---|---|
| 1 | `admin` (fleet manager) | `/` | `/fleet-login` | SUCCESS — fleet dashboard |
| 2 | `admin` (fleet manager) | `/driver` | `/driver-login` | REJECTED — "Invalid email or password" |
| 3 | `admin` (fleet manager) | `/admin` | `/admin-login` | REJECTED — "Invalid email or password" |
| 4 | `driver` | `/` | `/fleet-login` | REJECTED — "Invalid email or password" |
| 5 | `driver` | `/driver` | `/driver-login` | SUCCESS — driver dashboard |
| 6 | `driver` | `/admin` | `/admin-login` | REJECTED — "Invalid email or password" |
| 7 | `superadmin` | `/` | `/fleet-login` | REJECTED — "Invalid email or password" |
| 8 | `superadmin` | `/driver` | `/driver-login` | REJECTED — "Invalid email or password" |
| 9 | `superadmin` | `/admin` | `/admin-login` | SUCCESS — admin dashboard |
| 10 | `platform_support` | `/` | `/fleet-login` | REJECTED — "Invalid email or password" |
| 11 | `platform_support` | `/driver` | `/driver-login` | REJECTED — "Invalid email or password" |
| 12 | `platform_support` | `/admin` | `/admin-login` | SUCCESS — admin dashboard |

### Step 4.4 — Session bleed verification (6 scenarios)

| # | Logged In At | Navigate To | Expected Result |
|---|---|---|---|
| 1 | `/admin` (superadmin) | `/` | Silent sign-out, fleet login page |
| 2 | `/admin` (superadmin) | `/driver` | Silent sign-out, driver login page |
| 3 | `/` (fleet manager) | `/admin` | Silent sign-out, admin login page |
| 4 | `/` (fleet manager) | `/driver` | Silent sign-out, driver login page |
| 5 | `/driver` (driver) | `/` | Silent sign-out, fleet login page |
| 6 | `/driver` (driver) | `/admin` | Silent sign-out, admin login page |

### Step 4.5 — Update IDEA_3.md test checklist

- Add the 12 login scenarios and 6 session bleed scenarios to the test checklist under a new section: "Portal Isolation Tests".

---

## Implementation Order

| Phase | What Changes | Files Modified | Risk Level |
|---|---|---|---|
| **Phase 1** | Server-side `/fleet-login` whitelist | `index.tsx` (server) | LOW — only changes one `if` condition | ✅ COMPLETE |
| **Phase 2** | Client-side role gate at `/` | `App.tsx` | LOW — adds one guard before existing code | ✅ COMPLETE |
| **Phase 3** | Session isolation decision + comments | `App.tsx` (comments only) | NONE — documentation only | ✅ COMPLETE |
| **Phase 4** | Admin-login hardening + verification | `index.tsx` (server) + verification | MEDIUM — modifying admin login recovery | ✅ COMPLETE (Option A: auto-recovery removed) |

**Each phase will be implemented only after explicit confirmation from the project owner.**