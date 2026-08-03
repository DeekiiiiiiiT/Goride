# Roam Enterprise vs. Fleetbase — Side-by-Side Capability Audit

**Date:** 2026-08-03
**Method:** Read-only comparison. Fleetbase's public repositories were shallow-cloned (`fleetbase/fleetbase` — Ember.js console, `fleetbase/core-api` — Laravel backend, `fleetbase/fleetops` — the fleet/transport-management extension) into a local temp folder and read directly, source-file by source-file — nothing here is inferred from marketing copy or READMEs alone. `apps/enterprise` and its dependencies (`supabase/functions/freight`, freight-related migrations, `apps/enterprise/src/fleet-bridge`) were re-read directly against current code rather than trusted from older docs. **No code was changed anywhere as part of this audit**, and nothing was cloned into or added to the Roam repository — the Fleetbase clones live in a throwaway temp folder outside this project.
**Scope note (by request):** this comparison covers Fleetbase's **core platform + FleetOps extension only** — not Fleetbase's Storefront (marketplace/commerce), Ledger, or AI-copilot extensions, since those overlap with Roam Dash/other Roam products rather than Roam Enterprise.

---

## 0. Executive Summary — read this before the tables below

A naive "does Roam have X" checklist against Fleetbase would be misleading in both directions, so two things need to be said up front:

1. **Roam Enterprise doesn't start from zero on fleet basics.** `apps/enterprise`'s `fleet-bridge` genuinely reuses `apps/fleet`'s already-live, production Vehicles, Drivers, Maintenance, Fuel, Toll, Trips, Reports, and Business Finance modules via direct component imports (not an iframe/proxy — real shared React components running inside Enterprise's own auth). So wherever this document says "Fleetbase has X, Roam Enterprise doesn't," the honest follow-up question is *"...does `apps/fleet` have it instead?"* — this doc flags that distinction every time it applies. Roam's strategic bet is: don't rebuild vehicle/driver/fuel/toll management inside Enterprise, borrow it from Fleet.
2. **Fleetbase is a mature, general-purpose, multi-tenant logistics operating system built to be resold/self-hosted by many different logistics businesses.** Roam Enterprise is a much younger, deliberately narrower product: a domestic freight/carrier/shipment module plus a genuinely specific, well-built vertical — a Jamaica Miami-to-Kingston **international mailbox/package-forwarding pipeline** (suite codes, Miami intake scanning, manifest sealing, customs board, hub sort, last-mile fulfillment via mixed fleets) — that **Fleetbase has no equivalent for at all.** That pipeline is real, working, end-to-end, and is Roam's actual differentiator, not a gap.

With that framing: Fleetbase is ahead on **platform depth** (multi-tenant developer platform, RBAC sophistication, route optimization, geofencing, rate-engine sophistication, dispatch orchestration) that a company building a *sellable, multi-industry logistics platform* would want. Roam Enterprise is ahead on **a specific, real business workflow** that no generic platform ships out of the box. Which gaps matter depends on which of those two things Roam is actually trying to be — see §5 for a scoped recommendation rather than a "close every gap" list.

---

## 1. Side-by-Side Capability Table

Legend: 🟢 Production-grade | 🟡 Partial/thinner | 🔴 Not found | ⚪ N/A / different architecture, not a gap

