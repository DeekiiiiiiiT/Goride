# RBAC Testing Checklist — Roam Fleet

> Use this checklist to verify every piece of the 11-phase RBAC implementation.
> Work through each section in order. Check the box when you confirm it works.
> If something fails, note the exact error and stop — do not continue to later sections.

---

## Prerequisites

Before testing, you need accounts for each role. Here's how to set them up:

| # | Role | How to create |
|---|------|---------------|
| 1 | **platform_owner** | Your existing `superadmin` account (auto-mapped) |
| 2 | **platform_support** | Invite via admin portal or call `POST /admin/team/invite` with `role: "platform_support"` |
| 3 | **platform_analyst** | Invite via admin portal or call `POST /admin/team/invite` with `role: "platform_analyst"` |
| 4 | **fleet_owner** | Your existing `admin` account (auto-mapped), or sign up as a new fleet manager |
| 5 | **fleet_manager** | Invite from fleet_owner account via Team Management (`POST /team/invite`) |
| 6 | **fleet_accountant** | Invite from fleet_owner account via Team Management |
| 7 | **fleet_viewer** | Invite from fleet_owner account via Team Management |
| 8 | **driver** | Sign up as a driver, or create one from the Drivers page |

Save the email + password for each account somewhere safe. You'll be logging in and out repeatedly.

---

## Section 1: Role Resolution (Phase 1)

These verify that legacy role values are correctly mapped to new canonical roles.

- [ ] **1.1** Log in with your `superadmin` account. The app should treat you as `platform_owner` internally (no visible change — same access as before).
- [ ] **1.2** Log in with an `admin` account. The app should treat you as `fleet_owner` internally (no visible change — same access as before).
- [ ] **1.3** Log in with a `driver` account. You should see the Driver Portal, not the fleet dashboard.

---

## Section 2: Sidebar Visibility (Phase 3)

Log in as each fleet-side role and verify the sidebar shows only the correct items.

- [ ] **2.1 fleet_owner** — All sidebar items visible (Dashboard, Drivers, Vehicles, Trips, Fuel, Tolls, Transactions, Reports, Alerts, Team Management, Settings).
- [ ] **2.2 fleet_manager** — Same as fleet_owner EXCEPT: Settings should be hidden. Team Management should be hidden (unless they have `team.view` permission).
- [ ] **2.3 fleet_accountant** — Only Dashboard, Transactions, Reports, Fuel, and Tolls should be visible. Drivers, Vehicles, Trips, Alerts, Team Management, and Settings should be hidden.
- [ ] **2.4 fleet_viewer** — Only Dashboard and Reports should be visible. Everything else hidden.
- [ ] **2.5 driver** — Should see the Driver Portal layout, not the fleet sidebar at all.

---

## Section 3: Page-Level Access Guard (Phase 4)

Try to access pages you shouldn't be able to see. The app should block you gracefully (show an "unauthorized" message or redirect), not crash.

- [ ] **3.1** As `fleet_viewer`, try navigating to the Drivers page (if you can construct the URL or state). You should be blocked.
- [ ] **3.2** As `fleet_accountant`, try navigating to Team Management. You should be blocked.
- [ ] **3.3** As `fleet_manager`, try navigating to Settings. You should be blocked.
- [ ] **3.4** As `fleet_owner`, all pages should load normally with no access errors.

---

## Section 4: Action-Level UI Gating (Phase 5)

These verify that buttons and actions are hidden or disabled for roles without permission.

### As fleet_owner:
- [ ] **4.1** You can see the "Add Driver" button on the Drivers page.
- [ ] **4.2** You can see the "Add Vehicle" button on the Vehicles page.
- [ ] **4.3** You can edit/delete trips, fuel entries, and toll entries.
- [ ] **4.4** You can see Settings and change company preferences.

### As fleet_manager:
- [ ] **4.5** You can see "Add Driver" and "Add Vehicle" buttons.
- [ ] **4.6** You can create trips and fuel entries.
- [ ] **4.7** You CANNOT see or access Settings.

### As fleet_accountant:
- [ ] **4.8** You can view Transactions and Reports.
- [ ] **4.9** You can view Fuel and Toll data.
- [ ] **4.10** You CANNOT add or edit drivers, vehicles, or trips.
- [ ] **4.11** You CANNOT see any "Add" or "Delete" buttons on pages you can access.

### As fleet_viewer:
- [ ] **4.12** You can view the Dashboard.
- [ ] **4.13** You can view Reports.
- [ ] **4.14** You CANNOT see any edit, add, or delete buttons anywhere.

---

## Section 5: Server-Side Route Protection (Phase 6)

