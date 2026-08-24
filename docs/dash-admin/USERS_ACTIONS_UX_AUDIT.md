# Users Directory — Actions Menu UX Audit

Scope: `packages/dash-admin/src/pages/users/` — the `Actions` dropdown on the Users
directory (`IdentityDirectoryPage.tsx`), and its identical twin on the person
detail page/overlay (`IdentityDetailOverlay.tsx`, `IdentityDetailPage.tsx`).
Audit only — no code changed.

## The root cause

`useIdentityActions()` (`components/IdentityActionBar.tsx:68`) builds one flat
list of menu items from the *identity's real data* (`detail.customer`,
`detail.courier`, `detail.permissions`) and nothing else. It has **no
knowledge of which directory tab you're on**. The `persona` filter state
(`all` / `customer` / `courier` / `merchant_owner` / `merchant_staff`) lives
in `IdentityDirectoryPage.tsx` and is never threaded down into
`IdentityActionBar` or `useIdentityActions`.

So the menu isn't "wrong" in the sense of showing actions for a persona the
identity doesn't have — it's showing the **union of every app the person
touches**, always, regardless of context. If a row has both a Customer and a
Courier persona (as in the screenshot — "Online Income International" has
both chips), opening Actions from the *Customers* tab still shows
`Suspend courier`, `Courier sign-out`, `Reset courier password`, because
those are legitimately available for that identity. The tab filtered *which
rows appear*, not *which actions are relevant to the reason you filtered*.
That mismatch between the two mental models — "I'm looking at customers" vs.
"this menu is per-identity, not per-view" — is the actual bug. It's not that
the data is wrong; it's that the UI never explains the scope shift.

## Three tiers of action, rendered as one undifferentiated list

Reading through `useIdentityActions`, every item pushed into `items` actually
belongs to one of three different blast-radius tiers, but the dropdown gives
them identical visual treatment (a flat button list, differentiated only by
text color for danger/warning/success):

**1. Global / identity-level — affects all three apps at once**
- `Sign out everywhere` (revokes all sessions, any app)
- `Restrict` / `Clear restriction` (sets `global_status`)
- `Ban identity` / `Unban` (sets `global_status`, locks every app)
- `Export` (GDPR/DPA export of the whole identity)

**2. Customer-app-scoped**
- `Suspend customer` / `Unsuspend customer` (writes `customer.account_status`)

**3. Courier-app-scoped**
- `Suspend courier` / `Unsuspend courier` (writes `courier.status`)
- `Courier sign-out`
- `Reset courier password`
- `Approve courier`

(Merchant owner/staff has no actions here at all today — see "Gaps" below.)

Nothing in the menu marks which tier an item belongs to. `Ban identity`'s
*confirm dialog* does say "(all apps)" in its title
(`IdentityActionBar.tsx:224`), but that context arrives one click too late —
by the time you see it, you've already clicked the item without knowing its
scope going in. `Restrict` doesn't even get that: its label and its dialog
copy ("Apply global restricted status") never say "all apps" or "global" in
plain language a non-engineer admin would parse quickly.

This directly answers your question **"what app is Restrict/Ban for?"** —
they're not for any single app. They're identity-level, cross-app locks. That
is a defensible thing for the system to have, but the current menu presents
it with exactly the same weight and grouping as "reset this courier's
password," so there's no way to tell the two categories apart without
reading each label carefully and already knowing the domain model.

## Why this is confusing specifically because there's already an "All" tab

The persona tabs (`All / Customers / Couriers / Merchant owners / Merchant
staff`) imply a filtering contract: "show me a scoped view of the world."
Once a user commits to the `Customers` tab, the reasonable expectation is
that everything downstream of that click — including row actions — stays
scoped to "customer." Instead, the action menu silently reverts to the
identity's full cross-app surface. If the menu is going to ignore the tab
scope, the `All` tab becomes redundant as a concept for actions (every tab's
menu already behaves like `All`), which undercuts the reason the tabs exist
in the first place.

## Recommended redesign

### 1. Group the dropdown into labeled sections, not a flat list

```
┌─────────────────────────────┐
│ GLOBAL · all apps            │
│  Sign out everywhere         │
│  Restrict                    │
│  Ban identity                │
│  Export data                 │
├─────────────────────────────┤
│ CUSTOMER APP                 │
│  Suspend customer            │
├─────────────────────────────┤
│ COURIER APP                  │
│  Suspend courier             │
│  Courier sign-out            │
│  Reset courier password      │
└─────────────────────────────┘
```

Each section gets a small header (app name) and, ideally, the same icon/color
used elsewhere in dash-admin to represent that app (Rush/Customer, Courier,
Partner/Merchant), so scope is recognizable at a glance without reading text.
Give the `GLOBAL` section a visually heavier treatment (border, or placed
last with a divider and muted-red accent) since it's the highest blast
radius — "affects all three apps" should look more consequential than
"resets one courier's password."

### 2. Make the menu context-aware of the active tab

Thread the directory's `persona` filter (or, on the detail page, the active
`Tab`) down into `IdentityActionBar`. When the menu opens from a
persona-scoped context:
- Put that persona's section **first**, expanded, visually primary.
- Collapse other personas' sections behind a disclosure, e.g.
  `Also has: Courier ▸` — expandable, not hidden entirely (the person *is*
  also a courier; hiding that outright would remove real capability and
  contradicts the persona chips already shown in the row). This keeps "you
  can still suspend their courier account from here" possible without it
  ambushing you as the first thing you see while triaging customers.
- Global actions stay visible always (they're not persona-scoped by
  definition) but stay in their own clearly-labeled section, not interleaved.

