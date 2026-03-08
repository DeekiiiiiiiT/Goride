# IDEA_2: Customer Accounts Enhancement Plan (Super Admin Portal)

## Source Analysis: IDEA_1.md vs Current System

### What ALREADY EXISTS (skip — would be redundant):
| IDEA_1 Feature | Current State |
|---|---|
| Page title + counter badge | Already shows "X fleet manager organizations" |
| Global search by name/email | Already implemented |
| Business type filter dropdown | Already implemented (all 5 types always shown) |
| Sortable table columns | Already implemented (6 sortable columns) |
| User table (Name, Email, BizType, Signed Up, Last Active, Status) | Already implemented |
| Collapsible sidebar | Already exists in AdminLayout |
| Top header bar | Already exists |
| `POST /update-user` server endpoint | Already exists (updates name & role in user_metadata) |
| `POST /delete-user` server endpoint | Already exists |

### What I'd SKIP from IDEA_1 (not applicable to this system):
| IDEA_1 Feature | Reason to Skip |
|---|---|
| "Invite User" button | System uses self-signup. Fleet managers register themselves. An invite flow is a large separate feature that doesn't match the current auth architecture. |
| "All Roles" filter | In the super admin context, ALL listed users are fleet managers (role="admin"). Only one role is being displayed, so this filter would never filter anything. |
| "Department/Location" filter | No department or location concept exists in the user data model. |
| "MFA Status" column | MFA is not implemented anywhere in the system. Adding it would just show "Off" for every single row — no value. |
| Bulk Actions (Select All, Bulk Delete, Bulk Update Role) | Too risky for a production system with active drivers. Bulk delete is dangerous. Bulk role update is meaningless (all users are the same role). Could revisit later if the user base grows significantly. |
| Zebra striping | Minor cosmetic preference, not a feature enhancement. |

---

## Recommended Enhancements (6 Phases)

### Phase 1: Row-Level Actions Column
**What:** Add an "Actions" column to the table with:
- **Edit button** (pencil icon) — opens a modal to edit Name and Business Type (wires to the existing `POST /update-user` endpoint)
- **More Options button** (three-dot icon) — opens a dropdown menu with additional actions

**Why:** Currently there's no way to take action on a customer from this page. The edit-user endpoint exists on the server but isn't wired into Customer Accounts.

**Details:**
- Edit modal: pre-fills Name and Business Type, allows saving changes
- The dropdown menu items will be added in subsequent phases

---

### Phase 2: Status Filter Dropdown
**What:** Add a second filter dropdown next to "All Types" for filtering by status: "All Statuses", "Active", "Inactive"

**Why:** As the customer base grows, quickly finding inactive accounts matters. Currently you can only filter by business type.

**Details:**
- Simple dropdown alongside the existing business type filter
- Filters the already-loaded data (no new server endpoint needed)

---

### Phase 3: More Options Dropdown Actions
**What:** Populate the three-dot dropdown menu (from Phase 1) with:
1. **Reset Password** — Triggers a password reset email via Supabase's `resetPasswordForEmail()` admin API
2. **Force Logout** — Terminates all active sessions for the user via Supabase's `admin.signOut()` API
3. **Suspend Account** / **Reactivate Account** — Toggles the user's banned status via Supabase's `admin.updateUserById({ ban_duration })` API

**Why:** These are essential admin operations for managing fleet customers. Currently the super admin has no way to handle a compromised account, a forgotten password request, or a delinquent customer.

**Details:**
- **Reset Password**: New server endpoint `POST /admin/reset-password` — calls `supabase.auth.admin.generateLink({ type: 'recovery', email })` or `supabase.auth.resetPasswordForEmail(email)`
- **Force Logout**: New server endpoint `POST /admin/force-logout` — calls `supabase.auth.admin.signOut(userId)` 
- **Suspend/Reactivate**: New server endpoint `POST /admin/toggle-suspend` — calls `supabase.auth.admin.updateUserById(userId, { ban_duration })`. Updates status badge to show "Suspended" (red) in the table.
- Each destructive action shows a confirmation modal before executing

---

### Phase 4: Confirmation Modals for Destructive Actions
**What:** Add confirmation modals for:
- Force Logout: "Force logout [User Name]? They will be removed from all active sessions."
- Suspend: "Suspend [User Name]'s account? They will be unable to log in until reactivated."
- Reactivate: "Reactivate [User Name]'s account?"

**Why:** Prevents accidental clicks on destructive operations in a production system with active users.

**Details:**
- Reusable modal component with customizable title, message, confirm/cancel buttons
- Confirm button shows loading state while the server request is in flight
- Toast notification on success/failure

---

### Phase 5: Export Customer List
**What:** Add an "Export" button next to the Refresh button that downloads the currently filtered/sorted customer list as a CSV file.

**Why:** Useful for reporting, auditing, and offline analysis of the customer base.

**Details:**
- Exports whatever is currently visible (respects search + filter + sort)
- Columns: Name, Email, Business Type, Signed Up, Last Active, Status
- Client-side CSV generation (no new server endpoint needed)
- Downloads as `roam-fleet-customers-YYYY-MM-DD.csv`

---

### Phase 6: Pagination
**What:** Add pagination controls below the table: "Rows per page" dropdown (10/25/50) and prev/next page navigation.

**Why:** Scalability. Currently all customers render at once. As the customer base grows past 50+, performance and usability will degrade.

**Details:**
- Client-side pagination of the already-fetched data
- Shows "Showing X-Y of Z results"
- Preserves current sort/filter state across page changes
- Default: 10 rows per page

---

## Build Order & Testing Checkpoints

| Phase | Dependencies | Browser Test Checkpoint |
|---|---|---|
| Phase 1 | None | Verify edit modal opens, pre-fills data, saves successfully, table refreshes |
| Phase 2 | None (can be parallel with Phase 1) | Verify status filter works, combines with search + biz type filter |
| Phase 3 | Phase 1 (needs the dropdown) | Verify each action calls the correct endpoint, success/error toasts |
| Phase 4 | Phase 3 (needs the actions) | Verify modals appear before destructive actions, cancel works, confirm executes |
| Phase 5 | None (independent) | Verify CSV downloads with correct data, respects current filters |
| Phase 6 | None (independent) | Verify pagination controls, row count selector, page navigation |

## Notes
- Zero breakage priority: each phase is self-contained and the app stays 100% functional after each one
- No new database tables needed — all operations use Supabase Auth Admin API
- Phases 1, 2, 5, and 6 are frontend-only changes
- Phase 3 requires 3 new server endpoints
- Phase 4 is frontend-only (modals)
