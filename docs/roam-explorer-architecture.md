# Roam Plug — Free Launch Strategy

**Rev 4 · 2026-10-23 · Plan only — no code changed.**
**App name:** **Roam Plug** (was "Roam Explorer" in the draw.io; same product).
**Market:** Jamaica only — **island-wide launch, all 14 parishes**. **Scope:** the free public app only. Nothing is sold in this phase.
The long-term marketplace design is summarised in §11 so the free launch doesn't block it.

**Owner decisions (Rev 3):**
1. Name: Roam Plug.
2. All extras (§2, #5–8) ship in v1.
3. Island-wide from day one — this launch exists to build the database as fast as possible.
4. Mapping: existing Dominion stations + the owner mapping from a normal user account + public users. **Every pin is approved by the owner in Dominion** before it enters the database (the verified-gas-station process).
5. The owner builds out the parts catalog and adds more vehicles over time.

**Owner decisions (Rev 4):**
6. Domain: a Vercel domain for now (e.g. `roam-plug.vercel.app`); a real domain is bought later.
7. **Gas stations use the existing Fleet process, unchanged.** Roam Plug fills feed the *same* Dominion Station Database the same way Roam Fleet fills do. The only difference is the **source** (Roam Fleet or Roam Plug). Fuel prices show right away.

---

## 1. Goal

Give Jamaican drivers free tools they use every week. Every use adds verified data to Roam Dominion. Selling services comes later, once the map and the catalog are full.

**The one action that drives everything is a fuel-up.** A user logs a fill the same way a Roam Fleet driver does. That one log gives:

| The user gets | Dominion gets (anonymised) |
|---|---|
| Next service due, maintenance history | Which vehicles are on Jamaica's roads (demand per catalog variant) |
| Fuel spend and km per litre | A GPS pin that maps or confirms a gas station |
| Price paid per litre | A live fuel price for that station |

People then pin **auto parts stores and mechanic shops** whenever they're at one, which maps those too.

---

## 2. What the free app offers

| # | Feature | What the user sees | Data it feeds Dominion |
|---|---|---|---|
| 1 | **Gas stations** | Map + list, current price per grade with age, cheapest near me, directions (Google Maps / Waze link) | Station locations, prices |
| 2 | **My Garage + maintenance** | Add vehicle → log fuel with odometer → service due dates, history, reminders | Vehicles in use, odometer/usage patterns (aggregated) |
| 3 | **Auto parts info + stores** | "What parts fit my car" (5 tiers from Dominion), store map | Parts demand, store locations |
| 4 | **Mechanic shops** | Map + list, services offered, hours | Shop locations, services |

**Extras — all in v1** (they bring users back between fuel-ups):

| # | Extra | Why |
|---|---|---|
| 5 | **Fuel spend & mileage** | Comes free from the fuel logs (km/L, monthly spend). Reuse Fleet's fuel maths. |
| 6 | **Document reminders** | Licence, registration, fitness and insurance renewal dates — a reason to open the app when not fuelling. Reuse the Independent driver document centre pattern. |
| 7 | **Air pumps & restrooms** | Just two more place types on the same map and pin flow. |
| 8 | **Tolls** | Highway 2000 toll prices from the existing Toll Database (read-only). |

Browsing the map needs no account. An account is needed to add a vehicle, log fuel or pin a place.

---

## 3. Reuse from Roam Fleet (don't rebuild)

The fuel logging process is the Fleet/driver app process, used unchanged:

| Fleet piece | Used in Explorer for |
|---|---|
| Odometer capture (`OdometerScanner` — photo scan with confidence, decreasing-reading and >1,500 km jump checks) | Fuel log odometer |
| Fuel entry flow + GPS capture at the pump | Fuel log + station pin + price |
| Station resolution (GPS match → verified / learnt / unverified, aliases, geofence radius, hand review) | Matching each fill to a station |
| Odometer ledger (`odometer_ledger_foundation`) | Per-vehicle odometer history |
| Catalog variant picker (`CatalogVariantPicker`) + Pending catalog | Adding a vehicle; unknown models go to Dominion's Pending catalog |
| `schedule_for_variant` + maintenance templates + `LogMaintenanceServiceDialog` | Service due dates and logging a service |
| `parts_for_vehicle` / `catalog_api.ts` tiers 1–5 | Parts info |
| Petrojam prices + retail markup band | Sanity-checking reported prices |
| Offline sync manager | Logging fuel with no signal |

**How to reuse it:** move the shared logic into packages (e.g. `@roam/fuel-core`, `@roam/location`, a new `@roam/vehicle-care`) that both the driver app and Explorer import. Don't copy files between apps. Where edge code needs the same logic, follow the mirror + Deno drift-test pattern.

**What changes for a public user:** Fleet drivers are org-scoped (`organization_id`) and their fills go to fleet reconciliation and finance. Explorer users have **no org**, and their fills must **never** enter fleet finance, reconciliation or settlement. Explorer fuel logs are personal tracking only.

---

## 4. Data architecture

### 4.1 Three separate homes

| Home | Holds | Never holds |
|---|---|---|
| **Dominion** (master data) | Places (stations, parts stores, mechanics, air pumps, restrooms), current prices, vehicle catalog, maintenance templates, parts catalog, anonymised counts | Any user, any user's vehicle, any user's location trail |
| **Explorer** (new `explorer` schema) | User profile, My Garage vehicles, fuel logs, odometer readings, services logged, reminders, place submissions | Edit rights on master data |
| **Fleet** (unchanged) | Fleet orgs, drivers, fleet fuel and finance | Explorer users or their logs |

This is the existing Dominion rule ("no customer records") applied to the public.

### 4.2 New tables (outline)

**Gas stations — the existing Station Database, not a new table.** Roam Plug fills go through the same station resolution path Fleet uses (GPS match → existing station, or a new `learnt` station → owner verifies in Dominion). Add only:
- a **source** on every station and every piece of evidence: `roam_fleet` | `roam_plug` | `manual` (who first created it, plus which app each fill came from);
- a nullable org: Plug-created stations have **no `organization_id`**, and Plug fills never carry a fleet org;
- Station Database filters/columns for source, so the owner can see where each station and each confirmation came from.

**Other place types — `places` schema**, built to work exactly like the Station Database (same statuses, geofence, aliases, review queue):
- `places.place` — one physical location: name, brand, PostGIS point, Plus Code, parish / town / community pcode (spatial join to `delivery.admin_boundaries`), status, geofence radius, `verified_at`.
- `places.place_capability` — `air_pump`, `restroom`, `parts_store`, `mechanic`, `car_wash`, `ev_charging`… with typed details (services, hours). A place can point at a gas station (`station_id`) — **a gas station that also has a restroom and an air pump stays one station**, with those capabilities hung off it, not three new places.
- `places.place_evidence` — every observation for or against a fact.
- `places.place_change_proposal` — pending changes for consensus or review.
- `places.price_observation` / `places.price_current` — reported and published prices per grade.

**Explorer — `explorer` schema:**
- `explorer.user_vehicle` — user, catalog variant id, year, nickname, starting odometer.
- `explorer.fuel_log` — vehicle, litres, amount, price/L, grade, odometer, GPS fix + accuracy, `place_id` (once matched), photo ref.
- `explorer.service_log` — vehicle, op code (from maintenance templates), odometer, date.
- `explorer.reminder` — service or document type, due date / due km, notified at.
- `explorer.place_submission` — "I'm at a parts store / mechanic / air pump": GPS, name, photo, capability.

### 4.3 One station database, two sources

No migration of stations. Both apps write to the same Station Database:

```
Roam Fleet fill ─┐
                 ├─▶ same station resolution ─▶ Station Database (Dominion) ─▶ owner verifies
Roam Plug fill  ─┘        (GPS match / learnt)       source = fleet | plug
```

Rules:
- **Same matching, same thresholds, same review screens** — no second station pipeline.
- **Privacy both ways:** Roam Plug must never show which fleet a station came from, and fleets must never see Plug users. The public Plug map reads station facts only (name, brand, location, grades, price), never the fill that created it.
- **Fleet finance is untouched:** a Plug fill can create or confirm a station, and set a price, but never enters fleet fuel logs, reconciliation, gas-card matching or settlement.
- **Checked 2026-10-23 (read-only, prod):** `fleet.stations` has **206 stations, all with `organization_id` NULL** — already platform-wide, one shared database. 56 are `verified`. Name + location (3 dp) gives 204 distinct, so **~2 possible duplicates** to review in Dominion before launch. No restructuring needed for Plug to write into it.

---

## 5. Crowdsourcing — how data becomes "verified"

Same idea as the verified gas stations in Dominion today, generalised to every place type.

```
 user action ──▶ evidence ──▶ cluster ──▶ proposal ──▶ auto-apply or Dominion review ──▶ place
```

### 5.1 Where evidence comes from

| Source | Strength (shown to the approver) |
|---|---|
| Already-verified Dominion stations | Moved in as `verified` (§4.3) |
| Fuel log GPS at the pump | Strong — it's a real transaction |
| Owner's own pins (normal user account) | Strong — but **still goes through the same approval queue**, no back door |
| User pin with good GPS (≤ 30 m accuracy) + photo | Medium |
| User pin, no photo | Weak |

No bulk imports at launch — every place in the database comes from a pin that was approved.

### 5.2 Rules — owner approves every mapping

- **Nothing a user maps goes public until it is approved in Dominion.** This is the verified-gas-station process applied to every place type (gas station, parts store, mechanic, air pump, restroom, car wash, EV charger).
- **Status ladder:** `pending → verified` (approved) or `rejected`; later `closed / duplicate / anomaly`. Only `verified` places appear in the app. The person who pinned it sees "Submitted — awaiting approval" on their own map.
- **Approval covers mappings, not every reading.** New places, moved pins (> 30 m), closures and name/brand changes need approval. **Fuel prices show right away** if they fall inside the Petrojam band (§5.3); out-of-band prices are held for review.
- **Gas stations follow the Fleet process exactly** (§4.3): a fill at an unknown spot creates a `learnt` station immediately, as Fleet does today, and the owner verifies it in the Station Database. Other place types (parts stores, mechanics, air pumps, restrooms, car washes) use the pending → approved queue.
- **Duplicates are grouped, not repeated.** A pin inside an existing place's geofence becomes evidence on that place, not a new item. Ten people pinning the same unmapped Rubis = **one** review item showing 10 pins, not ten.
- **The Station Database review stays as it is**, with a new "Source" filter (Roam Fleet / Roam Plug).
- **History:** every approval/rejection is an event with who and when; nothing is overwritten silently.

### 5.2a The approval queue has to be fast (island-wide volume)

One person approving every mapping across 14 parishes means the Dominion queue must be built for speed:

| Need | Design |
|---|---|
| See it at a glance | Map view of the pending pin, its GPS accuracy circle, nearby verified places, the photo, Street View link |
| Grouped evidence | One row per candidate place with pin count, distinct users, best accuracy, first/last seen |
| Fast actions | Approve, Reject, Merge into existing place, Move pin, Edit name/brand/type — keyboard shortcuts; next item loads automatically |
| Bulk | Approve a selection when evidence is strong (e.g. ≥ 3 distinct users, accuracy ≤ 20 m) |
| Triage | Sort/filter by parish, place type, evidence strength, age; strongest first |
| Suggested answer | The system pre-fills "Likely duplicate of X" or "Strong — 5 users, 12 m" so most decisions are one click |
| Workload | Count waiting, oldest waiting, approved per day — on the Dominion dashboard |

Reuse the Station Resolution Queue / hand-review screens as the starting point rather than building a new one. If the queue outgrows one person later, add a "Reviewer" Dominion role with the same screen — no redesign needed.

### 5.3 Fuel prices

- Price comes from the fuel log (amount ÷ litres), already captured by the Fleet process.
- Reject prices outside **Petrojam wholesale + allowed retail markup** (`fuel.petrojam_prices`, `fuel.retail_price_markup`).
- Publish immediately (owner decision) — the latest in-band price per grade shows on the station right away, with its age ("updated 2 h ago"). Fleet and Plug fills both count.
- Prices expire at the next Petrojam weekly price change.

### 5.4 Abuse protection

- Rate limits per user, device and place.
- Device integrity checks (Play Integrity / App Attest) and mock-location detection.
- Impossible-travel check between a user's pins.
- Trust score per user: approved mappings raise it, rejected ones lower it. Shown to the approver to speed decisions; it never auto-approves.

### 5.5 Rewards (optional, no money)

Badges, a contributor level, "first to map" credit. No cash or discounts in this phase.

---

## 6. Maintenance tracking — how it works

1. User adds a vehicle by picking make / model / year / variant from the Dominion catalog. Not found → goes to **Pending catalog** for review; user can still log fuel meanwhile.
2. User enters the current odometer once.
3. Each fuel log adds an odometer reading (validated like Fleet: no decreases, flag big jumps).
4. The app estimates **km per day** from the readings and projects each service due date from `schedule_for_variant` (km interval *or* time interval, whichever comes first).
5. Push reminder before a service is due. User logs the service (or "done elsewhere") to reset that item.
6. Dominion receives only aggregates: vehicles in use per variant, average km/day per variant, which services are being done. No user identities.

**Data gap (owner is filling it over time):** Dominion has **5 global maintenance templates and 0 vehicle-specific ones**. Launch does not wait for this: until a vehicle has its own schedule, it uses the global template, labelled "General schedule — a schedule for your exact car is coming". As the owner adds vehicles and schedules, users' reminders upgrade automatically. My Garage counts in Dominion show which cars to do next (most-owned first).

---

## 7. Auto parts & mechanics (information only)

- **Parts info:** user picks a part for their vehicle → results in the 5 tiers already built (Direct OEM, sister vehicle, engine-compatible, aftermarket, universal). Show **where to find it**: nearby parts stores. No stock, no prices from stores, no buying in this phase.
- **Data gap (owner is filling it over time):** the parts catalog has **0 confirmed parts**. Show parts info only for vehicles that pass Dominion's readiness check; others see "Parts for your car are coming soon". Each vehicle switches on automatically when it becomes ready — no app release needed.
- **Searches with no result** are logged anonymously as demand in Dominion's Data quality screen.
- **Mechanic shops:** map + list with services from the standard service list (maintenance-template op codes), hours, phone. Users can pin a shop and tick the services they saw.

---

## 8. Platform & technology

| Concern | Decision |
|---|---|
| App | New `apps/plug` (Roam Plug) in the monorepo: Vite + React + Capacitor (web PWA + Android + iOS), same as the driver app. Shared `@roam/ui`, `@roam/design-tokens`, `@roam/auth-client`, `@roam/location`. |
| Domain | Vercel domain for now (e.g. `roam-plug.vercel.app`). Keep the URL in **one config value** so moving to the real domain later is a config change. When moving, update: Supabase auth redirect URLs, Google Maps API key allowed referrers, Capacitor deep links / Android App Links, CORS allow-list on the edge functions, and a redirect from the old Vercel URL. |
| Accounts | Same Supabase auth, new role `explorer_user`; phone sign-up (+1876). No org. |
| Backend | Same Supabase project. New schemas `places` (Dominion) and `explorer` (users). Fill the `platform-catalog` edge function stub as the **public read API** (places near me, place detail, prices, parts tiers, schedules). New `explorer` edge function for signed-in writes (vehicles, fuel logs, pins). Consensus as a scheduled job. |
| Public traffic | Explorer is the first app with **anonymous public traffic**. No raw table is readable by `anon` (see the RLS exposure audit). Public reads come from **precomputed read models** (e.g. `places.public_place`, refreshed on change) with CDN cache headers (`STABLE_GET_CACHE`). This also protects the Disk IO budget the project already struggles with. |
| Maps | Google Maps for display; deep-link to Google Maps / Waze for directions. Track cost in API Center budgets. **Do not store Google Places content** (their terms) — only `google_place_id` as a reference. |
| Offline | Cache the last region's places and prices; queue fuel logs and pins offline (reuse the driver offline sync). |
| Photos | Supabase Storage, EXIF stripped, hashed for duplicates, retention policy. |
| Flags | Each feature behind a flag in Explorer admin, default off. |
| Admin | `/admin` inside the Explorer app for user support, abuse and flags. Place review stays in Dominion. |

---

## 9. Privacy (Jamaica Data Protection Act 2020)

- Location consent and a plain privacy notice at sign-up.
- Users can export and delete their data.
- Register with the Office of the Information Commissioner.
- Keep the derived fact ("station X exists here"), age out raw GPS trails after a set period.
- Only anonymised counts flow to Dominion — never which user was where.
- RLS on every new table from day one; views `security_invoker = true`; no `SECURITY DEFINER` function granted to `anon`.

---

## 10. Launch plan (island-wide)

| Step | Scope | Done when |
|---|---|---|
| **0 — Foundation** | Station source tag (fleet / plug) + Plug fills wired into the existing station resolution; review the ~2 possible duplicate stations (§4.3); `places` schema for the other types; public read API; RLS + read models | A Plug test fill creates/confirms a station exactly like a Fleet fill, tagged `roam_plug`, and never appears in fleet finance; `anon` can't read raw tables |
| **1 — Approval queue** | Station Database: Source filter. New Dominion "Places" screen for the other types, built on the Station Database screens, with the fast queue (§5.2a) | Owner can approve/merge/reject a grouped item in one click |
| **2 — Roam Plug v1** | All features at once: gas stations + prices, My Garage, fuel logging (Fleet process), maintenance reminders, parts info (ready vehicles only), parts-store / mechanic / air pump / restroom / car wash map + pinning, fuel spend & mileage, document reminders, tolls | On Play Store (+ iOS + web); public API served from cache; load test without Disk IO alarms |
| **3 — Owner mapping** | Owner maps from a normal user account; pins go through the same queue | Owner's own pins flow end-to-end into the database |
| **4 — Public launch, all 14 parishes** | Open sign-ups island-wide | Queue keeps up (oldest pending under ~7 days) |

**Why island-wide works:** the goal of this launch is volume of data, not polish in one area. Because nothing goes public without approval, wider coverage doesn't risk bad data — it only grows the queue. That's why §5.2a (grouping, bulk approve, suggested answers) is a launch requirement, not a nice-to-have.

**Parish view:** even island-wide, track and display coverage per parish so you can see which parishes are thin and push mapping there (e.g. a "Help map St Elizabeth" prompt in the app).

### Numbers to watch (in Dominion)

- Places by type and status, **per parish** (coverage map)
- Pending queue: count, oldest item, approved per day
- Fuel logs per week; verified stations with a price under 7 days old
- Vehicles in My Garage per catalog variant → which vehicles to add schedules/parts for next
- % of users whose car has its own schedule; % whose car has parts info
- Rejection rate per user (signals abuse)

---

## 11. Later — selling (kept in view, not built now)

Design choices above keep these open:
- **Explorer Partners app** (one login, sections per business type) — partners *claim* places already in the registry.
- **Parts click-and-collect, mechanic bookings, restroom passes** — on the existing Rush money engine, not a new one.
- **Roadside assistance** (JAA competitor).

Nothing in §1–§10 should be built in a way that needs undoing for these: places are partner-claimable, services use standard op codes, parts use catalog ids.

---

## 12. Still open

None. The station-storage check is done (§4.3): stations are already shared platform-wide.