On the detail page (`IdentityDetailPanel`), the same logic should apply
against the active sub-tab (`Customer` / `Courier` / `Merchant`) rather than
the directory's `persona` param — the mechanism is the same, just driven by
different state.

### 3. Say the scope in the label, not just the confirm dialog

`Restrict` → `Restrict (all apps)`, matching the pattern `Ban identity` already
half-uses. Don't make the user open the confirm modal to learn the blast
radius — that's a second click just to find out if the button they're about
to press is safe to press.

### 4. Stop overloading `tone` (color) as the only signal

Right now `tone` (`warning` / `danger` / `success` / `default`) is the sole
visual differentiator, and it's already spoken for as a *severity* signal
(danger = destructive, success = restorative). Scope (which app) needs its
own channel — grouping/headers as above, plus optionally a small app-glyph
next to each item — rather than trying to squeeze a second meaning out of
color that's already carrying one.

## Secondary gaps worth noting

- **Merchant owner/staff has zero actions** in `useIdentityActions` — no
  suspend, no staff revoke from this menu (staff revoke exists, but only
  buried in the detail page's `Merchant` tab, not in the Actions menu at
  all, and not on the directory row menu). If merchant is a first-class
  persona tab, it should have first-class actions here too, or the asymmetry
  should at least be intentional and documented.
- **`variant="bar"` vs `variant="menu"`** — the same `IdentityActionBar`
  renders either as a horizontal button row or a dropdown, controlled by a
  prop, but every action is still pulled from the same undifferentiated
  `items` array either way. Any grouping fix needs to work in both
  rendering modes (the detail page can use either via `actionsAsMenu`).
- **`No actions available`** (empty state, `IdentityActionBar.tsx:380`) gives
  no reason why — worth a one-line explanation ("You don't have permission
  to manage this person" vs. "This person has no manageable personas") since
  permission-gating (`hasPermission(...)`) and data-gating
  (`detail.courier` existing) both produce the same empty state today and
  are two very different situations for an admin to be told apart.

## Summary

The underlying data model (one identity → multiple app-specific personas,
plus global identity-level status) is reasonable and the screenshot's menu
is technically accurate. The problem is purely presentational: three tiers of
action with very different blast radii are flattened into one list with no
grouping, no scope labeling, and no awareness of the tab the admin
deliberately chose to narrow their view to. Fixing this is a UI/state-plumbing
change (group + label + thread active-scope into `useIdentityActions`), not a
data-model change.

## Implemented (2026-08-23)

Enterprise redesign shipped as specified:

### Decisions locked in code
- Actions grouped by blast radius: Customer / Courier / Merchant → Global last
- Directory `persona` and detail `tab` pass `actionScope` into `IdentityActionBar`
- Non-primary personas collapse under `Also has: {App}` disclosures
- Global labels and confirm copy say `(all apps)`
- `tone` remains severity-only; section headers + Lucide glyphs carry scope
- Empty states distinguish permission vs no manageable apps
- Menu and bar variants both render the grouped model

### Merchant section
- Per owned store: Suspend / Unsuspend / Reset owner password
- Per staff membership: Revoke staff · {store}
- Client: `resetMerchantOwnerPassword` in `dashAdminService.ts`
- Edge: owner recovery redirect uses Partner (`recoveryRedirectForProduct("partner")`)

### Files
- `packages/dash-admin/src/pages/users/components/identityActions/*`
- `packages/dash-admin/src/pages/users/components/IdentityActionBar.tsx`
- `packages/dash-admin/src/pages/users/IdentityDirectoryPage.tsx`
- `packages/dash-admin/src/pages/users/components/IdentityDetailOverlay.tsx`
- `packages/dash-admin-client/src/dashAdminService.ts`
- `supabase/functions/_shared/authRecoveryRedirects.ts` (+ auth-client mirror)
- `supabase/functions/delivery/admin/merchantRoutes.ts`

### Manual verification checklist
1. Customers tab + dual persona → Customer first, Courier under Also has, Global last
2. Couriers / All / Merchant owners / Merchant staff — primary section matches tab
3. Detail tab switch reorders Actions without reload
4. Restrict / Ban / Export / Sign-out labels + dialogs say all apps
5. Multi-store owner — per-store suspend rows
6. Staff-only — Revoke staff under Merchant; no false customer/courier items
7. No-write admin — permission empty copy
8. Menu and bar both show groups
9. Owner password reset email lands on Partner after edge deploy

## Follow-up implemented (2026-08-24)

Previously out-of-scope items shipped:

### Merchant-owner person status (option B)
- Table: `delivery.merchant_owner_profiles.account_status` (`active` | `suspended`)
- Migration: `supabase/migrations/20260829120000_merchant_owner_profiles.sql`
- `platform.identity_personas` merchant_owner status now uses owner profile, not store `operational_status`
- `applyPersonaRestrict` supports `merchant_owner` / `merchant` without touching store ops
- Identity detail returns `merchantOwner`
- Partner: `403` + `code: owner_account_suspended` on `/merchant/profile`; suspended screen in `apps/dash-merchant`
- Actions: **Suspend / Unsuspend merchant owner (Partner access)**

### Store lifecycle in Actions (Delete stays on Detail)
- Per store: **Deactivate** / **Reactivate** in Users Actions
- Same buttons on Merchant Detail (were imported but unused)
- **Delete** remains Merchant Detail only (type-to-confirm)

### Vitest
- `pnpm --filter @roam/dash-admin test`
- `buildIdentityActionGroups.test.ts`

### Notion
- Architecture Docs → [Users Identity Actions UX](https://app.notion.com/p/3c62ac0f7598816e9d50d4c03309a743)
