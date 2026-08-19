# Roam Rush smoke test cheat sheet

Plain-English guide for running smoke tests. You do **not** need to open the apps in a browser for the scripts below — they talk directly to Supabase.

## Before you run anything

1. Open a terminal in the **Goride** project folder.
2. Be logged into Supabase CLI (`supabase login`) **or** set `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` in your environment.
3. Tell your AI assistant which test to run — copy a line from the tables below.

## How to ask your AI to run a test

Examples:

- “Run `scripts/smoke-customer-all.mjs`”
- “Run the Roam Rush customer checkout smoke test”
- “Run the partner order queue smoke test”
- “Run the full delivery E2E smoke test”

You do **not** need to paste script code — the files live in this repo.

---

## Roam Rush (Customer app)

| Say this | Script | What it checks |
|----------|--------|----------------|
| **Full customer API pack** | `scripts/smoke-customer-all.mjs` | Runs all customer scripts below in order |
| Login & profile | `scripts/smoke-customer-auth.mjs` | Sign in, load profile, save profile |
| Signup | `scripts/smoke-customer-signup.mjs` | Create temp account, first profile, cleanup |
| Search & browse | `scripts/smoke-customer-discovery.mjs` | Search dishes, open store, list promos |
| Favorites | `scripts/smoke-customer-favorites.mjs` | Add, list, remove favorite restaurant |
| Checkout | `scripts/smoke-customer-checkout.mjs` | Place cash order + idempotency (creates real test order) |
| Orders & tracking | `scripts/smoke-customer-orders.mjs` | Order history + track latest order |
| Cancel order | `scripts/smoke-customer-cancel.mjs` | Place order, cancel before prep |
| Report issue | `scripts/smoke-customer-issue.mjs` | File support issue on completed order |
| Rate order | `scripts/smoke-customer-review.mjs` | Submit star rating (skips if none eligible) |

**Test account:** `seed-customer@roamrush.app` / `RoamRushCustomer2026!`

**Run one script:**
```bash
node scripts/smoke-customer-checkout.mjs
```

**Run everything:**
```bash
node scripts/smoke-customer-all.mjs
```

### Customer tests that still need the browser

These are **UI-only** — ask your AI to “run customer browser smoke”:

- Cart survives page refresh
- Cross-store cart conflict (“Start a new cart?” modal)
- Checkout button lock / high-tip confirm
- Onboarding screens

---

## Roam Rush Partner (Merchant app)

| Say this | Script | What it checks |
|----------|--------|----------------|
| Order queue | `scripts/smoke-merchant-orders.mjs` | Partner login, profile merchant ID, paid orders in API vs database |

**Test account:** `seed-island-grill@roamrush.app` / `RoamRushPartner2026!`

```bash
node scripts/smoke-merchant-orders.mjs
```

---

## Roam Rush Courier

| Say this | Script | What it checks |
|----------|--------|----------------|
| Full delivery flow | `scripts/smoke-e2e-delivery.mjs` | Customer order → merchant accept/ready → courier accept → delivered → completed |

**Test accounts:** customer, Island Grill partner, and courier seed accounts (see provision scripts in `scripts/`).

```bash
node scripts/smoke-e2e-delivery.mjs
```

---

## Suggested order for a big release check

1. `node scripts/smoke-customer-all.mjs`
2. `node scripts/smoke-merchant-orders.mjs`
3. `node scripts/smoke-e2e-delivery.mjs`
4. Ask AI for **browser smoke** on cart conflict + dashboard UI

---

## Notes

- **Checkout / cancel / E2E scripts create real test orders** on the GoRide test backend.
- **Signup smoke** creates a temporary user and deletes it afterward.
- **Issue smoke** creates a real support ticket (marked as smoke in the note).
- Scripts target project `csfllzzastacofsvcdsc` (GoRide remote).
- If a script fails, copy the terminal output and ask your AI to fix it.

---

## Copy-paste block for your personal notes

```
ROAM RUSH (Customer)
- smoke-customer-all.mjs — run all customer API tests
- smoke-customer-auth.mjs — login & profile
- smoke-customer-signup.mjs — new account
- smoke-customer-discovery.mjs — search & promos
- smoke-customer-favorites.mjs — favorites
- smoke-customer-checkout.mjs — cash checkout
- smoke-customer-orders.mjs — history & tracking
- smoke-customer-cancel.mjs — cancel order
- smoke-customer-issue.mjs — report issue
- smoke-customer-review.mjs — rate order

ROAM RUSH PARTNER
- smoke-merchant-orders.mjs — partner order queue

ROAM RUSH COURIER / FULL FLOW
- smoke-e2e-delivery.mjs — customer → merchant → courier delivery
```