These verify the backend enforces permissions even if someone bypasses the UI. Use your browser's developer tools (Network tab) or a tool like Postman/curl.

- [ ] **5.1** As `fleet_viewer`, try calling `POST /drivers` directly (with your auth token). The server should return `403 Forbidden`.
- [ ] **5.2** As `fleet_accountant`, try calling `DELETE /vehicles/:id` directly. The server should return `403 Forbidden`.
- [ ] **5.3** As `fleet_owner`, the same calls should succeed (assuming valid data).
- [ ] **5.4** With NO auth token (or the public anon key only), try calling a protected mutation route. The server should return `401 Unauthorized` or fall through gracefully (anon key graceful degradation).
- [ ] **5.5** As `fleet_manager`, try calling `PUT /settings` directly. The server should return `403 Forbidden`.

---

## Section 6: Multi-Tenant Organization Isolation (Phase 7)

This is the most critical section. It ensures one fleet owner's data is completely invisible to another.

### Setup:
Create two separate fleet_owner accounts (Fleet A and Fleet B). Each should have at least one driver, one vehicle, and a few trips/transactions.

### As Fleet A:
- [ ] **6.1** View Drivers — you see ONLY Fleet A's drivers.
- [ ] **6.2** View Vehicles — you see ONLY Fleet A's vehicles.
- [ ] **6.3** View Trips — you see ONLY Fleet A's trips.
- [ ] **6.4** View Transactions — you see ONLY Fleet A's transactions.
- [ ] **6.5** View Fuel entries — you see ONLY Fleet A's fuel data.
- [ ] **6.6** View Toll entries — you see ONLY Fleet A's toll data.
- [ ] **6.7** View Reports — reports are calculated from ONLY Fleet A's data.

### As Fleet B:
- [ ] **6.8** Repeat checks 6.1–6.7 for Fleet B. You should see ONLY Fleet B's data with zero overlap.

### Cross-contamination check:
- [ ] **6.9** The total number of drivers visible to Fleet A + Fleet B should NOT exceed the total drivers in the system (i.e., no shared drivers between the two fleets).
- [ ] **6.10** Try to access a specific driver from Fleet A while logged in as Fleet B (e.g., by guessing or copying the driver ID in a direct API call). The server should return `403` or `404`.

---

## Section 7: Signup & Registration (Phase 8)

- [ ] **7.1** Sign up a new fleet manager (admin) account via the login page. After signup, verify the account has `organizationId` set to their own user ID (self-referencing).
- [ ] **7.2** Sign up a new driver account. Verify the driver does NOT have an `organizationId` (they are unlinked).
- [ ] **7.3** Log in with the newly created fleet manager. They should see an empty dashboard (no data yet) — not another fleet's data.
- [ ] **7.4** Log in with the newly created driver. They should see the Driver Portal.

---

## Section 8: Team Invitation System (Phase 9)

### Inviting team members (as fleet_owner):
- [ ] **8.1** Go to Team Management. Click "Invite Member."
- [ ] **8.2** Enter a name, email, and select role `fleet_manager`. Submit.
- [ ] **8.3** A temporary password is shown. Copy it.
- [ ] **8.4** The new member appears in the team list with the correct role badge.

### Invited member experience:
- [ ] **8.5** Log in with the invited fleet_manager's email + temporary password. It should work.
- [ ] **8.6** The fleet_manager should see the same fleet data as the fleet_owner (same organization).
- [ ] **8.7** The fleet_manager's sidebar should match Section 2.2 (no Settings, etc.).

### Role management:
- [ ] **8.8** As fleet_owner, change the fleet_manager's role to `fleet_accountant` via Team Management.
- [ ] **8.9** The member's role badge should update.
- [ ] **8.10** Have the member refresh their page. Their sidebar and permissions should now match `fleet_accountant`.

### Remove member:
- [ ] **8.11** As fleet_owner, remove a team member.
- [ ] **8.12** The member disappears from the team list.

### Permission checks:
- [ ] **8.13** As `fleet_manager`, you should NOT be able to invite team members (no "Invite Member" button visible).
- [ ] **8.14** As `fleet_viewer`, you should NOT be able to see Team Management at all.

### Role restrictions (invite different roles):
- [ ] **8.15** Invite a `fleet_accountant`. Verify they see only financial pages.
- [ ] **8.16** Invite a `fleet_viewer`. Verify they see only Dashboard + Reports.

---

## Section 9: Driver-Organization Linking (Phase 10)

### Creating a linked driver:
- [ ] **9.1** As fleet_owner, go to Drivers page and click "Add Driver."
- [ ] **9.2** Fill in details including email and password. Submit.
- [ ] **9.3** The driver should appear in your driver list.
- [ ] **9.4** Log in as that driver. They should see the Driver Portal.

