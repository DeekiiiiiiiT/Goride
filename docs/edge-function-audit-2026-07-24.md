# Edge Infrastructure Audit — Goride / Roam (2026-07-24)

> **Remediation status (2026-07-25):** Phases 0–4 implemented in repo. See [`edge-remediation-status.md`](edge-remediation-status.md). Tracker: Notion Edge Functions = Partial until deploy + live redteam Pass.

Read-only audit of all Supabase edge functions and their surrounding frontend/deploy setup. No code was changed as part of this pass.

> Note: a deeper prior audit exists at [`edge-function-audit.md`](edge-function-audit.md) (2026-07-18, 374 files, 8 passes) and [`edge-audit-redteam.md`](edge-audit-redteam.md) (curl verification suite for that audit's fixes). This report is a fresh, independent pass — cross-check findings against those before assuming something here is new vs. already fixed.

**Snapshot:** 18 deployed edge functions · 9 frontend apps calling them · 2 unauthenticated data leaks found live · 6 functions with no automated deploy path · 18,745 lines of live backend logic sitting inside a frontend app's source folder.

---

## Table of contents

0. [Executive summary & edge footprint](#0-executive-summary--edge-footprint)
1. [Quick wins](#1-quick-wins)
2. [Edge functions you don't have yet](#2-edge-functions-you-dont-have-yet)
3. [What to delete](#3-what-to-delete)
4. [Architecturally misplaced](#4-architecturally-misplaced)
5. [Hardening — security & reliability](#5-hardening--security--reliability)
6. [Speed & cost optimization](#6-speed--cost-optimization)
7. [Maintainability](#7-maintainability)
8. [Prioritized roadmap](#8-prioritized-roadmap)

---

## 0. Executive summary & edge footprint

The backend runs as **18 Supabase edge functions** (Deno, in `supabase/functions/`), ranging from tiny stubs to genuine monoliths. The biggest, `rides` (3,100+ lines plus ~40 helper files), handles nearly all passenger and driver logic — booking, dispatch handoff, chat, cash settlement, contacts. `delivery` (~10,600 lines across its files) runs the merchant/food-ordering side. `matching` is the dispatch/wave engine. Smaller, focused functions handle payments, toll detection (`toll-brain`), fuel classification (`fuel-brain`), SMS/OTP delivery, push notifications, driver admin, haulage, and two Supabase Auth "hooks" that run before a user is created or before a token is issued. Two functions (`fleet-ops`, `platform-catalog`) are near-empty placeholders, mid-migration.

Four things need attention immediately, in order of how much damage they can do:

1. **Two production bugs leak private data to anyone, logged in or not** — `delivery` will hand over a full order (name, phone, merchant) to an unauthenticated request because it can't tell who's asking, and `payments` will let a logged-in stranger mark someone else's order as "paid." Both are cheap fixes. See §5.
2. **The biggest, most sensitive backend file isn't where anyone would look for it.** The function actually deployed as `make-server-37f42386` is a 20-line shim that pulls in an 18,745-line file living inside the *fleet frontend app's* source folder — not the edge functions folder. It handles claims, dispute refunds, toll settlement, and driver pay. See §4.
3. **Six functions — including `matching`, edited three days ago — have no automated way to reach production.** They're absent from both the CI deploy workflow and the manual deploy scripts. Someone has to remember a one-off command, or the code sits in the repo forever. See §3 and §8.
4. **None of the 9 apps set a single security header**, and CORS handling is a different, mostly-too-loose story in almost every function. Neither is an emergency alone, but together they're the difference between "hardened" and "hoping." See §5.

---

## 1. Quick wins

### 1. Require an auth header before returning an order
`delivery/index.ts:702-717` — a request with no `Authorization` header isn't rejected, it's routed to a service-role database client that skips row-level security. Add the same "no header → 401" check every other route in this file already has.
**Benefit:** stops a stranger with a guessed order ID from reading a customer's name, phone, and order details.

### 2. Verify identity and ownership before capturing a PayPal payment
`payments/index.ts:378-386` — the capture route checks that *an* auth header exists but never confirms who it belongs to or that the order is theirs. Add the same `getUser()` + ownership check the other payment routes already use.
**Benefit:** closes a real fraud path — right now someone can pay for a cheap order and mark an expensive one "paid" instead.

### 3. Make the two auth hooks fail closed, not open
`before-user-created/index.ts` and `custom-access-token/index.ts` both skip signature verification entirely if their secret environment variable happens to be unset, instead of rejecting the request. `send-sms` already does this correctly — copy its pattern.
**Benefit:** one misconfigured environment variable can no longer let someone spoof a signup or token event.

### 4. Add an ownership check to merchant push notifications
`merchant-push/index.ts` takes a `merchantId` straight from the request body and sends push notifications to that merchant's devices, with no check that the caller actually works for that merchant.
**Benefit:** stops anyone with the app's public key from blasting arbitrary notification text to any merchant.

### 5. Add security headers to all nine `vercel.json` files
None of the 9 apps set `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options`, or `X-Content-Type-Options`. This is one shared headers block, copy-pasted into each app's `vercel.json`.
**Benefit:** HSTS forces the browser to only ever talk HTTPS; X-Frame-Options stops your login page being embedded invisibly on someone else's site to steal clicks — this one block covers both plus more.

---

## 2. Edge functions you don't have yet

**Shared rate limiting** — *sits before auth, in front of everything.* The only rate limiting that exists today is a homemade, in-memory counter inside `rides/index.ts`, reused by a couple of delivery files. It's explicitly documented as "best effort" — it resets whenever that edge instance restarts and doesn't count requests handled by a different instance. `payments`, `toll-brain`, `fuel-brain`, `driver`, and `matching` have none at all. Without a shared counter (Redis-backed or similar), nothing stops a script from hammering payment or OTP endpoints.

**Real session gating, not just hidden components** — *front door of every app.* All 9 apps are React SPAs with no edge middleware anywhere. Route protection is a component that checks "are you logged in?" *after* the page's JavaScript has already downloaded to the browser. A thin Vercel Edge Middleware per app that checks for a session cookie and redirects before serving the bundle would close this cheaply.

**One shared CORS/security-headers helper** — *`_shared/`, wraps every response.* Every function currently reinvents this: `rides` does it properly with an environment-driven allowlist; `matching`, `delivery`, and `haul` default to allowing any origin; `merchant-push` sets no CORS headers at all. The 9 apps genuinely do call one shared Supabase project from 9 different domains, so this isn't optional — but "allow anyone" isn't the same as "allow our 9 domains."

**A single, edge-evaluated feature-flag function** — *early in the request, before business logic branches.* Three separate homegrown flag systems exist today: a KV-backed one buried inside the 18,745-line fleet monolith, one in the admin app, and one in dash-merchant — none talk to each other. Flags like the toll/dispute-refund sync toggle already in production deserve one place to turn on/off per environment, consistently.

**Basic bot/abuse protection on unauthenticated routes** — *in front of: auth hooks, evidence-cleanup, health checks.* `before-user-created`, `custom-access-token`, and the various `/health` endpoints are reachable by anyone, by design — but nothing currently rate-limits or fingerprints abuse against them. These are the literal front door for account creation.

**Response caching for slow-changing data** — *response layer, read-heavy routes.* Not one function in the codebase sets a `Cache-Control` header (the bright spots: `toll-brain`'s 5-minute in-memory cache for plaza data, and `petrojam-prices` correctly caching scraped prices in the database instead of re-scraping per request). `platform-catalog`, driver admin lists, and fuel prices don't change every second — every uncached read is a database round-trip that didn't need to happen.

---

## 3. What to delete

Confirmed by checking what actually imports or deploys each item, not just by reading file names.

### Confirmed dead: five orphaned function folders under the fleet app
`apps/fleet/src/supabase/functions/{admin-operations, ai-services, financial-operations, fleet-management, fuel-maintenance}`

These sit next to the 18,745-line file described in §4, and look like they belong to the same legacy scaffold — but unlike that file, **nothing in the repository imports, deploys, or otherwise references them.** No CI workflow, no `package.json` script, no `supabase/config.toml` entry, no frontend import. They're leftovers from an earlier restructure that never got cleaned up.
**Action:** delete the five folders. Do a final repo-wide grep for their folder names first as a safety check, but the evidence points to zero live references.

### Dead route: an unfinished stub sitting in a live route table
`matching/index.ts` — `/v1/internal/run-wave`

This route is deployed and reachable, but its handler just returns `not_implemented`. It's not hurting anything today, but it's a trap for the next person who assumes a listed route does something.
**Action:** either finish it or remove it from the route table until it's ready.

### Deprecated, still live: legacy matching/reconcile/wave logic marked "pending Phase 8 removal"
`rides/index.ts` — functions explicitly tagged `@deprecated`

The newer `matching` function was clearly meant to replace this logic, but the old code path is still in the file, still callable, and still doubles the dispatch logic — meaning a bug fix applied to one path can silently not apply to the other.
**Action:** whatever "Phase 8" is, finish it — this is exactly the kind of two-paths-that-drift risk that causes production incidents nobody can explain.

### In progress, not dead: `fleet-ops` and `platform-catalog`
`supabase/functions/fleet-ops`, `supabase/functions/platform-catalog`

Both are ~30-line stubs with just a health check, explicitly commented as landing zones for routes being extracted out of the legacy monolith.
**Action:** keep, but put a real date on finishing the extraction described in §4 rather than letting these sit as permanent placeholders.

---

## 4. Architecturally misplaced

### The biggest, most sensitive backend logic lives inside a frontend app's source folder
`apps/fleet/src/supabase/functions/server/index.tsx` — 18,745 lines, ~100 supporting files

This is not dead code — it's confirmed live. The deployed function `make-server-37f42386` is a 20-line shim (`supabase/functions/make-server-37f42386/index.ts`) whose entire job is to explicitly import this file and ~9 of its neighbors by relative path, because the Supabase CLI's bundler was silently dropping them when only pulled in indirectly. So the actual logic for claims, dispute-refund matching, toll settlement, driver financial periods, and fuel P&L — arguably the most sensitive financial code in the platform — lives inside `apps/fleet/src/`, the same folder tree the fleet dashboard's React components live in, not in `supabase/functions/` where every other backend function lives.

Practically: anyone browsing the fleet frontend app to fix a UI bug is one folder away from editing production backend logic without realizing it. It also has its own in-memory rate limiter and feature-flag store that don't survive across scaled edge instances, and a KV-store data-access pattern instead of the newer, cleaner approach the rest of `supabase/functions/` already uses (see `toll-brain`/`fuel-brain`, which split pure logic from HTTP handling and are a fraction of the size).

**Correct home:** move the whole tree into `supabase/functions/` — ideally not as one giant file, but split into the properly-scoped functions the newer architecture already established (`toll-brain`, `fuel-brain`, `driver`, `fleet-ops`), retiring `make-server-37f42386` route by route as each piece moves. This is a real project, not an afternoon fix — but every month it stays as-is is a month where a routine frontend PR could accidentally touch live financial logic.

### Borderline: merchant analytics aggregation runs inline, on every request
`delivery/index.ts` — merchant analytics route

Category and item totals are computed in memory over what looks like the full order history, with no visible date-bounding or pagination — fine at today's order volume, a slow-growing liability as it scales.
**Correct home:** a scheduled job that pre-computes a daily/weekly summary table, with the edge function just reading it.

---

## 5. Hardening — security & reliability

Every real issue found, ranked by how bad it would be if left alone.

### 🔴 Critical — Order lookup skips the login check entirely
`delivery/index.ts:702-717` — GET /orders/:id

When no `Authorization` header is sent, the code doesn't reject the request — it silently falls back to a service-role database client that bypasses row-level security. Anyone who can guess or enumerate an order UUID gets the full order plus the customer's name, phone number, and merchant details, without logging in at all.
**Fix:** add the same "reject if no auth header" check every other route in this file already has.
**Risk if left:** a straightforward, scriptable data-scraping path against real customer PII.

### 🔴 Critical — PayPal capture can be pointed at someone else's order
`payments/index.ts:378-386` — /paypal/capture

This route confirms *an* auth header was sent, but never checks who it belongs to, and never checks that the `orderId` in the request belongs to that caller. A logged-in user can pay for a cheap order via PayPal and use that receipt to mark a completely different, more expensive order as "paid."
**Fix:** add the identity check every other payment route already has, plus an explicit "does this order belong to this caller" check before marking it paid.
**Risk if left:** direct revenue loss — this is a payment-fraud path, not just a data leak.

### 🟠 High — Any logged-in user can view or pay for someone else's order
`payments/index.ts:69-141` — /intents

After confirming the caller is logged in, this route fetches an order by ID alone — it never checks the order belongs to that customer. Any authenticated user can generate a payment link for, and see the amount and merchant of, someone else's order.
**Fix:** same ownership check as above.
**Risk if left:** cross-customer data exposure at minimum, payment confusion at worst.

### 🟠 High — Order totals trust whatever price the customer's phone sends
`delivery/index.ts:660-664` — POST /orders

The order subtotal is calculated from `item.price × item.quantity` using the price sent by the client, not looked up from the menu. Delivery fee, tip, and discount are also taken as-is from the request body.
**Fix:** recompute the subtotal server-side from the real `menu_items` table; ignore any price the client sends.
**Risk if left:** a "pay what you want" checkout — someone can set any item to any price before submitting.

### 🟡 Medium — Two auth hooks accept unsigned events if their secret isn't set
`before-user-created/index.ts`, `custom-access-token/index.ts`

Both hooks verify a signature *if* their secret environment variable is set — but if it's ever missing (a deploy misconfiguration, a forgotten env var in a new environment), they don't reject the request, they just skip verification and trust the payload. `send-sms`'s equivalent hook already does this correctly: it fails closed with a 500 when its secret is missing.
**Fix:** copy send-sms's pattern — reject, don't trust, when the secret is absent.
**Risk if left:** one misconfigured environment variable becomes "anyone can spoof a signup or mint token claims."

### 🟡 Medium — Merchant push notifications have no ownership check
`merchant-push/index.ts`

The function only confirms the caller has *some* valid Supabase token — which includes the public anon key. It then reads `merchantId` straight from the request body and pushes to that merchant's subscribed devices, with nothing tying the caller to that merchant.
**Fix:** verify the caller is staff/owner of the merchant they're pushing to.
**Risk if left:** arbitrary notification spam or impersonation against any merchant, by anyone holding the public key.

### 🔵 Low — SMS auth hook may be missing a config entry its siblings have
`send-sms` — no `[functions.send-sms]` entry in `supabase/config.toml`

Both other Supabase Auth hooks (`before-user-created`, `custom-access-token`) explicitly set `verify_jwt = false` in config, since Auth calls them without a user JWT. `send-sms` doesn't have this entry, which could mean OTP delivery silently breaks if the platform's default JWT check ever applies to it.
**Fix:** confirm with a real test send whether this is already handled elsewhere (e.g. the Auth Hooks dashboard config); if not, add the same config entry.

### 🔵 Low — Payment gateway URL is hardcoded to "sandbox"
`payments/index.ts:166`

The WiPay gateway call always hits `sandbox.wipayfinancial.com`, regardless of environment — the environment is only passed as a field inside the request body, never used to choose the host.
**Fix:** confirm with WiPay's docs whether one host really does serve both sandbox and live traffic — if not, this needs a real production host.

### 🔵 Low — Error responses leak internal details, repeatedly
Dozens of call sites across `rides`, `delivery`, `matching`, `payments`

The most common pattern in the codebase is `return c.json({ error: error.message }, 500)` — passing the raw database error straight back to the client. That can include table/column names and other schema detail an attacker shouldn't see for free.
**Fix:** one shared "safe error" helper in `_shared/` that logs the real error server-side and returns a generic message to the client.

### 🔵 Low — Secret comparisons aren't timing-safe
`rides/index.ts`, `matching/index.ts`, `toll-brain/index.ts`, `evidence-cleanup/index.ts` — internal/cron routes

These routes compare a shared secret with plain `===`, which leaks tiny timing differences an attacker could theoretically use to guess the secret one character at a time. `payments` already does this correctly with a constant-time comparison.
**Fix:** reuse payments' timing-safe comparison helper everywhere secrets are checked. Low real-world risk (an attacker also needs network access to these internal routes), but a five-minute fix.

### 🔵 Low — Malware scanning fails open
`_shared/malwareScan.ts`

This genuinely calls VirusTotal to scan uploaded files — but if the API key isn't set, the scan errors, or the scanner is unreachable, the file is marked "clean" rather than rejected.
**Fix:** fail closed — if the scan can't run, reject the upload rather than assume safety.
**Risk if left:** the safety gate silently does nothing whenever the scanner has a bad day.

### 🔵 Low — Authorization checks aren't applied consistently
Coverage check across all 18 functions

Only 5 of the 18 functions (`delivery`, `driver`, `identity`, `matching`, `rides`) use the shared permission-checking helpers in `_shared/`. The rest use their own one-off admin checks (fine in some cases — e.g. `toll-brain`/`fuel-brain` use a separate but real `requirePlatformAdmin`) or, in a few cases, none at all on routes that arguably need one.
**Fix:** not urgent by itself, but worth one focused pass to confirm every non-public route somewhere checks who's calling.

---

## 6. Speed & cost optimization

**No caching, anywhere.** Not one function sets `Cache-Control` or `CDN-Cache-Control`, apart from `toll-brain`'s 5-minute in-memory cache for plaza data. `petrojam-prices` already does the right thing — caches scraped prices in the database, only re-scrapes on an explicit admin trigger. *Target:* add a `stale-while-revalidate` header to slow-changing GET routes — `platform-catalog`, driver admin lists, price lookups. Even a 5-minute cache on the busiest of these removes a meaningful slice of redundant database round-trips.

**Dispatch waves run their lookups one at a time.** Both the newer `matching` function and the older logic still in `rides/index.ts` await driver-location, tier, and offer lookups sequentially, even though nothing about them depends on each other. *Target:* wrap the independent lookups in `Promise.all`. On a wave with several drivers, this turns N sequential round-trips into 1 — a direct latency win exactly where speed matters most.

**Outbound calls to third parties have no timeout.** WiPay/PayPal calls in `payments`, SMS carrier requests in `send-sms`, and individual push sends in `merchant-push` all use plain `fetch` with no `AbortController`. `petrojam-prices` already gets this right with a 20-second timeout and a realistic browser identity. *Target:* an 8-10 second timeout on every outbound call to a third party — without one, a slow payment provider or SMS carrier can hold a function open until the platform's own hard timeout.

**In-memory state won't survive scale.** The rate limiter in `rides/index.ts` and the OTP dedup logic in `send-sms` both live in memory, per edge instance. For OTP dedup this is already a deliberate, documented, reasonable tradeoff. For rate limiting, it means the counter resets whenever an instance restarts and doesn't add up across instances — weaker protection than it looks like on paper.

---

## 7. Maintainability

**Two monoliths do too many unrelated things.** `rides/index.ts` (3,143 lines) alone handles booking, driver presence, wallet, chat, contacts, saved places, and cash settlement, in one file. `delivery` (~10,600 lines with helpers) is even bigger. The codebase already has the right pattern for this — `haul` cleanly delegates its admin routes to a separate module via a `register*Routes()` call. Apply that same split to rides and delivery, by domain, with no behavior change — smaller files, smaller blast radius per edit.

**The same field list is copy-pasted three times.** `matching/index.ts`'s `allowedFields`, `legacyFields`, and `sharedFields` are each defined three separate times across the dual-write/sync-status/sync-to-legacy admin routes. Extract to one shared constant — right now, adding a new policy field means remembering to update it in three places.

**The same frontend hooks are copy-pasted across apps.** `useSafetyMetrics`, `useEnterpriseSync`, `locationService.ts`, `ErrorBoundary.tsx` exist nearly verbatim in the admin, fleet, and driver apps rather than in a shared package. Not an edge-function issue directly, but a bug fix in one app's copy doesn't reach the other two unless someone remembers to port it by hand.

**No shared request-validation library.** Input checking across the codebase is ad hoc — scattered `typeof` and `Number()` coercion, decided fresh per route. Adopting one schema-validation library (e.g. Zod) for request bodies would make every function's inputs self-documenting and would have caught some of the gaps in §5 automatically.

**What's already good — keep doing this.** `toll-brain` and `fuel-brain` cleanly separate pure classification logic (`classify.ts`) from HTTP handling. `rides`' fare-booking flow uses a signed, HMAC-verified quote token so a client can't tamper with the price between quote and booking — exactly the pattern `delivery`'s order pricing is missing (§5). Several functions have real `*.test.ts` files already in place. `petrojam-prices`' HTML scraper is defensively written, with header/column validation and per-cell sanitization, rather than trusting the scraped page blindly.

---

## 8. Prioritized roadmap

| Priority | Action | Effort | Benefit |
|---|---|---|---|
| High | Fix the delivery unauthenticated order leak | Minutes | Stops PII exposure to anyone with an order ID |
| High | Fix the PayPal capture IDOR | Hours | Closes a live payment-fraud path |
| High | Add order-ownership check to /intents | Hours | Stops cross-customer data exposure |
| High | Recompute delivery order pricing server-side | Hours | Stops a pay-what-you-want checkout exploit |
| High | Make both auth hooks fail closed on missing secret | Minutes | Closes a signup/token spoofing path |
| High | Add ownership check to merchant-push | ~30 min | Stops notification spam/impersonation |
| High | Wire the 6 undeployed functions into CI | ~1 hr | Closes the "silent no-deploy" risk on actively-edited code like `matching` |
| Medium | Add security headers to all 9 vercel.json files | ~1 hr | Blocks a whole class of clickjacking/MIME-sniffing attacks |
| Medium | Delete the 5 orphaned legacy function folders | 15 min | Removes confirmed dead weight and reader confusion |
| Medium | Standardize CORS on rides' allowlist pattern | Half day | Correctly-scoped cross-origin access instead of wildcards |
| Medium | Add a shared "safe error" response helper | 1 day | Stops internal/schema detail leaking to clients, platform-wide |
| Medium | Swap === secret checks for timing-safe comparison | 1-2 hrs | Removes a minor timing-attack surface |
| Medium | Make malware scanning fail closed | 1-2 hrs | Real enforcement of the file-upload safety gate |
| Medium | Parallelize independent lookups in dispatch waves | 1-2 days | Faster driver matching, less database load at peak |
| High | Relocate the 18,745-line fleet monolith into supabase/functions | Multi-week | Removes the single biggest architectural & security blind spot in the backend |
| Low | Add Cache-Control headers to stable read routes | 1 day | Fewer redundant database hits, lower cost |
| Low | Add timeouts to all outbound third-party calls | 1 day | Stops a slow provider from hanging your functions |
| Low | Push session checks to an edge/proxy layer | 2-3 days | Protected app code stops shipping to logged-out browsers |
| Low | Split rides/index.ts and delivery/index.ts by domain | 1-2 weeks | Easier onboarding, smaller blast radius per change |
| Low | Build one shared feature-flag function for all 9 apps | 2-3 days | Consistent, auditable rollout control instead of 3 systems |

---

*Read-only audit — no code was changed. Every finding cites the specific file (and line numbers, where meaningful) it was found in.*
