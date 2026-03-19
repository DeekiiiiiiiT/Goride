# Platform Settings Enhancement — Analysis & Recommendations

**Date:** March 18, 2026
**Status:** Investigation complete, awaiting confirmation before implementation

---

## Current State

The Platform Settings page (`/components/admin/PlatformSettings.tsx`) currently has **4 sections**:

1. **General** — Platform name, currency, timezone, version, maintenance mode toggle
2. **Business Types** — Toggle which fleet types appear on the signup form
3. **System Information** — Read-only fields (admin email, role, environment, backend, last saved)
4. **Security** — Static display of 4 API key slots (OpenAI, Gemini, Google Maps, Supabase Service Role)

### Identified Gaps (compared to the rest of the app)

| # | Gap | Why it matters |
|---|-----|---------------|
| 1 | **Maintenance mode toggle exists but is never enforced** — the server has no middleware that checks `maintenanceMode` and blocks non-admin requests when it's on. | Toggle is decorative. Flipping it does nothing. Drivers and fleet managers can still use the app. |
| 2 | **No feature flag controls** — Fuel Management, Toll Management, and Driver Portal features can't be toggled on/off globally. | You can't soft-launch or temporarily disable a module without code changes. |
| 3 | **No notification/announcement settings** — `BroadcastMessageModal` exists on the fleet side but there's no platform-level broadcast to reach ALL fleet managers and drivers at once. | No way to announce scheduled downtime, new features, or policy changes from the admin portal. |
| 4 | **No registration controls** — No invite-only mode, no auto-approval toggle, no domain allowlist for fleet manager signup. | Anyone with the signup URL can create an account. No gating mechanism for the platform owner. |
| 5 | **No session/security policies** — No configurable session timeout, no max login attempts, no password policy (min length, complexity). | Security section is view-only. Can't enforce organizational security requirements. |
| 6 | **No branding/white-label options** — No platform logo upload, no accent color picker, no custom login page message. | Settings page controls nothing visual — the brand is hardcoded. |
| 7 | **No data retention / export** — No config for how long KV data is kept, no "Export all data" button, no scheduled cleanup. | As the platform grows, there's no housekeeping. DataResetModal exists but is hidden from admin settings. |
| 8 | **No driver app configuration** — Driver portal has its own layout/theme but the platform owner can't configure allowed expense categories, weekly check-in schedule, or claim time limits. | Driver-facing rules are hardcoded. Fleet managers may need different policies. |
| 9 | **Settings changes not audited** — Phase 8 added audit logging for user actions, but saving platform settings doesn't create an audit entry. | No accountability trail when someone changes the currency or toggles maintenance mode. |
| 10 | **No danger zone** — `DataResetModal` and `SystemHardeningPanel` exist in the codebase but are only accessible from the fleet-side settings. The admin portal has no equivalent. | Platform owner can't purge test data or run system health checks from the admin portal. |
| 11 | **Currency/timezone settings are decorative** — These values are saved to KV but no other part of the app reads them to format amounts or convert times. | Changing currency from JMD to USD has zero effect anywhere. |

---

## Recommended Enhancements (6 phases, ordered by impact)

### Phase A: Enforce Maintenance Mode + Feature Flags
**Impact: High | Effort: Medium**

Add a new section **"Feature Controls"** to Platform Settings:

1. **Maintenance Mode enforcement** — Add server middleware that checks `platform-settings` KV for `maintenanceMode: true`. When enabled:
   - All non-admin API routes return `503 Service Unavailable` with a message
   - Frontend shows a full-screen "Under Maintenance" page for non-platform users
   - Platform owner/support can still access everything normally
   
2. **Module toggles** — Add on/off switches for:
   - Fuel Management (stations + analytics)
   - Toll Management (stations + info)
   - Driver Portal (self-service features)
   - Fleet Equipment tracking
   - Claimable Loss system
   
   When disabled: the module's sidebar entry hides for ALL users (fleet + driver side), and its API routes return `403 Feature disabled`.

3. **Audit integration** — Log every settings change to the Phase 8 audit trail (`action: 'update_platform_settings'` with details of what changed).

### Phase B: Registration & Onboarding Controls
**Impact: High | Effort: Small**

Add a new section **"Registration"** to Platform Settings:

1. **Registration mode** — Radio group:
   - `open` — Anyone can sign up (current behavior)
   - `invite_only` — Signup page shows "Contact administrator" message. Only admin-created accounts work.
   - `domain_restricted` — Only emails from specified domains can register (e.g., `@myfleet.com`)

2. **Allowed domains** — Text input (comma-separated domains), only visible when mode is `domain_restricted`.

3. **Default fleet settings** — When admin creates a new customer account, these are auto-applied:
   - Default currency (from General section)
   - Default timezone (from General section)

4. **Enforce on the server** — `POST /signup` and `POST /admin/create-customer` check registration mode before allowing account creation.

### Phase C: Security Policies
**Impact: High | Effort: Medium**

Enhance the existing **"Security"** section:

1. **Password policy**:
   - Minimum length (default: 8, range: 8-32)
   - Require uppercase, number, special character (toggles)
   
2. **Session timeout** — Dropdown: 1 hour / 4 hours / 8 hours / 24 hours / 7 days / Never
   - Stored in KV, read by frontend `AuthContext` to auto-logout

3. **Max login attempts** — Number input (default: 10). After N failed attempts, account is temporarily locked for 15 minutes.
   - Server-side: track attempts in KV per email, check before authenticating

4. **Force all users to re-login** — A "Terminate All Sessions" button that calls Supabase's admin signOut for every user. Useful after a security incident.

### Phase D: Platform Announcements
**Impact: Medium | Effort: Medium**

Add a new section **"Announcements"** to Platform Settings:

1. **Active banner message** — A text field + color selector (info/warning/critical). When set:
   - Every fleet manager and driver sees a dismissible banner at the top of their dashboard
   - Frontend reads this from `GET /platform-settings` (public, cached 5 min)

2. **Banner scheduling** — Optional start date and end date. Banner auto-shows/hides.

3. **Banner preview** — Live preview of what the banner looks like before saving.

### Phase E: Branding & Appearance
**Impact: Medium | Effort: Medium**

Add a new section **"Branding"** to Platform Settings:

1. **Platform logo** — Upload (stored in Supabase Storage bucket `make-37f42386-branding`). Shown on:
   - Login page
   - Admin sidebar header
   - Fleet dashboard header
   - Driver portal header

2. **Accent color** — Color picker that sets the primary action color. Stored as a hex value, applied via CSS custom property override.

3. **Login page message** — Custom welcome text shown below the login form.

4. **Favicon** — Upload a small icon for the browser tab.

### Phase F: Danger Zone + Data Management
**Impact: Medium | Effort: Small**

Add a new section **"Danger Zone"** (red-bordered, bottom of settings):

1. **Purge test data** — Button that opens `DataResetModal` (already exists, just needs to be wired in). Deletes KV entries by prefix (fuel, toll, trips, etc.) while preserving user accounts.

2. **Export all data** — Generates a JSON download of all KV entries grouped by prefix. Useful for backup before destructive operations.

3. **System health check** — Inline version of `SystemHardeningPanel` (already exists). Shows KV row count, Supabase connection status, edge function latency.

4. **Reset platform settings** — Button to restore all settings to defaults (with confirmation).

---

## Summary

| Phase | Section | New settings | Server changes | Effort |
|-------|---------|-------------|---------------|--------|
| A | Feature Controls | 6 toggles + middleware enforcement | Maintenance middleware, feature flag middleware | Medium |
| B | Registration | 3 controls + domain list | Signup gate check | Small |
| C | Security Policies | 4 controls | Password validation, session management, lockout | Medium |
| D | Announcements | Banner text + color + dates | Public banner endpoint | Medium |
| E | Branding | Logo + color + message + favicon | Storage bucket + public branding endpoint | Medium |
| F | Danger Zone | 4 buttons | Export endpoint, health endpoint | Small |

**Total: 6 phases, ~20 new settings, ~6 new server endpoints/middleware**

**Recommendation:** Start with Phase A (feature flags + maintenance enforcement) because the maintenance toggle already exists but does nothing — that's a usability gap that could confuse you. Phase B (registration controls) is second because invite-only mode is a common enterprise requirement. The rest can follow in any order based on your priorities.

**Ready to begin on your confirmation.**