### Claiming an unlinked driver:
- [ ] **9.5** First, sign up a driver account independently (via signup page).
- [ ] **9.6** As fleet_owner, click "Claim Driver" on the Drivers page.
- [ ] **9.7** Enter the driver's email. Submit.
- [ ] **9.8** Success message appears. The driver is now linked to your organization.
- [ ] **9.9** The driver now appears in your Drivers list.
- [ ] **9.10** A DIFFERENT fleet_owner should NOT see this claimed driver.

### Error cases:
- [ ] **9.11** Try to claim a driver who is already linked to another org. You should get an error: "This driver is already linked to an organization."
- [ ] **9.12** Try to claim an email that doesn't exist. You should get an error: "No account found."
- [ ] **9.13** Try to claim someone whose role is NOT `driver` (e.g., a fleet_manager). You should get an error about wrong role.
- [ ] **9.14** Try to add a driver with an email that already exists. You should get a 409 error suggesting "Use Claim Driver."

---

## Section 10: Platform Sub-Roles — Admin Portal (Phase 11)

### Admin portal access:
- [ ] **10.1** Log in as `platform_owner` (superadmin) and go to `/admin`. Full admin portal loads with all sidebar items.
- [ ] **10.2** Log in as `platform_support` and go to `/admin`. Portal loads with Dashboard, Customer Accounts, Station Database, Fuel Analytics, Toll Database, and Toll Info — but NO Platform Settings.
- [ ] **10.3** Log in as `platform_analyst` and go to `/admin`. Portal loads with ONLY Dashboard visible in the sidebar.
- [ ] **10.4** Log in as `fleet_owner` and go to `/admin`. You should see the "Unauthorized" page — fleet roles cannot access the admin portal.
- [ ] **10.5** Log in as `driver` and go to `/admin`. You should see the "Unauthorized" page.

