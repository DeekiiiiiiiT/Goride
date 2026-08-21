# Roam Rush Partner — Team Members Audit

**Scope:** the "Team Members" screen in `@roam/dash-merchant` (Settings → Team), covering the invite panel shown in your screenshot, the current-team list, edit/remove, and the full invite-acceptance flow.
**Type:** Read-only audit. No application code was changed.
**Method:** traced the feature end-to-end — UI (`AddTeamMemberPanel.tsx`, `TeamMembersView.tsx`, `EditTeamMemberSheet.tsx`, `TeamInviteLandingPage.tsx`), the client hook (`useTeamMembers.ts`), the edge function (`supabase/functions/delivery/merchantTeam.ts`), the shared type package (`packages/merchant-ops/src/types/team.ts`), and the Postgres schema/RLS across all `merchant_team_*` migrations.

---

## Bottom line

**The core flow in your screenshot — owner invites an Admin by email — is real and functional, not a stub.** The edge function does proper server-side validation, invite tokens are single-use with expiry, the acceptance page (`/team-invite/:token`) handles expired/wrong-account/unconfirmed-email states, and RLS/ownership checks are enforced on every write. This is production-grade work, not scaffolding.

**"Flawlessly without fail" is not accurate yet.** I found **one contradiction that's live in the exact screen in your screenshot right now** (item 1 below — it fires the moment a partner picks "Staff" or "Manager" instead of "Admin"), one **silent-failure landmine that isn't reachable today but will break the moment a related feature ships** (item 2), and three **real but non-blocking gaps** that will generate support tickets rather than outright failures (items 3–5).

| # | Issue | Reachable today? | Severity |
|---|---|---|---|
| 1 | Role hint text contradicts the form for Staff/Manager in the partner app | **Yes, right now** | Confusing but not broken |
| 2 | "Manage inventory" permission passes UI validation but always fails on the server | Not yet (flag currently off for partners) | Will hard-fail once triggered |
| 3 | Form clears immediately on submit, before the server confirms success | Yes, always | Data-loss-on-error UX gap |
| 4 | No in-app way to recover if invite email delivery fails | Yes, if SMTP misconfigured in an environment | Support-ticket generator |
| 5 | A user account can belong to only one merchant's team, platform-wide | Yes, by design | Real limitation, not a bug |

Details below, each with exact file/line references so these are directly actionable.

---

## 1. Role hint contradicts the form (live bug, in your screenshot's screen)

`AddTeamMemberPanel.tsx` computes:

```
usesEmail = partnerOnly || !pinSignInEnabled || role === 'admin'
```

