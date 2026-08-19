# Roam Rush — Which Roles You Actually Need for a 14-Day Launch

**Who this is for:** you, a solo vibe coder, deciding which AI "roles"/bots to add in Cursor before launch.
**Apps covered:** Roam Rush (`apps/dash-customer`), Roam Rush Courier (`apps/dash-courier`), Roam Rush Partner (`apps/dash-merchant`).
**Method:** this isn't guesswork — I read your actual code, CI config, test files, and existing planning docs to see what's real vs. what's just on a wishlist.

---

## Bottom line

You already have more infrastructure than a typical solo vibe coder — error monitoring, a design system, payment integration, and even unfinished launch checklists sitting in your `docs/` folder. Your gap isn't "I have nothing." Your gap is **nobody has executed the checklists you (or a past Claude session) already wrote**, and **nothing verifies your app actually works end-to-end before you ship**.

Your instinct about QA + Playwright was correct. That's your #1 add.

---

## What you already have (don't re-hire for these)

| Area | Evidence | Meaning |
|---|---|---|
| Error monitoring | `@sentry/react` installed in all 3 apps | You'll know when something breaks in prod. Don't add a dedicated SRE yet. |
| Design system | `packages/ui`, `packages/design-tokens`, Figma bot commits in git history | UX/UI groundwork exists. Don't hire UX/UI Designer roles right now. |
| Payments backend | Stripe Connect wired into `supabase/functions/delivery/stripeConnectRoutes.ts` | Merchant/courier payouts are built, not just planned. |
| Data security | 88 migrations enable Row Level Security (RLS) | Real access-control exists in your database, not just app-level checks. |
| Architecture | Supabase (managed Postgres + edge functions) + Capacitor (iOS/Android) + Vite monorepo | This is a coherent, already-chosen stack. You don't need a Solutions Architect to pick one. |
| Single-market launch | No localization/i18n code anywhere | Correct for now — skip Localization Specialist entirely. |

---

## The checklists you already wrote but haven't executed

This is the most important finding. You (or a prior session) already created these files — they're real, specific, and unfinished:

- **`docs/dash-launch-phase4-gono-go.md`** — a go/no-go list before full launch. Every box is unchecked, including "Security + legal sign-offs written" and "Golden-path e2e green; load test passed."
- **`docs/dash-launch-compliance-checklist.md`** — money-transmission/licensing checklist for Jamaica payouts. Legal counsel sign-off line is blank.
- **`docs/edge-audit-redteam.md`** — a curl-based security test suite for your backend endpoints (checks that unauthorized requests get rejected). It's written but there's no evidence it's been run against your deployed environment.
- **`docs/dash-courier-production-readiness-audit.md`**, **`dash-customer-production-readiness-audit.md`**, **`dash-merchant-production-readiness-audit.md`** — per-app readiness audits already exist.

**Read these three "gono-go" and "compliance" files this week.** Half of your 14-day plan is just working through boxes you already identified as important.

---

## Roles to add now (ranked)

### 1. Senior QA Automation Engineer — Playwright (confirmed, your instinct was right)
**Evidence:** `.github/workflows/ci.yml` only runs unit tests (`vitest`) and builds. Zero end-to-end tests are wired into CI. Two smoke scripts exist (`toll-reconciliation-smoke.mjs`, `enterprise-freight-smoke.mjs`) but aren't part of the automated pipeline, and don't cover Rush/Courier/Partner at all.
**What to do:** add a Playwright bot in Cursor. Have it write and run three flows:
- Rush: signup → browse → order → pay
- Courier: accept delivery → mark delivered
- Partner: receive order → accept/prep → get paid

### 2. Manual QA Tester
**Why:** automated tests catch *regressions* (things that used to work and broke). They don't catch *edge cases* a real person hits on day one — denied location permission, expired card, spotty network, weird timezone bug. Cheap to run as a bot doing structured exploratory passes with your app; pairs directly with #1.