| Capability | Fleetbase | Roam Enterprise (+ Fleet-bridge where noted) | Gap? |
|---|---|---|---|
| Multi-tenancy / company scoping | 🟢 Global Eloquent scope + defense-in-depth per-query re-check, explicitly patched against a documented CVE | 🟢 Org-scoped RLS with service-role-only writes on freight tables — different mechanism (Postgres RLS vs. app-layer scope), comparable rigor | ⚪ Different, both real |
| RBAC (roles/permissions) | 🟢 3-tier role → policy → permission model, row-level "directive" query injection, dedicated IAM governance dashboards (privileged-access reports, policy-surface analysis) | 🟡 Module-level gating (`ModuleAccessProvider` fetches enabled modules per org) — coarser than resource:action permissions; broader Roam platform RBAC (JWT `app_metadata` roles, seen elsewhere in the codebase) may cover more, not independently re-verified for Enterprise specifically in this pass | 🟡 Real gap in granularity if Enterprise needs per-seat fine-grained permissions (e.g. "can bill shipments" vs. "can only scan packages") |
| Developer platform (API keys, sandbox mode, webhooks, rate limiting, usage analytics) | 🟢 Full developer-platform backend: live/test keys, per-credential policies, webhook delivery logs, configurable rate limiting, traffic analytics | 🔴 Not found anywhere in Roam — no external API-key/webhook system for customers to integrate against | 🔴 Real gap, but only matters **if** Roam Enterprise customers need to integrate their own systems (their WMS/ERP) against Roam — not required for the core ops workflow itself |
| Extension/plugin architecture | 🟢 Composer-package + Ember-engine system, dynamically mounted via a "universe" route registry | ⚪ Roam uses a different strategy entirely: monolithic apps + direct cross-app component reuse (`fleet-bridge`) rather than a pluggable extension system | ⚪ Architectural choice, not a gap — Roam isn't selling itself as a platform other companies extend |
| Notifications | 🟢 Multi-channel (email/SMS/push/in-app/WebSocket), registry-based, per-company recipient config | 🟡 SMS only for freight (Digicel), no push/in-app/WebSocket notification layer specific to Enterprise | 🟡 Real gap — ops staff have no in-app "new exception" alert, only customer-facing SMS |
| Chat/internal messaging | 🟢 First-class core feature — channels, participants, attachments, read receipts, always-mounted in the console shell | 🔴 None in Enterprise (Roam does have `@roam/ride-chat` for rides elsewhere in the monorepo, not wired into Enterprise) | 🟡 Gap, moderate priority — ops-to-ops or ops-to-client messaging inside the tool doesn't exist |
| File/document storage | 🟢 Multi-disk abstraction, signed URLs, polymorphic attachment to any model | 🟡 A real `documents` table exists on freight shipments; depth not independently verified in this pass | 🟡 Unverified, likely thinner |
| Activity/audit logging | 🟢 Platform-wide, spatie-based, auto-purged, per-model opt-in | 🟡 Freight has its own domain-specific audit trails (`tracking_events`, `package_scan_events` — append-only, idempotent) which are arguably *better suited to freight* than a generic activity log, but there's no general cross-entity "who changed what" log | ⚪ Different, adequate for freight specifically |
| Onboarding/signup | 🟢 Real multi-step state machine, first-user-is-admin bootstrap, email/SMS verification | 🟡 Not independently re-verified for Enterprise specifically in this pass — presumably rides on Roam's broader platform signup | Unverified |
| **Vehicle management** | 🟢 ~200-field model, maintenance/service subsystem, telematics, CSV import | 🟢 **Real, via Fleet-bridge** — Enterprise directly imports Fleet's own production Vehicle/Maintenance/Equipment components | ⚪ Not a gap — borrowed, not missing |
| **Driver management** | 🟢 Scheduling, push-notification routing, CSV import; driver performance/scoring is comparatively thin | 🟢 **Real, via Fleet-bridge** — Fleet's Drivers module | ⚪ Not a gap — borrowed |
| **Fuel & expense tracking** | 🟢 Manual reports + real 3rd-party fuel-card sync integration | 🟢 **Real, via Fleet-bridge** — per this codebase's own history, Fleet's fuel module is production-grade with AI-assisted extraction | ⚪ Not a gap — borrowed, arguably comparable or ahead (Fleetbase's fuel-card sync vs. Fleet's fuel + toll + AI extraction) |
| **Toll management** | 🔴 No equivalent found in Fleetbase at all | 🟢 **Real, via Fleet-bridge** — Fleet's Toll module (logs, tag inventory, analytics, reconciliation) | ⚪ **Roam advantage** — not a Fleetbase feature |
| **Order/Shipment core model** | 🟢 Extremely deep (~2,080-line model): configurable flow/state-machine "logic builder," multi-stop payloads (pickup/dropoff/return/waypoints), manifest/route consolidation, scheduled + on-demand | 🟡 Real but shallower: fixed status enum (not a configurable flow builder), `shipment_legs` schema supports multi-leg but the only creation UI builds a single leg | 🟡 Real gap in configurability and multi-leg UI, not in fundamentals |
| **Dispatch (manual)** | 🟢 Kanban board + a dedicated "Orchestrator Workbench" planning UI | 🟡 Manual "select assignee type" only, no board/queue visualization | 🟡 Real gap for domestic; the intl pipeline's Hub Station/Fulfillment Desk screens are closer to a real ops queue |
| **Dispatch (auto/matching)** | 🟢 Pluggable orchestration engines (Greedy, DriverAssignment, CapacityAllocation, RouteSequencing, VROOM) | 🔴 **No auto-dispatch of any kind.** Selecting "Roam marketplace" as an assignee is a schema/UI placeholder with **no confirmed code path that pushes a job into `apps/driver`'s real dispatch/offer system** | 🔴 **This is the single largest confirmed gap in this whole comparison** — see §4 |
| **Route optimization** | 🟢 Real VRP solving via a VROOM integration (self-hostable or SaaS) + full OSRM routing/distance-matrix wrapper | 🟡 Nearest-neighbor stop ordering only, for intl delivery batches; domestic shipments have no multi-stop routing at all | 🟡 Real gap, but scale-dependent — see §5 on whether this is worth building now |
| **Live GPS tracking** | 🟢 Dedicated tracking-provider service layer, ETA calc, position history, intelligent alerts (route deviation, prolonged stoppage, late departure, geofence arrival) | 🟡 Freight itself has **no live GPS** — only discrete status-event logs (Miami scan → manifest → hub → delivered). Fleet-bridge may provide live vehicle tracking for the *Fleet* side (Fleet's dashboard has a `FleetMap`/`RealTimeView`, not independently re-verified in this pass for freight-specific use) | 🟡 Real gap for the freight/shipment layer specifically — a customer or ops staffer cannot see a package/shipment moving on a live map, only its last logged status |
| **Zones & geofencing tied to pricing** | 🟢 Polygon zones with entry/exit/dwell/speed triggers, and pricing that geometrically apportions fees across zones a route passes through | 🔴 Not found in Enterprise's freight module | 🔴 Real gap, but a narrow, addressable one — see §5 |
| **Proof of delivery/pickup** | 🟡 Functional but generic (file + JSON `data` blob, no dedicated signature-vs-photo schema) | 🟢 Real, and arguably a cleaner implementation for the specific use case: token-based public POD link, SMS-delivered, no login required, expiring token | ⚪ Roughly comparable, different tradeoffs — not a gap either direction |
| **3rd-party/external carrier fulfillment** | 🟢 Real API-level integration (`IntegratedVendor` model, shipped example: Lalamove) — orders can be handed off to and synced with an actual external carrier's API | 🟡 3PL exists only as a data label (`carriers.is_own_fleet`, `shipments.mode`) — no evidence of an actual API integration to any real external carrier | 🟡 Real gap if Roam ever needs orders to sync bidirectionally with a partner carrier's system, rather than just recording that one was used |
| **Rates/Pricing engine** | 🟢 Very sophisticated: multi-strategy (fixed/per-distance-tier/per-drop/multi-zone/custom formula), COD fees, peak-hour fees, parcel-dimension-tiered fees | 🟡 Simple flat rate cards (currency + amount, client/date-scoped); real billing integration into a unified ledger, but no tiering/zone/formula logic | 🟡 Real gap in sophistication — but Roam's ledger integration is arguably a *better foundation* to build real pricing rules on top of than Fleetbase's `Algo.php` custom-formula system |
| **Contacts/Customers/Vendors CRM** | 🟢 Dedicated models, tied into billing and routing | 🟢 Real — `clients` model with rate-card linkage; `suites` model for intl customers | ⚪ Roughly comparable for current scope |
| **Reporting/Analytics** | 🟡 Export-driven (19 export classes), no dedicated BI layer — Fleetbase's own weakest area per this audit | 🟡 A real `GET /dashboard` (status counts, exception counts) exists; not independently verified beyond that | ⚪ Both thin; roughly comparable |
| **Billing/subscription (as a SaaS product)** | 🔴 Not implemented in Fleetbase core at all — only data-model placeholders (`stripe_customer_id`, `plan` fields), actual logic lives in an external, unreleased package | ⚪ N/A — Roam Enterprise isn't being resold as self-hosted software, this axis doesn't apply the same way | ⚪ N/A |
| **Domestic shipment billing** | ⚪ N/A (Fleetbase doesn't have Roam's specific billing model) | 🟢 Real — idempotent, ledger-integrated, rate-card-driven | ⚪ Roam-specific, working |
| **International (mailbox) pipeline billing** | ⚪ N/A | 🔴 **No billing/rate-card flow found for the intl mailbox pipeline at all** — packages, manifests, and delivery batches appear operationally unbilled by the system today | 🔴 **This is an internal Roam gap, not a Fleetbase comparison point** — flagged because it's serious on its own merits, see §4 |
| **Design system / UI kit** | 🟢 Self-built (`@fleetbase/ember-ui`), Tailwind-based | 🟢 Shares Roam's design tokens/`@roam/ui` conventions | ⚪ Comparable, different stacks |

---

## 2. What Roam Enterprise Has That Fleetbase Doesn't

Worth stating plainly, since a gap list alone undersells this: Fleetbase, across its entire public codebase (core + FleetOps), has **no equivalent whatsoever** to:

- **The Jamaica international mailbox/package-forwarding pipeline** — suite-code customer mailboxes, Miami warehouse intake scanning, idempotent custody-event logging, manifest sealing with a real customs CSV export, a customs status board, hub-station sorting, and last-mile fulfillment split between pickup and door-delivery batches with nearest-neighbor stop sequencing and token-based public proof-of-delivery. This is a real, specific, working vertical product — Fleetbase is a generic toolkit that could theoretically be configured toward something like this, but ships nothing like it.
- **Toll management** — no equivalent module exists in Fleetbase at all; this is a genuine Roam (via Fleet-bridge) advantage.
- **A single, unified company ledger spanning fuel, toll, freight billing, and business finance** — Fleetbase's billing is explicitly unimplemented in the open-source core; Roam's freight billing plugs into the same ledger system used elsewhere in the platform, which is a more coherent foundation for a real finance operation than what Fleetbase ships today.

---

## 3. Caveats — Comparisons That Aren't Apples-to-Apples

- **Fleetbase is designed to be operated/self-hosted by many different companies as their core software.** Its developer platform, extension marketplace, and multi-tenant policy governance exist because *other businesses* need to run and extend it. Roam Enterprise is Roam's own product for Roam's own customers — several of Fleetbase's "advantages" (API keys/webhooks for third-party developers, a pluggable engine architecture) only matter if Roam decides to sell Enterprise as a platform other companies integrate against, not for running the ops workflow itself.
- **The Fleet-bridge strategy means several apparent Fleetbase advantages are already closed, just by a different app.** Every table row above marked "via Fleet-bridge" would look like a red 🔴 gap if this audit only read `apps/enterprise` in isolation, the way the earlier RoamDash audits correctly warned against reading one app without checking its dependencies.
- **This audit did not re-verify `apps/fleet`'s live-tracking/geofencing depth in this pass** — it's referenced from this conversation's earlier context (`FleetMap.tsx`, `RealTimeView.tsx` exist), not freshly read line-by-line the way the freight module was. If Fleet's live tracking is shallower than assumed, the "live GPS tracking" gap in §1 is more severe than shown; if it's deep, the gap may be narrower than the table suggests it is *for freight specifically*. **Recommend a direct, dedicated read of `apps/fleet`'s tracking stack before treating that row as final.**

---

## 4. The Two Findings That Matter Most

If only two things get acted on from this document, these are the two with real business consequence, independent of any Fleetbase comparison:

1. **A freight job assigned to "Roam marketplace" doesn't appear to reach any real driver.** The schema and UI both let ops staff pick `roam_marketplace` as a delivery-batch assignee, but no code path was found that pushes that job into `apps/driver`'s actual dispatch/offer system. Today, only `org_fleet`, `client_fleet`, and `third_party` assignment paths are operational (staff manually mark pickups collected; client-fleet drivers get an SMS'd public POD link). If "use Roam's own driver marketplace for freight last-mile" is a real intended feature, it's currently a placeholder, not a working option — worth confirming this isn't silently offered to ops staff as if it works.
2. **The international mailbox pipeline has no billing.** Domestic shipments have real, ledger-integrated, idempotent billing. Packages moving through Miami → manifest → customs → hub → fulfillment appear to generate no invoice/rate-card charge anywhere in the system — this side of the business may currently be billed manually outside the app, which is worth confirming isn't accidentally leaving revenue uncollected.

---

## 5. Scoped Recommendations (not a "match Fleetbase feature-for-feature" list)

Given Roam Enterprise's actual direction (a specific freight-forwarding + domestic carrier product, not a general-purpose sellable logistics platform), the Fleetbase comparison suggests a different priority order than "close every red cell in §1":

**Worth doing, roughly in order:**
1. Resolve finding §4.1 (marketplace-driver dispatch) — either wire it for real or remove it as a selectable option until it is, the same category of issue as several "looks done, isn't" findings in the RoamDash audit.
2. Resolve finding §4.2 (intl pipeline billing) — a real revenue-integrity gap, not a competitive one.
3. Confirm/extend live tracking for freight specifically (leaning on whatever `apps/fleet`'s tracking stack already provides, per the caveat in §3, rather than building Fleetbase-style tracking from scratch).
4. A basic dispatch queue/board for domestic shipments (doesn't need Fleetbase's full orchestration-engine sophistication — even a simple "unassigned shipments" list view would close most of the practical gap).
5. Basic zone/distance-tiered pricing for domestic rate cards, if flat-rate pricing is becoming a real limitation for actual customers.

**Probably not worth building to match Fleetbase, given Roam's scope:**
- A full VROOM/OSRM-style VRP route-optimization engine — real engineering investment that pays off at a scale/route-density Roam's current freight volume likely hasn't reached yet.
- A general-purpose developer platform (API keys/webhooks/sandbox mode) — only relevant if external companies need to integrate against Roam Enterprise; not needed for Roam's own ops team to run the business.
- A pluggable extension/engine architecture — Roam isn't reselling Enterprise as self-hosted software; the Fleet-bridge reuse pattern already gets most of the practical benefit (shared code, not shared runtime plugins) with far less engineering investment.
- Fleetbase's 3-tier RBAC/policy governance system — worth revisiting only if Enterprise's current module-level gating genuinely blocks a real customer need for finer-grained seat permissions.

---

## 6. Methodology Notes

- Fleetbase repos were shallow-cloned (`--depth 1`) from their default branches on 2026-08-03; no specific release tag was pinned, so this reflects Fleetbase's `main` branch at clone time, not a specific version number.
- Fleetbase's `storefront`, `ledger`, and `ai` extensions, and its `navigator-app`/`storefront-app` mobile apps, were explicitly out of scope per the agreed comparison scope and were not cloned or read.
- The Roam Enterprise baseline was independently re-verified against current code, not taken from the older `docs/roam-enterprise-freight-forwarding-audit.md` (which predates the real product work described here and is now substantially stale on the "100% marketing site" framing — that finding no longer holds).
- No code was changed as part of this audit. The Fleetbase clones exist only in a local temp folder (`C:\fbtmp`) outside this repository and can be deleted at any time without affecting this project.
