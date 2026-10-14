# Rush Ops Console (`/admin`): what's left

**Rev 4 · 2026-10-13** · Every code item from Rev 3 is fixed. What remains is getting those fixes live, plus one small UI gap.

**Checks run:**
- Production: the migration is applied (all 3 SQL functions exist), and `delivery` is at v852.
- `tsc` through `apps/dash-customer`: 293 errors, back to the baseline. No new errors.
- `consoleAccess.test.ts`: 6 of 6 pass, and the test is now in `ci.yml`.
- Nothing was checked in a browser.

---

## 1. Deploy the fixes: an access leak is live now

`delivery` v852 went out at 18:05 Jamaica time. Your fixes to `consoleAccess.ts` and `consoleRoutes.ts` were saved at 23:03 and are still uncommitted. So production is running the console **without** them:

- **Courier staff can search every customer's name and email.** This is what your `canSeePeople` fix addresses.
- **Courier staff can read every store's audit log** (`/merchant-audit`).
- **Home's comparison and the audit date filter** are still the old versions.

**To do:** commit these four files and deploy `delivery`:
- `supabase/functions/delivery/admin/consoleAccess.ts`
- `supabase/functions/delivery/admin/consoleRoutes.ts`
- `supabase/functions/delivery/admin/consoleAccess.test.ts`
- `.github/workflows/ci.yml`

Your working tree also has unrelated parts-sourcing changes, including a new migration. Commit those separately so this deploy doesn't carry them.

## 2. One UI gap

- **The Audit log offers courier roles tabs they can't load.** Courier roles still see the **Pricing** and **Merchant** tabs (`pages/audit/AuditHubPage.tsx:57-63`). The server now refuses both, and the `.catch(() => setRows([]))` on line 49 hides the error, so the tabs look like there's simply no history. Show each tab only to roles that can open Pricing or Merchants, and show an error message rather than an empty list.

## 3. Before calling it done

After the deploy, click through each hub at desktop and 375px wide. Sign in as one role from each column of the role table: owner, ops, courier, In-House buyer, support and analyst. For each role, confirm that:
- search only returns what that role can open
- Home shows sales only to Finance roles, compared with the same time last week
- every badge count matches its list