In the Partner app, `partnerOnly` is always `true` (set by [SettingsPage.tsx:167](apps/dash-merchant/src/pages/SettingsPage.tsx#L167)), so `usesEmail` evaluates to `true` **unconditionally** — regardless of which role is selected. The email field is shown and required for Staff and Manager too, not just Admin.

But the hint text directly above it, `ROLE_HINTS`, is role-specific and doesn't know that:

```
staff:   'Signs in with a PIN on the store tablet. No email needed.'
manager: 'Signs in with a PIN on the store tablet, then gets the full manager dashboard.'
admin:   'Receives an email invite for full back-office access on any device.'
```

**Reproduce:** open Team Members → Invite member → click **Staff**. The form shows "Signs in with a PIN on the store tablet. No email needed" — immediately above a required, greyed-out-until-filled email field. Same for Manager. Your screenshot happens to show Admin selected, which is the one role where the hint and the form agree — so the bug doesn't show in that screenshot, but it's one click away.

This isn't a crash — the invite still sends correctly by email regardless of role — but it directly contradicts what the screen tells the partner, which reads as "this is broken" to a first-time user. This is copy that was written for a PIN-based in-store flow (`pinSignInEnabled`) that isn't wired up for the partner app at all right now (see §5), and it wasn't updated for the partner-only code path.

**Fix shape:** `ROLE_HINTS` needs a `partnerOnly` variant, or the component needs to suppress/rewrite the hint when `usesEmail` is forced true by `partnerOnly`.

---

## 2. "Manage inventory" permission: UI allows it, server always rejects it

Three places define the permission set, and they disagree:

- `packages/merchant-ops/src/types/team.ts:3` — `TeamPermission = 'orders' | 'menu' | 'analytics' | 'payouts' | 'inventory'`, and `TEAM_PERMISSIONS` ([line 85](packages/merchant-ops/src/types/team.ts#L85)) lists all five, including `{ id: 'inventory', label: 'Manage inventory' }`.
- `supabase/functions/delivery/merchantAuth.ts:3` — same five-value type.
- `supabase/functions/delivery/merchantTeam.ts:21` — `VALID_TEAM_PERMISSIONS` is a runtime `Set` with only **four** values: `orders, menu, analytics, payouts`. `inventory` is missing.

Every invite-create and member-update route validates against that four-value set ([merchantTeam.ts:383](supabase/functions/delivery/merchantTeam.ts#L383) and [:543](supabase/functions/delivery/merchantTeam.ts#L543)) and returns `400 "Invalid permissions"` if `inventory` is included. TypeScript doesn't catch this because a `Set<TeamPermission>` is allowed to hold a subset of the type — there's no compiler link between the UI's permission list and the server's allow-list.

**Is this reachable today?** No. `AddTeamMemberPanel` only renders the "Manage inventory" checkbox when `inStoreEnabled` is `true`, and [SettingsPage.tsx:165–171](apps/dash-merchant/src/pages/SettingsPage.tsx#L165-L171) never passes `inStoreEnabled` to `TeamMembersView` — it defaults to `false`. So the checkbox is currently invisible in the Partner app, and this can't fire yet.

**Why it still matters:** the in-store/enterprise-inventory feature set clearly exists and is being built out elsewhere in this codebase (`merchantInventoryRoutes.ts`, `inventory_mode`, `enterprise_inventory_shadow`). The instant someone flips `inStoreEnabled` on for partner accounts — which looks like exactly the direction this feature is heading — every partner who checks "Manage inventory" while inviting or editing a team member will get a flat `400` and a support ticket, with no indication in the UI of which permission was the problem. This is worth fixing now, while it's a one-line change, rather than after it's live and confusing partners.

**Fix shape:** add `"inventory"` to `VALID_TEAM_PERMISSIONS` in `merchantTeam.ts` (it's already accepted by the CHECK-constraint-free `text[]` column, so this is purely an allow-list gap, not a schema change).

---

## 3. Form resets before the server confirms the invite succeeded

`AddTeamMemberPanel.tsx`'s submit handler:

```ts
const sent = onSendInvite({...});
if (sent) resetForm();
```

`onSendInvite` is wired to `useTeamMembers.ts`'s `sendInvite()`, which does client-side validation only (is the email non-empty), fires `inviteMutation.mutate({...})` **without awaiting it**, and returns `true` immediately:

```ts
inviteMutation.mutate({...});
return true;
```

So `resetForm()` runs the instant the button is clicked — before the network request even completes, let alone succeeds. Success/failure is only communicated afterward via a `sonner` toast (`onSuccess`/`onError` in the mutation). If the server rejects the invite — duplicate email (`409`), a pending invite already exists (`409`), invalid permissions (see §2), or a transient network error — the partner sees an error toast, but the form is already empty. They have to re-enter the name, role, email, and re-check every permission box from scratch.

This won't cause data corruption or a stuck state, but it's a real "flawless" gap: any server-side rejection costs the partner their input, with the only signal being a toast that can be easy to miss on a busy screen.

**Fix shape:** only call `resetForm()` inside the mutation's `onSuccess`, not synchronously in the submit handler.

---

## 4. No recovery path if the invite email doesn't send

`sendTeamInviteEmail` → `sendNotificationEmail` ([merchantAdminShared.ts:145](supabase/functions/delivery/admin/merchantAdminShared.ts#L145)) checks for `SMTP_HOST/PORT/USER/PASS` or a Resend API key; if none are configured for the environment, it logs `[email] SMTP not configured - skipping send` and returns `{ sent: false }`. This is handled gracefully as far as it goes — the invite row is still created, and the UI correctly shows `toast.warning('Invite saved but email could not be sent')` instead of silently pretending success.

What's missing: **there is no way for the owner to get the invite link to the invitee any other way.** Looking at the pending-invites list in `TeamMembersView.tsx` (lines ~375–408), the only actions per pending invite are **Resend** and **Cancel** — there's no "Copy invite link" affordance. If email delivery is broken for an environment (wrong/expired SMTP credentials, a domain reputation issue, Resend account problem), the owner's only recourse is to keep clicking Resend and hope, with no way to just hand the link to their new hire directly.

I can't verify from source code whether SMTP/Resend secrets are actually configured correctly in your production Supabase project — that's an operational check, not a code one — but if they're not, or ever lapse, this is the gap that turns it into a dead end rather than a workaround.

**Fix shape:** surface the invite URL (`buildTeamInviteUrl(token)`) to the owner directly — either always, or specifically when `emailSent === false` — with a copy-to-clipboard action.

---

## 5. One team per user account, platform-wide (design constraint, not a bug — but worth confirming)

The accept routes ([merchantTeam.ts:708](supabase/functions/delivery/merchantTeam.ts#L708) and [:783](supabase/functions/delivery/merchantTeam.ts#L783)) check:

```ts
const { data: existingMember } = await sb
  .from("merchant_team_members")
  .select("id")
  .eq("user_id", user.id)
  .maybeSingle();
if (existingMember) return c.json({ error: "You already belong to a store team" }, 409);
```

This is scoped by `user_id` alone — **not** by `merchant_id`. So a single Roam account can only ever be a team member of one merchant, period, across the whole platform. If a manager works at two of a restaurant group's locations (two separate `merchants` rows), or a bookkeeper handles payouts for two unrelated partners, they cannot accept a second invite with the same login — they'd need a second email address entirely.

This may well be intentional (keeps the ownership/permission model simple, avoids a "which store am I in" context-switcher). Flagging it because it's the kind of constraint that's invisible until a real multi-location partner hits it, and it's cheap to confirm now versus discover from a confused support ticket later.

---

## 6. Things that are genuinely solid (so this isn't read as "everything's broken")

- **Server-side re-validation on every write**, not just client-side gating — role, permissions, and job-station are all re-checked in the edge function on every invite-create, invite-resend, and member-update call, independent of what the client sends.
- **Ownership enforcement is airtight and consistent top-to-bottom**: `assertOwnerAccess()` gates every `/merchant/team/*` mutating route server-side, the whole "Team" section is also gated to `isOwner` in the frontend router ([SettingsPage.tsx:63](apps/dash-merchant/src/pages/SettingsPage.tsx#L63) and [:163](apps/dash-merchant/src/pages/SettingsPage.tsx#L163)), and a unique index (`merchant_team_one_owner_per_merchant`) guarantees exactly one owner row per merchant at the database level. Owner rows can't be edited or removed via the API (`"Cannot modify owner"` / `"Cannot remove owner"` checks).
- **The full invite-acceptance flow is real and handles the actual edge cases**: expired invites, wrong-account sign-in (with a clean "sign out and use invited email" recovery action), unconfirmed email, and already-on-another-team all have distinct, user-legible states in `TeamInviteLandingPage.tsx` — this is not a happy-path-only stub.
- **Invite tokens are single-use, 24-hour expiring, and regenerated on resend** — an old link can't be reused after a resend, and `isInviteExpired()` is checked server-side on preview, accept, and resend, not just client-side.
- **The invite domain is correct and consistent.** `buildTeamInviteUrl()` defaults to `https://partner.roamrush.app`, which matches the actual production origin used consistently everywhere else in the codebase (`partnerAuth.ts`, `playwright.config.ts`, `authRecoveryRedirects.ts`) — no stale-domain risk there.
- **The duplicate-looking migration filenames are a false alarm.** `merchant_team.sql`, `merchant_team_job_station.sql`, `fix_merchant_team_members_rls.sql`, and `merchant_team_invite_tokens.sql` each appear twice in `supabase/migrations/`, which looks like drift at a glance — but the earlier-timestamped file in each pair is explicitly a "history alignment stub" (`-- History alignment stub: already applied on remote... Do not re-run DDL here`), a deliberate reconciliation pattern already in use elsewhere in this repo. No actual schema conflict.
- **An RLS recursion bug was already found and fixed** ([20260704150000_fix_merchant_team_members_rls.sql](supabase/migrations/20260704150000_fix_merchant_team_members_rls.sql)) — a prior policy caused infinite recursion when order policies touched the team table; it's been replaced with a correct, non-recursive `user_id = auth.uid() OR owner` policy. Not a live issue, but evidence the schema has had real production hardening, not just first-draft code.
- **The `job_station` CHECK constraint was correctly widened** in a later migration ([20260709120000_venue_ops_stations.sql](supabase/migrations/20260709120000_venue_ops_stations.sql)) to match the expanded station list (`pos`, `bar`, `expo`, `drive_thru`) — I checked specifically for a mismatch here (the same shape of bug as §2) and this one was already caught and fixed.

---

## Recommendation

Ship-blocking for "use it right now": **nothing in this list is a hard blocker for the exact flow in your screenshot** (owner, Admin role, valid email) — that path works. Fix **§1** before more partners explore the Staff/Manager options (cheap, one file, purely a copy/conditional fix), fix **§2** before `inStoreEnabled` is turned on for any partner (one line, prevents a guaranteed failure later), and fix **§3–4** on a normal priority pass — they degrade the experience under failure but don't block the happy path.