### Admin portal actions (CustomerAccounts):
- [ ] **10.6** As `platform_owner`, open Customer Accounts. You should see the edit (pencil) icon, the dropdown menu with Reset Password, Force Logout, and Suspend/Reactivate.
- [ ] **10.7** As `platform_support`, open Customer Accounts. The edit (pencil) icon should be HIDDEN. The dropdown should show Reset Password, Force Logout, and Suspend/Reactivate.
- [ ] **10.8** As `platform_analyst`, you should NOT be able to navigate to Customer Accounts at all (it's not in your sidebar).

### Role badge in sidebar footer:
- [ ] **10.9** As `platform_owner`, the badge should say "Super Admin."
- [ ] **10.10** As `platform_support`, the badge should say "Support."
- [ ] **10.11** As `platform_analyst`, the badge should say "Analyst."

### Platform team invites:
- [ ] **10.12** As `platform_owner`, call `POST /admin/team/invite` with `{ email, name, role: "platform_support" }`. It should succeed and return a temporary password.
- [ ] **10.13** As `platform_support`, try calling the same invite endpoint. You should get `403 Forbidden`.
- [ ] **10.14** Try inviting with an invalid role (e.g., `"fleet_owner"`). You should get an error about invalid platform role.

---

## Section 11: Edge Cases & Regression

These are final checks to make sure nothing is broken for existing users.

- [ ] **11.1** Log in with your original `superadmin` account. Everything works exactly as before in the admin portal.
- [ ] **11.2** Log in with your original `admin` (fleet_owner) account. Everything works exactly as before in the fleet dashboard.
- [ ] **11.3** Log in as a `driver`. The Driver Portal works exactly as before — trip tracking, fuel logging, everything.
- [ ] **11.4** Create a new trip as fleet_owner. It saves correctly.
- [ ] **11.5** Create a new fuel entry as fleet_owner. It saves correctly.
- [ ] **11.6** The Dashboard loads without errors for fleet_owner.
- [ ] **11.7** Reports generate correctly for fleet_owner.
- [ ] **11.8** No console errors appear during normal usage for any role.

### Session & auth edge cases:
- [ ] **11.9** Log out and log back in. Your role is preserved and the correct UI appears immediately.
- [ ] **11.10** Open the app in a new incognito window (no session). You should see the login page, not an error.
- [ ] **11.11** After changing a team member's role (Section 8.8), have them log out and back in. Their new role should be active.

---

## Section 12: Portal Isolation Tests (Phase 1–4 Fix)

These verify that each portal's login route only accepts credentials for that portal's intended roles, and that cross-portal session bleed is handled correctly via silent sign-out.

> **Background:** Phases 1–4 in `/solution.md` fixed a critical RBAC gap where platform-level credentials (superadmin, platform_support, etc.) could access the Fleet Manager portal at `/`. These 18 tests confirm the fix is airtight.

### Login route isolation (12 scenarios):

| # | User Role | Portal | Login Route | Expected Result |
|---|-----------|--------|-------------|-----------------|
| 12.1 | `admin` (fleet manager) | `/` | `/fleet-login` | SUCCESS |
| 12.2 | `admin` (fleet manager) | `/driver` | `/driver-login` | REJECTED |
| 12.3 | `admin` (fleet manager) | `/admin` | `/admin-login` | REJECTED |
| 12.4 | `driver` | `/` | `/fleet-login` | REJECTED |
| 12.5 | `driver` | `/driver` | `/driver-login` | SUCCESS |
| 12.6 | `driver` | `/admin` | `/admin-login` | REJECTED |
| 12.7 | `superadmin` | `/` | `/fleet-login` | REJECTED |
| 12.8 | `superadmin` | `/driver` | `/driver-login` | REJECTED |
| 12.9 | `superadmin` | `/admin` | `/admin-login` | SUCCESS |
| 12.10 | `platform_support` | `/` | `/fleet-login` | REJECTED |
| 12.11 | `platform_support` | `/driver` | `/driver-login` | REJECTED |
| 12.12 | `platform_support` | `/admin` | `/admin-login` | SUCCESS |

- [ ] **12.1** Log in as `admin` (fleet manager) at `/`. Fleet dashboard loads normally.
- [ ] **12.2** Log in as `admin` (fleet manager) at `/driver`. You get "Invalid email or password."
- [ ] **12.3** Log in as `admin` (fleet manager) at `/admin`. You get "Invalid email or password."
- [ ] **12.4** Log in as `driver` at `/`. You get "Invalid email or password."
- [ ] **12.5** Log in as `driver` at `/driver`. Driver Portal loads normally.
- [ ] **12.6** Log in as `driver` at `/admin`. You get "Invalid email or password."
- [ ] **12.7** Log in as `superadmin` at `/`. You get "Invalid email or password."
- [ ] **12.8** Log in as `superadmin` at `/driver`. You get "Invalid email or password."
- [ ] **12.9** Log in as `superadmin` at `/admin`. Admin dashboard loads normally.
- [ ] **12.10** Log in as `platform_support` at `/`. You get "Invalid email or password."
- [ ] **12.11** Log in as `platform_support` at `/driver`. You get "Invalid email or password."
- [ ] **12.12** Log in as `platform_support` at `/admin`. Admin dashboard loads normally.

### Session bleed isolation (6 scenarios):

These test what happens when a user is already logged into one portal and manually navigates to a different portal's URL. The expected behavior is a silent sign-out (global Supabase session cleared) followed by that portal's login page appearing — no redirect to another portal, no error flash.

- [ ] **12.13** Logged in at `/admin` as superadmin → navigate to `/`. You are silently signed out and see the fleet login page.
- [ ] **12.14** Logged in at `/admin` as superadmin → navigate to `/driver`. You are silently signed out and see the driver login page.
- [ ] **12.15** Logged in at `/` as fleet manager → navigate to `/admin`. You are silently signed out and see the admin login page.
- [ ] **12.16** Logged in at `/` as fleet manager → navigate to `/driver`. You are silently signed out and see the driver login page.
- [ ] **12.17** Logged in at `/driver` as driver → navigate to `/`. You are silently signed out and see the fleet login page.
- [ ] **12.18** Logged in at `/driver` as driver → navigate to `/admin`. You are silently signed out and see the admin login page.

> **Note:** After any silent sign-out, you will need to log back in at whichever portal you were using before. This is expected — Supabase uses a single global session, so signing out at one portal signs out everywhere. See Phase 3 in `/solution.md` for the design rationale.

---

## Summary Score

Count the checkboxes you passed:

| Section | Tests | Passed |
|---------|-------|--------|
| 1. Role Resolution | 3 | /3 |
| 2. Sidebar Visibility | 5 | /5 |
| 3. Page-Level Guard | 4 | /4 |
| 4. Action-Level Gating | 14 | /14 |
| 5. Server-Side Protection | 5 | /5 |
| 6. Multi-Tenant Isolation | 10 | /10 |
| 7. Signup & Registration | 4 | /4 |
| 8. Team Invitations | 16 | /16 |
| 9. Driver-Org Linking | 14 | /14 |
| 10. Platform Sub-Roles | 14 | /14 |
| 11. Edge Cases & Regression | 11 | /11 |
| 12. Portal Isolation | 18 | /18 |
| **TOTAL** | **118** | **/118** |

**Target: 118/118 before considering RBAC complete and production-ready.**

If any test fails, stop and report the exact test number, what you expected, and what happened instead. We'll fix it before continuing.