### 3. Security Engineer (lightweight — you don't need a full pentest firm)
**Evidence:** `docs/edge-audit-redteam.md` already lists the exact checks to run (unauthorized access should return 401, etc.) but there's no record it's been executed. You're moving real money through Stripe Connect with 88 RLS-protected tables and no confirmed security pass.
**What to do:** have a bot actually run the redteam curl suite against your deployed environment, and pull Supabase's built-in security advisor report. This is an afternoon of work, not a hire.

### 4. DevOps Engineer (lite)
**Evidence:** you have real deploy scripts (`deploy:functions:all` and per-function Supabase deploys) but they're manually triggered, and CI doesn't gate merges on e2e/smoke tests.
**What to do:** wire your existing smoke scripts + the new Playwright tests into CI so nothing merges to `main` without passing them. Removes "it broke because someone forgot to run a check" as a launch-day risk.

### 5. Compliance pass (checklist execution, not a lawyer on retainer)
**Evidence:** `docs/dash-launch-compliance-checklist.md` already flags that Jamaica money-transmission licensing needs a real answer, and `PRIVACY_POLICY.md` + Play Store checklists are drafted but unverified against what your apps actually collect (location, push tokens, payment metadata).
**What to do:** a bot can verify your Play Store Data Safety form and Apple privacy labels match your actual data collection in an afternoon. The *licensing* question (do you need a money-services license to pay out couriers/merchants in Jamaica) is the one item on this whole list that may genuinely need a human — flag it to a real lawyer, don't let a bot "sign off" on it.

---

## Explicitly skip or defer — not wrong roles, just wrong timing

| Role | Why it waits |
|---|---|
| Product Manager, Scrum Master, Engineering Manager, CTO/CIO | You *are* these roles as a solo founder. Adding process overhead before you have a team to manage is friction, not leverage. |
| UX/UI Designer, Solutions Architect | Groundwork already exists in your repo (see table above). |
| Frontend/Backend/Mobile Developer | This is the core loop you're already running with Claude/Cursor — not a new "role" to bolt on. |
| Localization Specialist | No i18n exists; you're launching single-market. Revisit when you expand. |
| DBA, Data Engineer, Data Analyst | Supabase is a managed Postgres — a DBA is overkill pre-launch. No pipeline or analytics volume yet to justify a data hire. |
| SRE, FinOps Analyst | Sentry already gives you error visibility. You have no meaningful cloud spend yet to optimize. |
| AI/ML Engineer | Nothing in Rush's core function (rides/delivery marketplace) currently needs ML. Revisit only if you add matching/pricing algorithms. |
| Technical Writer | Nice to have; not launch-blocking. |
| Product Marketing Manager, Customer Success Lead, Release Manager | Real needs — *after* you have live users generating tickets and usage worth analyzing. Premature at day 0. |
| a11y Specialist, IAM Engineer, Enterprise Agile Coach, Procurement Specialist | These assume enterprise customers or a multi-team org. You have neither. Pure enterprise-scale roles — revisit only if/when a large customer contractually requires them (e.g., SSO, WCAG compliance). |

---

## Your actual 14-day plan

1. **Days 1–3:** Read `docs/dash-launch-phase4-gono-go.md` and `docs/dash-launch-compliance-checklist.md` in full. Check off (or actually fix) whatever you can. Flag the Jamaica licensing question to a real lawyer now — it has the longest lead time.
2. **Days 2–7:** Add the Playwright QA bot. Get the three golden-path flows (Rush order, Courier delivery, Partner payout) passing.
3. **Days 4–8:** Run the existing `docs/edge-audit-redteam.md` suite against your deployed environment. Pull Supabase's advisor report. Fix anything that fails.
4. **Days 6–10:** Wire Playwright + your existing smoke scripts into `.github/workflows/ci.yml` so they block bad merges.
5. **Days 8–11:** Manual QA pass — exploratory testing bot, edge cases, weird states.
6. **Days 10–13:** Verify Play Store Data Safety form + Apple privacy labels match reality.
7. **Day 13–14:** Walk through the go/no-go checklist one more time. Launch.

---

*Generated from a direct audit of the repo on 2026-08-19 — not a generic template. Re-run this audit if the app changes significantly before launch.*
