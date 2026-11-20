# Research engine (cars, specs, parts) — audit

**Rev 2.6 · 20 Nov 2026 · Status: PLAN CLOSED (reviewer: "close it and build") — next = build, starting with
Spike 0.** Rev 2.6: the listing → rule → auto-match → S3 effect is named (RE-12), trigger-made vehicle jobs set
`origin` / `browser_check_allowed` (RE-07), "Waiting its turn" is defined, recipes read "Not run yet" before their
first run, and the Stitch prompt moved into `docs/stitch/research-engine/`. Rev 2.5: the round-2 review fixes (conflict route, per-type browser-check gate,
recipe-test logging, round-2 features folded into §6, two coverage states, sourced counters, §8/§10 re-based,
screens committed to `docs/stitch/research-engine/`). New, separate audit (not part of
`log-service-parts-gaps-audit.md`). Follows `docs/how-we-build-playbook.md`: Data → Server → Screens → Tests, numbered
problems with one fix each, done-tests first. Rev 1 was read from the code and the live database on 20 Nov 2026.
Rev 2 folds in the round-1 review. Every review claim was re-checked against the code, and the cost numbers were
measured live (§2).

**Rev 2 changes:** RE-01 rewritten: the engine only reads sites that allow automated reading, with no bypass of bot
protection. The URL-context "verbatim" fallback is gone, and blocked catalogues become browser checks for the owner.
RE-05 now gates trust in matching, not just readiness, and has a column→key map. RE-07 removes the organisation id
from the vehicle job key. RE-10 drops "3 jobs per tick" and fixes the spend-cap pause. RE-12 keeps `part_fitment` as
a view. RE-14 uses a SQL increment. RE-17 adds a notice table. §8 names the real switch. New items: RE-19 (routing
from the source rule), RE-20 (permanent evidence), RE-21 (security), RE-22 (duplicate proposals), RE-23 (privacy
rule enforced by test) and RE-24 (cost model).

**Rev 2.1 changes (second plan review):** each review claim was re-checked in code, and all of them held. The
grounding price was looked up (Google: US$14 per 1,000 search queries, 5,000 free a month; §2). Spike 0 is added
before layer 1 (RE-25). In-place fixes:
- RE-01: 429 backs off and never blocks.
- RE-11: site state moves to a new `trusted_site` table.
- RE-12: the four `part_fitment` readers move to `part_listing` and the table is dropped; the worker runs
  auto-close after the save RPC.
- RE-13: the existing match vocabulary is kept.
- RE-19/RE-20: engine verdicts carry every evidence read, the route and `trust_set_by = 'engine'`.
- RE-22: the vehicle proposal key uses `production_start_year`.
- RE-24: grounding is logged first and the target is set from the spike.

New items: RE-26 (RLS on new tables), RE-27 (no customer text to Google), RE-28 (priority split and browser-check
limits) and RE-29 (owner-checked tier).

**Rev 2.2 changes (third plan review):** each review claim was re-checked in code, and all of them held.
- §4 adds `dominion_audit_log`, the job's `origin` + `browser_check_allowed`, and the two `trust_set_by` CHECKs.
- RE-23 replaces `select("*")` with an allowlist and bans `requested_name` / `requested_part_number`.
- RE-12 keeps the `/admin/part-fitment` JSON contract and dedupes by interchange group.
- RE-01: a 429 no longer creates a browser check.
- RE-19 defines a number conflict.
- RE-29 re-checks expire after 30 days unanswered.
- RE-10 and §2 state Google's daily grounding limit.
- RE-25's fallback is written as the plan.
- §10 gives the build size.

**Rev 2.3 changes (fourth plan review; round 1 closed):** each review claim was re-checked in code, and all of them
held.
- RE-19 conflicts get their own table, `research_number_conflict` (`part_match_conflict` can't hold them), shown
  in S1 only.
- RE-10 adds a `grounding_daily` case.
- RE-12 keeps the fitment write verbs at 403.
- RE-28/29: any browser check unanswered for 30 days expires.
- §4 seeds `trusted_site` before the FK.
- The `part_fitment` removal check includes a code search.

## 0. Goal (one sentence)

**Dominion fills itself: for any car version, the engine finds the car's exact identity, its sizes and fluids, and its
parts from trusted catalogues, proves each one with a saved copy of the page it came from, and adds it — the owner
only reviews what it could not prove.**

Rules this audit keeps (from the owner, unchanged):
- **Dominion is master data and feeds the apps one way.** Dominion screens show nothing from fleets, companies,
  plates, drivers or app activity. That includes counts, dates asked and free text typed in an app. Fleet requests
  may *queue* research on the server, but Dominion only ever shows the car and the part type.
- **Source rule (6 Nov):** an item is Confirmed only from one of three sources. (1) The car maker's catalogue, or a
  frame-number site trusted for that maker (Amayama, Megazip, Partsouq for Toyota/Daihatsu/Lexus). (2) The part
  maker's own catalogue, for its own part. (3) Two independent part makers naming the same factory number. Shops,
  aggregators and TecDoc copies (RockAuto, Autodoc, eBay…) = Needs checking. Forums and AI summaries are never a
  source. Every row keeps its source page.
- **Information only:** no prices, stock, suppliers or ordering.
- **Customer screens never mention the database or lookups** (memory `feedback-no-database-talk-to-customers`).
- **The engine reads a site only if the site allows automated reading.** It never works around bot protection and
  never sends pages through a third party to get past a block. A site that blocks the engine is checked by the
  owner in a browser (RE-01).

## 1. How the vehicle database works today (map)

```
CAR VERSIONS            vehicle_catalog (2,679)  ── platform (vehicle_platform 1,210) ── engine family (997)
                        93 columns: identity (make/model/years/chassis_code/engine_code/drivetrain…) + spec columns
CAR SPECS (two homes)   (a) columns on vehicle_catalog (tire_size, bolt_pattern, brakes, oil, coolant…) — CSV, no source
                        (b) catalog_spec_value (16 rows, 3 cars) keyed by spec_key (18 keys)
                        bridge: specs_for_variant already shows 5 CSV columns as unsourced catalog_note rows
PARTS                   part_master (54) → part_interchange_group (52) → part_listing (262 rows, 63 cars)
                        + interchange_fitment_rule (249) + part_oe_reference (19) + vehicle_oe_number (10)
                        + universal_part (7, "fits by size" via spec_key — treats every catalog_spec_value as sourced)
                        part_fitment (0 rows) — written by promote_part_proposal, read by 4 server paths
FIT ENGINE              parts_for_vehicle(car, part type) → tiers 1–5 (made for car / also fits / by size / check)
                        auto-match recompute → part_match_conflict (40: 27 kept, 13 superseded)
READINESS               variant_parts_readiness (10 core part types per car) → 0 of 2,679 cars "ready"; best 4/10
REQUESTS                Fleet (Find parts "Ask Roam", Log service "Add … as the part I used")
                        → parts_sourcing_requests (+ outbox) → catalog_research_job (one per car + part type + place)
                        + trigger on pending vehicle requests → vehicle job keyed …:organization_id
RESEARCH ROBOT          cron every minute (HTTP timeout 120 s) → catalog-research edge fn → catalog_research_worker.ts:
                        1 claim job (pgmq, single-flight: "busy" if any job researched in the last 10 min)
                        2 Gemini (gemini-3.8-flash) + Google Search grounding · 3 fetch each source page
                        4 substring checks · 5 route: auto if 2 distinct domains pass (shadow mode ON → review)
                        6 proposal row · "Looks right" = promote_part_proposal
TRUST                   two lists: trusted_source (12 rows) and catalog_trusted_source (6 rows, the robot's)
SWITCH                  catalog_research_settings.enabled; revision server catalog-research-6, admin pins catalog-research-1
SCREENS (Dominion)      Pending catalog (Parts · Vehicles · Auto-match conflicts · Settings & Health), Research
                        settings, Parts database (Find parts · Full database · Add parts · Trusted sources),
                        Vehicle Catalog (car page + specs), Data quality
```

## 2. Live numbers (20 Nov 2026)

| What | Number |
|---|---|
| Car versions | 2,679 (119 makes, 1,225 models; 2,507 from CSV, 172 manual; `market` empty on all) |
| Cars with a chassis code | 1,916 (763 without) |
| Cars with any spec in `catalog_spec_value` | **3** (16 rows) |
| Spec columns filled on `vehicle_catalog` (CSV, no source) | tyre 2,471 · bolt pattern 2,469 · brakes 2,490 · oil 300 · coolant 292 |
| Parts / listings / cars with a listing | 54 / 262 / 63 (mostly Roomy + Tank M900A/M910A) |
| Cars "ready" (10 core parts verified) | **0** |
| Research jobs ever | **3** (all part jobs; 0 vehicle jobs) · proposals 6 · auto-added 0 |
| Trusted-site page reads | 9 ever: masuma.parts 2× 200; partsouq 2× 403; amayama 4× 403; megazip 1× 403 |
| Robot sites blocked | partsouq.com (1 Nov), **amayama.com (20 Nov 16:35)** |
| Research settings | shadow mode ON, streak 0/20, 40 jobs/day, 1 job/minute |
| Gemini cost logged for research (all time) | 23 calls, **US$0.0043** total; one gemini-3.8 job (search + JSON) = **US$0.00075** |
| Not in the log | the Google Search grounding fee (RE-24) |
| Grounding price (Google pricing page, 20 Nov) | **US$14 per 1,000 search queries**, 5,000 free a month across Gemini 3+; billed per query, and one call can run several. The free 5,000 are shared with every Gemini 3+ grounding call in Roam, not just this engine |
| Grounding daily limit (same page) | 1,500 grounded requests a day → at ~2 queries per job the engine's real ceiling is ~750 jobs/day (one job per ~2 minutes when grounded); the target needs ~233/day |

## 3. Problems found (one fix each)

### A. The robot can't read the sources it trusts

**RE-01 — Trusted car-maker catalogues refuse the server.** Every read of Amayama, Megazip and Partsouq returned 403
(bot protection). Two 403s in a row auto-block a site, so Amayama was blocked today and Partsouq has been blocked
since 1 Nov. No car-maker page has ever passed a check. These sites are blocking automated reads on purpose, so
reading them another way would break their terms.
**Fix:** one page reader, `readSourcePage(url)` (new `_fleet-server/research_page_reader.ts`), used for every source
read. It does a direct fetch only, and only for a site whose `trusted_site.automated_read` is `allowed` (RE-11).
That value is set when the site is added, after checking the site's robots.txt and terms, and the check date is
stored. `not_checked` means no read at all: browser checks only. A site that answers 401/403 twice in a row gets
`automated_read = 'blocked'`, and from then on the engine never reads it. A 429 is not a block: the reader waits for
the site's `Retry-After` (15 min if none), puts the job's read back on the queue, and sets `trusted_site.backoff_until`.
The job is deferred, never failed, and no browser check is created.
When a site is `blocked`, the engine instead creates a **browser check** (RE-20) holding the exact catalogue link and the number or car to look
for. The owner opens the link, pastes the matching row of text, and presses **Confirm** or **Not on this page**.
Amayama, Megazip and Partsouq start as `blocked` (browser checks). SB (sbparts.jp), NiBK (jnbk-brakes.com) and
masuma.parts start as `allowed` once their robots.txt and terms are checked. Two part makers agreeing (source rule
route 3) is the engine's main automatic way to reach Confirmed.

**RE-02 — The robot searches the open web instead of looking the car up in the catalogue.** The query is a plain web
search. Google returns forum posts, shops and grounding redirects, and the robot hopes one of them is a trusted
catalogue page. Today's run proposed Jtekt 3G080 with no page showing the number or the car.
**Fix:** catalogue-first lookup on `allowed` sites. New table `research_lookup_recipe`: site, maker, kind
(`by_part_number` | `search_then_page`), search URL template, the rule for picking the result link, the page block
rule, and active. Part-maker sites have a public search by car or by number, so a recipe runs that search first,
follows the matching result, and then reads the block. Catalogues keyed by their own internal ids get no URL
template; they are reached through their search page or not at all. For `blocked` car-maker sites the recipe only
builds the link for the owner's browser check. Gemini search runs only to suggest candidate numbers when no recipe
exists for the maker. Its numbers are always checked through a recipe or a browser check and never confirm anything
on their own. Seed recipes: sbparts.jp, jnbk-brakes.com, masuma.parts, plus browser-check links for amayama.com,
megazip.net and partsouq.com.

**RE-03 — Page checks are substring tests on the whole page.** "Number found" means the number appears anywhere in
the HTML. "Car found" means the chassis code, or model + engine, appears anywhere. "Position found" means the word
"rear" appears anywhere. Menus, "related parts" lists and other cars on the same page all pass, and a one-line
synthetic page passes the current test fixtures.
**Fix:** deterministic extraction on the server. The page is parsed (DOM) and the recipe's block rule picks the
table row or card that holds the number. Number, car identity (chassis + frame range or engine code) and position
must all appear in that same block. No model reads the page to decide whether a check passed. The block is saved in
`research_page_read` (RE-20). Test fixtures are real saved pages from each seeded site, including one that shows the
number only in a "related parts" list.

### B. Car identity

**RE-04 — 763 car versions have no chassis code, and research never uses the frame range.** Toyota/Daihatsu EPC
lookups need the chassis code plus the frame number range (`chassis_serial_from`). The prompt sends only
make/model/years/chassis/engine/drivetrain.
**Fix:** research input is the full identity: chassis code, frame range (`chassis_serial_from` + a new
`chassis_serial_to`), engine code, drivetrain, transmission and grade/trim. A car with no chassis code gets a
**vehicle identity job** first (RE-07). Its part and spec jobs wait until the identity is filled.

### C. Car specs

**RE-05 — Two homes for car specs, and trust doesn't gate matching.** Tyre size, bolt pattern and brake type sit on
~2,470 cars as `vehicle_catalog` columns from a CSV with no source. `specs_for_variant` already shows five of those
columns as unsourced `catalog_note` rows, and every `catalog_spec_value` row counts as sourced for "fits by size".
The readiness view counts any spec with a non-empty `evidence_url`. About 12 service-spec columns exist but only 5
have a `spec_key`, and the brakes screen uses `front_brakes`/`rear_brakes` keys that aren't in `spec_key`.
**Fix:** `catalog_spec_value` becomes the only spec home, and trust gates every reader. One migration:
1. Add `trust` (`confirmed` | `needs_checking`). `evidence_url` may be NULL only when the trust is `needs_checking`.
2. Add a fixed column→key map table `spec_column_key_map` (column, spec_key, unit) and the ~7 missing keys, including
   `front_brake_type` and `rear_brake_type`; the brakes screen switches to those keys. Columns that are not service
   specs (wheel offset, brake disc size, body dimensions) stay on `vehicle_catalog` and are not copied.
3. Copy every mapped, filled column into `catalog_spec_value` as `needs_checking`, with
   `source_note = 'CSV import <batch code>'`.
4. `specs_for_variant` returns `trust` and stops building `catalog_note` rows from columns.
5. `parts_for_vehicle` "fits by size" (tier 3) uses only `confirmed` specs. A `needs_checking` spec gives tier 5
   ("check before buying").
6. The readiness view counts only `trust = 'confirmed'`.
7. Vehicle Catalog edits and CSV import write `catalog_spec_value`; the mapped columns stop being written.

**RE-06 — The robot never researches specs.** Battery size and type, oil grade and capacity, wiper lengths, bulbs,
tyre size and fluids are found by hand (the Roomy battery on 20 Nov took an owner session).
**Fix:** `job_type = 'spec'` (car version + `spec_key`), run through the same pipeline: recipe or browser check →
`readSourcePage` → block check → `catalog_spec_proposal`. "Looks right" writes `catalog_spec_value` with scope
variant, trust confirmed, and a link to the `research_page_read` evidence.

### D. Vehicles

**RE-07 — Vehicle research is broken, and its job key leaks the customer.** A trigger already creates one vehicle
job per pending request. Its `group_key` is `vehicle:Make:Model:Year:organization_id`, and that key is returned by
`/jobs` and written into `export.csv`, so a Dominion export carries organisation ids today. The worker then
researches "the newest pending request" instead of the job's own. Nothing approves a `catalog_vehicle_proposal`
(0 rows).
**Fix:** the trigger's key becomes `vehicle:Make:Model:Year`, so one job serves every request for that car. Its
INSERT also sets `origin = 'fleet'` and `browser_check_allowed = true`, so trigger-made jobs join the 50/50 claim
split and can open browser checks. Existing
jobs are re-keyed and merged in the same migration. Add `catalog_research_job.pending_request_id` (FK, never returned
by any route) and `vehicle_catalog_id` for identity jobs. The worker reads only that row. There are two vehicle
jobs: **identity** (fill chassis, frame range, engine, drivetrain, transmission and grade for an existing car
version) and **new version** (from a pending request). Proposal approve route: `approve` writes or updates
`vehicle_catalog` with its evidence; `reject` keeps the reason. Duplicates are caught by chassis + engine + year
overlap before writing.

**RE-08 — The car list only grows by CSV or one request at a time.** There is no way to say "get every Roomy
version".
**Fix:** a "Research this model" job. Make + model go in. Every version comes back from `allowed` sources or browser
checks (chassis codes, years, frame ranges, engines, drivetrains, transmissions) as vehicle proposals, matched
against existing rows (update / new / same). One review screen per model (S2).

### E. How work starts and how much gets done

**RE-09 — The engine only runs when a Fleet user asks (3 jobs ever).** Nobody can ask it to fill a car, so 0 of
2,679 cars are ready.
**Fix:** a coverage planner. On a car version (S6), **Fill this car** queues one job per missing item: the 10 core
part types plus the core spec keys (battery_jis/type, oil grade/capacity, wiper sizes, bulbs, tyre size, brake
fluid, coolant). On a model, **Fill every version**. Priority is set on the server only: Fleet requests first, then
owner-queued work, then the nightly sweep of cars with an identity but no coverage.

**RE-10 — Throughput is capped by a job count, and hitting the spend cap kills the engine.** Today the limit is one job a
minute and 40 a day, while a single car needs ~25 jobs. Claims are single-flight, and the cron HTTP call times out
at 120 s, so taking more jobs per tick won't fit. When the Gemini budget is hit, `trackedProviderCall` throws
`ProviderBlockedError`, but `classifyGeminiProviderError` doesn't recognise it. The engine then counts it as a normal
failure: 3 failures → pause → auto-resume → cap again, and after the 4th attempt the pause becomes permanent and
jobs that reach `max_reads` are marked failed.
**Fix:**
1. **Batch by car + part group.** One job = one car + one part group, with one Gemini call for candidates and each
   group page read once.
2. **One job per tick, but shorter ticks.** A job does at most 4 page reads and must finish inside 90 s. Reads it
   didn't reach go back on the queue as a follow-up step of the same job.
3. **Single-flight by job, not globally.** The claim skips only jobs that are being worked on.
4. **The cap is spend, not a job count.** `catalog_research_settings.daily_spend_usd` is set from the cost model
   (RE-24).
5. **One provider-fault type.** `classifyGeminiProviderError` returns one enum for every provider-side cause:
   `budget_daily` (pause until 00:05 UTC), `grounding_daily` (Google's 1,500-a-day grounding limit, matched on the error body's quota text whatever the
   status, including 429; checked before the generic 429 case; paused until 00:05 UTC), `budget_monthly` (pause until the 1st), `killswitch` (no auto-resume),
   401/402/403 (no auto-resume), 429 (15 min), 404 "model not found / no longer available" (no auto-resume; the
   reason names the model), 500/502/503/504 (15 min). A provider fault never counts as a job failure or against
   `max_reads`, and on resume those jobs return to the queue.

### F. Trust and proof

**RE-11 — Two trusted-site lists disagree.** `trusted_source` (Add parts rule, 12 rows) and `catalog_trusted_source`
(robot, 6 rows) differ. The robot trusts rockauto.com and 7zap.com (aggregators/TecDoc copies) and lacks sbparts.jp,
jnbk-brakes.com, bremboparts.com and partsfinder.bilsteingroup.com.
**Fix:** one list in two tables. `trusted_site` (new, `domain` primary key) holds the per-site state:
`automated_read` (`allowed` | `blocked` | `not_checked`; `not_checked` = no reads), `automated_read_checked_at`,
`blocked_at`, `backoff_until` and `pages_confirmed`. `trusted_source` keeps one row per `(kind, maker_norm, domain)`
(its existing unique key), with `domain` as an FK to `trusted_site`. Blocking Amayama therefore updates one row. The
robot reads the join. `catalog_trusted_source` (domain key) is migrated into `trusted_site`, plus one `trusted_source`
row per maker, and then dropped.
rockauto.com and 7zap.com become `kind = 'reference'`: they may suggest numbers but never confirm. Only the platform
owner can write to this list (RE-21). It is edited on one screen (S5).

**RE-12 — "Looks right" writes to the wrong table.** `promote_part_proposal` inserts `part_master` and
`part_fitment`. `parts_for_vehicle` reads `part_listing`, so an approved find never reaches Fleet Find parts.
`part_fitment` itself has four readers: the admin part-fitment list (`part_sourcing_routes.ts:602`), the legacy
reference-parts path (`catalog_api.ts:225`), `maintenance_routes.ts:3546` and `vehicle_catalog_enterprise.ts:86/115`.
The function also inserts a `fleet_parts_notices` row for every request, including service-log ones.
**Fix:** rewrite `promote_part_proposal` to save through the Add parts path (`save_self_serve_part_in_batch` with a
batch, so Undo works). That writes the part, interchange group, one `part_listing` per car version and position from
the proposal's fit, factory numbers as `part_oe_reference`, the evidence link (RE-20), and the trust from the source
rule (RE-19). The RPC returns the batch id. The calling code (the approve route, or the worker for auto-add) then
runs the request auto-close (`autoResolveFromBatch`, LC-21c, a server function that SQL cannot call). The direct
notice insert is dropped.
Each `part_listing` the promote writes also fires the existing `part_listing_sync_rule` trigger, which writes the
`interchange_fitment_rule` (`source = 'listing'`) for that car and position. That rule is what makes the part show at
tiers 1–3. It also feeds the auto-match recompute, so any `part_match_conflict` it opens appears on S3 (Auto-match
conflicts), naming the part. S3 itself is unchanged.
`part_fitment` has a different shape from `part_listing` (`part_id`, `chassis_code`, `engine_code` against
`interchange_group_id`, `vehicle_catalog_id`, `position`), so it can't be a same-column view. It has 0 rows. The four
readers switch to `part_listing` (joined to `part_interchange_group` → `part_master` and `vehicle_catalog`) through
one shared helper, `listingsForVehicle(catalogId)`, with one route test each. Then the table, its unique index and
its writer are dropped in the same build. Each reader returns what Fleet's Find parts already shows for that car,
where today it returns nothing.
`/admin/part-fitment` is an HTTP contract used by both apps (admin and fleet `partSourcingService`
list/create/patch/delete, and `ResultsView` reading `item.fitmentId`). It is re-implemented over `part_listing`
and returns the **same JSON shape**: `fitmentId` = the listing id, the nested `part_master`, and `chassis_code` /
`engine_code` taken from the listing's `vehicle_catalog` row.
- Only `GET` is re-implemented. `POST` / `PATCH` / `DELETE` keep today's 403 "Fitment is read-only. Add the part on
  the vehicle." (`part_sourcing_routes.ts:616-632`), and the contract test asserts the 403s.
- The vehicle-delete dependency count (`partFitments` in the admin UI) counts `part_listing` rows.
- `listingsForVehicle` returns one row per interchange group + position, so a part already returned by
  `parts_for_vehicle` for the same car is not listed twice.
- One contract test per verb compares the response keys with today's.

**RE-13 — The proposal's "fit" is the model's guess, not the page's.** `fits` holds what Gemini typed, and
`match_type` is free text that routing groups by.
**Fix:** fit comes from the evidence block (RE-03): car version ids, frame range, position codes from the job's place
scheme, and quantity. The proposal gets a new column `match_kind` that uses the vocabulary already in use (importer:
`oem | sister | engine | aftermarket | universal`). It is set from the source kind and the page, never from the
model's text. The job's existing `match_type` (part of `researchGroupKeyV2`) is not changed, so open requests and
jobs are not re-keyed.

**RE-14 — Auto-add can never graduate, and the streak can lose counts.** Shadow mode needs 20 approvals in a row of
proposals that "would auto-add", and none can. The streak resets on any approval of a review-only proposal. It is
also updated read-modify-write in the route, so two approvals at once can lose a count.
**Fix:** keep shadow mode. Graduation counts only proposals with `shadowWouldAuto = true`, and the streak resets only
when the owner **rejects** or **edits** one of those. The counter is changed by one SQL function
(`catalog_research_streak_bump(proposal_id, outcome)`) with an atomic `UPDATE … SET streak = streak + 1`. The
streak is shown on S4.

**RE-19 — Auto-add counts domains, not the source rule.** `routeProposals` auto-adds when two distinct domains pass,
and the worker loads domains without their kind. So masuma.parts + rockauto.com auto-adds today, even though
RockAuto is Needs checking.
**Fix:** routing reads the source rule. Each passed check carries its site's `kind` and `maker`. A proposal is
**Confirmed** in any of three cases:
- (a) one `car_maker` source for the car's maker (a browser check counts);
- (b) one `part_maker` source for its own brand's part;
- (c) two `part_maker` sources from different brands naming the same factory number for the car.

A proposal can **auto-add** only through (b) or (c) from automated reads, with no number conflict, and with shadow
mode off. A **number conflict** is two Confirmed-eligible numbers for the same car version + part type +
position that are not in one interchange group. Then both go to review, and one `research_number_conflict` row is opened
for that car + part type + position. It holds job_id, vehicle_catalog_id, platform_component_id, position,
proposal_ids[], opened_at, closed_at and resolution (`picked` | `both_wrong`), with one open row per car + part type +
position. `part_match_conflict` (fixed `conflict_type` CHECK, no part-type or position column, read by S3) is not
used. The conflict shows in the S1 drawer as a "Two makers disagree" card. **Use this one** on either number closes
it and rejects the other; **Neither is right** closes it and rejects both. `reference` sources never count. Anything else goes to review as Needs
checking. A Confirmed verdict
saves `evidence_read_ids[]` (both reads for route c), `trust_route` (`a` | `b` | `c` | `owner_browser`, RE-29) and
`trust_set_by = 'engine'` on `part_listing` and `catalog_spec_value`. The save function takes `p_trust_set_by` and
`p_evidence_read_ids` instead of stamping `owner` whenever a trust is passed. The phase-3a trust trigger accepts an
engine verdict when `evidence_read_ids` is present. Both phase-3a trigger bodies (`part_listing` and
`vehicle_oe_number`) and their CHECKs (`trust_set_by IN ('auto','owner')`) change to allow `engine`. The bulk
backfill leaves existing rows as they are. When the owner presses Looks right, `trust_set_by` stays
`engine` and `verified_by` records the owner. Unit tests cover each case, including masuma + rockauto → review and
route c keeping both reads.

**RE-20 — Evidence lives in editable model text.** The proposal stores a quote that can be edited, isn't linked to
the page read, and is never re-checked. A year from now nobody could show why a row is true.
**Fix:** a new append-only table `research_page_read`. Each row records the url, final_url, http_status, read_at, the
recipe used, `block_text`, `block_hash` (sha-256) and `body_hash`. Browser checks are rows with path `owner_browser`,
the pasted text and the owner's user id. Updates and deletes are blocked by trigger. Every confirmed
`part_listing`, `catalog_spec_value` and `vehicle_catalog` change made by the engine keeps `evidence_read_ids[]`. A
monthly re-check job re-reads `allowed` evidence pages. If the block hash changed and the number is gone, the row
becomes Needs checking and a Dominion notice is raised (RE-17).

### G. Reliability and security

**RE-15 — A provider outage burns jobs.** Covered by RE-10 step 5: one provider-fault enum including 404 and 5xx.

**RE-16 — The request header says "Failed" while the research box says "needs_review".** The header badge shows the
request group status, not the research job state.
**Fix:** when a job exists, the header badge reads the research job state, using the same labels as the list's
status column.

**RE-17 — A paused engine is silent.** The robot sat paused from 19 Nov 21:52 to 20 Nov with only a red line on one
page. `catalog_research_health()` is a report that also resets stuck jobs while being declared `STABLE`.
**Fix:** split it. `catalog_research_health()` becomes read-only (`STABLE`, no writes), and a new
`catalog_research_unstick()` (`VOLATILE`) resets stuck jobs. A new table `dominion_system_notice` holds kind,
subject, opened_at, closed_at and detail, with one open row per kind + subject. A cron every 15 minutes runs
`catalog_research_raise_notices()`, which opens or closes notices for: engine paused > 30 min, site blocked, spend
cap hit, and evidence changed (RE-20). Notices show as a banner on Overview and Pending catalog (S8).

**RE-18 — Brand names are normalised against 54 parts.** `loadKnownManufacturers` reads brands from `part_master`
only, so new part makers come out in Gemini's spelling ("Nsk", "Jtekt").
**Fix:** the brand list comes from `trusted_source` part makers + `catalog_maker` + `part_master`, with an alias
table (`NSK` ⇐ `Nsk`, `JTEKT`/`Koyo`). It is applied before any proposal is saved.

**RE-21 — The new surface has no security controls.** The reader would fetch any URL from grounding metadata or
admin-editable templates, with no allowlist and no private-IP block. Page text also feeds the model that picks
candidates, which opens the door to prompt injection. Any `catalog.write` user can add a confirming site, and
`POST /reprocess-queued` loops every queued job with no limit.
**Fix:**
- `readSourcePage` fetches only https URLs whose host is an `allowed` `trusted_site` domain. It resolves DNS first
  and refuses private, loopback, link-local and metadata ranges, with redirects re-checked hop by hop (max 3).
- Responses are capped at 2 MB and 15 s.
- Page text never goes to the model. Extraction is deterministic (RE-03), and the model only receives the car
  identity and suggests numbers.
- Writes to `trusted_site`, `trusted_source` and recipes need the platform owner role and write a `dominion_audit_log` row.
- `reprocess-queued` handles at most 50 jobs per call and allows one call per minute per user.

**RE-22 — Retries duplicate proposals.** pgmq delivers at least once, and `catalog_part_proposal` has no unique key. A
crash after the insert but before `complete_msg` re-creates every proposal.
**Fix:** unique index on `(job_id, part_number_norm, position_key)`, and every proposal write is an upsert. Same for
`catalog_spec_proposal (job_id, spec_key)` and `catalog_vehicle_proposal (job_id, chassis_code, engine_code,
production_start_year)`. Each job step records its step number on the job, and a redelivered message skips any step already
done.

**RE-23 — The privacy rule isn't enforced by the test.** The drawer shows "What they asked" and "First asked"
(`PendingPartRequestDrawer.tsx:269`). The list shows first/last asked (`PendingPartsCatalogTab.tsx:468`). A message
says "1 company was told the part is on file". `catalog_privacy.test.ts` explicitly allows `fleet_count`, and it
doesn't register the research routes.
**Fix:** Dominion research and pending routes return only car identity, part type/place, job state, proposals and
evidence. Every `select("*")` in `catalog_research_routes.ts` (`/jobs`, `/jobs/:jobId`, proposals, events, vehicle
proposals) and in the pending-parts routes becomes an explicit column allowlist. Removed from responses and screens: first/last asked, request text, fleet/company counts and "N companies
told" messages. `fleet_count` stays on the server for priority only. `findCustomerIdentityLeak` adds `fleet_count`,
`first_requested_at`, `last_requested_at`, `need_text`, `request_text`, `requested_name`, `requested_part_number`,
`looking_note`, `organization_id` and `pending_request_id`
to its banned keys. The privacy test registers every route in `catalog_research_routes.ts` and the pending-parts
routes, and it scans `export.csv` output.

**RE-24 — Cost has no model, so a cap can't be set.** The measured model cost is US$0.00075 per job (gemini-3.8,
search + JSON). Google Search grounding costs US$14 per 1,000 search queries after 5,000 free a month, and one call
can run several queries, so it is the largest cost. It is not logged, and the spend guard only sums logged costs, so
`daily_spend_usd` is not a cap until it is. Filling everything is about 2,679 cars × ~8 part/spec groups ≈ 21,000
batched jobs. At ~2 queries per job that is ~42,000 queries, about US$400–600 in total, against ~US$16 for tokens.
Grounding only runs when no recipe exists for the maker (RE-02), so the real figure is lower.
**Fix:**
1. **Log grounding first (the first item in layer 2).** `trackedProviderCall` writes a `service = 'grounding'` line
   per call with `queries = groundingMetadata.webSearchQueries.length` and cost = queries × US$0.014, after the
   month's 5,000 free queries. The guard sums it with the token cost.
2. **Show cost and the cap.** S4 shows the measured cost per job over the last 7 days (tokens + grounding). The daily
   cap is computed nightly as (jobs left × cost per job) ÷ days to the target, with a floor of US$1/day.
3. **Set the target from Spike 0 (RE-25).** The target date is written into `fill_target_date` from the spike's
   measured cost per job and automatic share.
4. **Say what the target covers.** It is the 1,916 cars with a chassis code. The 763 without one get identity jobs
   first (RE-04), and they are counted on S4 as their own line ("identity first").

### H. Measure first, data handling and owner load

**RE-25 — Two unmeasured numbers decide the plan.** The first is cost per job including grounding (RE-24). The
second is how much of Confirmed the engine can reach by itself from allowed part-maker sites. If two part makers
don't both list a part type, every Toyota/Daihatsu/Lexus item becomes a browser check. The ceiling is ~1,916 cars ×
17 items ≈ 32,500 checks, or ~180 hours at 20 s each.
**Fix:** **Spike 0** runs before layer 1 and is written up in this audit (§2) before any migration.
1. Check robots.txt and terms for sbparts.jp, jnbk-brakes.com, bremboparts.com and masuma.parts. Record each as
   allowed or blocked.
2. For the Roomy M900A, check by hand on those sites which of the 10 core part types and 7 core spec keys can be
   Confirmed by route (b) or (c).
3. Run 20 grounded research calls on the current engine and record queries per call and cost.

What follows is set by the measured results:
- **Fill order.** If at least half of the 17 items are automatic, the fill runs as written. If fewer are, the goal
  for this build is **"Dominion fills the cars that matter first"**: the sweep runs on the top 200 car versions by
  Fleet demand (ranked on the server, never shown in Dominion), `fill_target_date` is set for those, and the rest
  wait. This branch is part of the plan now, not a later decision.
- **Browser checks.** They are always capped by RE-28.

**RE-26 — New tables have no stated access rules.** §4 adds `research_page_read`, `dominion_system_notice`,
`spec_column_key_map`, `brand_alias`, `trusted_site`, `research_lookup_recipe` and `catalog_spec_proposal`. Only the
append-only trigger is specified, and that doesn't stop the REST API.
**Fix:** every new table in the migration gets `ENABLE ROW LEVEL SECURITY`, a deny-all policy (`USING (false)`), and
`REVOKE ALL … FROM anon, authenticated`, the same as the other catalog tables. All access goes through the server's
service role. An SQL check asserts RLS is on and anon/authenticated hold no privileges on each table.

**RE-27 — Customer text still goes to Google.** The worker puts `Fleet notes: <need_text · looking_note ·
old_part_number>` into the Gemini prompt (`catalog_research_worker.ts:280-295`). So "no fleet data" holds on screen
but not in what leaves the server.
**Fix:** the prompt carries only the car identity, the part type and the fit descriptor. `need_text` and
`looking_note` are never sent. `old_part_number` is sent only when it matches the part-number pattern (letters,
digits, `-`, at most 30 characters), as "candidate number to check". A unit test asserts the prompt contains none of
the request text fields.

**RE-28 — Fill work can starve, and browser checks have no limit.** With "Fleet first, then owner-queued, then
sweep", 30 requests a day can stop the coverage planner indefinitely. Nothing limits how many browser checks the
engine creates.
**Fix:**
- **Claims alternate 50/50** between Fleet-requested jobs and fill jobs (owner-queued, then the sweep), read from the
  new `catalog_research_job.origin` (`fleet` | `owner_fill` | `sweep`; existing jobs backfilled as `fleet`). When one side
  is empty, the other takes the slot.
- **Browser checks are created only for** Fleet-requested jobs and cars where the owner pressed **Fill this car** or
  **Fill every version**, stored as `catalog_research_job.browser_check_allowed` when the job is queued. The nightly
  sweep never creates them; its unproven items stay Needs checking.
- **At most 25 open browser checks** at a time, ordered by Fleet demand. Any more wait as `browser_check_queued` and
  open as earlier ones are done.
- **Any browser check unanswered for 30 days expires.** A new check closes as "Couldn't find" (the item stays Needs
  checking) and frees its slot. A re-check follows RE-29.
- **S1 shows the open count.**

**RE-29 — An owner's pasted row can't be re-checked by the engine.** The monthly re-read covers allowed pages only.
**Fix:** browser-check verdicts are saved with `trust_route = 'owner_browser'` and show as **"Confirmed ·
owner-checked <date>"**, separate from engine-confirmed rows on every Dominion screen and in readiness counts (both
count as verified). After 24 months the engine opens a new browser check for that row, within the RE-28 limit. If it is
not answered within 30 days, the row becomes Needs checking (it stops counting for readiness and tier 3), and a
Dominion notice opens (RE-17).

## 4. Data layer

| Change | Detail |
|---|---|
| Every new table | `ENABLE ROW LEVEL SECURITY`, deny-all policy, `REVOKE ALL … FROM anon, authenticated` (RE-26) |
| CHECK constraints | dropped and recreated in the same migration: `catalog_research_job.job_type`, `trusted_source.kind`, `catalog_trusted_source.kind` (before its merge), `part_listing.trust_set_by` and `vehicle_oe_number.trust_set_by` (add `engine`) + both phase-3a trigger bodies |
| `research_number_conflict` (new) | job_id, vehicle_catalog_id, platform_component_id, position, proposal_ids[], opened_at, closed_at, resolution; one open row per car + part type + position; RLS deny-all (RE-19) |
| `dominion_audit_log` (new) | actor, action, table_name, row_id, before, after, at; append-only; RLS deny-all (RE-21/26) |
| `trusted_site` (new) | seeded with every distinct domain from `trusted_source` + `catalog_trusted_source` **before** `trusted_source.domain` gets its FK; domain PK, automated_read, automated_read_checked_at, blocked_at, backoff_until, pages_confirmed (RE-01/11) |
| `research_lookup_recipe` (new) | site, maker_norm, kind `by_part_number` / `search_then_page`, search_url_template, result_link_rule, block_rule, active (RE-02) |
| `research_page_read` (new, append-only) | job_id (nullable), `purpose` (`job` / `recipe_test` / `recheck`), url, final_url, path `direct` / `owner_browser`, http_status, recipe_id, block_text, block_hash, body_hash, checked_by, read_at; update/delete blocked; replaces `catalog_trusted_source_fetch` (RE-01/03/20) |
| `dominion_system_notice` (new) | kind, subject, detail, opened_at, closed_at; one open row per kind + subject (RE-17) |
| `spec_column_key_map` (new) + ~7 `spec_key` rows | column → spec_key + unit; `front_brake_type`, `rear_brake_type` and the others (RE-05) |
| `brand_alias` (new) | alias → brand (RE-18) |
| `catalog_research_job` | + `origin` (fleet / owner_fill / sweep, backfill fleet), `browser_check_allowed`, `pending_request_id` (never returned), `vehicle_catalog_id`, `spec_key`, `batch_key`, `step_done`; `job_type` adds `spec`, `vehicle_identity`, `vehicle_model`; vehicle trigger key drops `organization_id` + re-key/merge existing (RE-06/07/08/10/22) |
| `catalog_part_proposal` | `fits` → structured (`vehicle_catalog_ids[]`, `position_codes[]`, frame range, qty); new `match_kind` (oem / sister / engine / aftermarket / universal); job `match_type` unchanged; `evidence_read_ids[]`; unique `(job_id, part_number_norm, position_key)` (RE-13/20/22) |
| `catalog_spec_proposal` (new) | job_id, vehicle_catalog_id, spec_key, value, unit, type, evidence_read_ids[]; unique `(job_id, spec_key)` (RE-06/22) |
| `catalog_vehicle_proposal` | + `existing_vehicle_catalog_id`, `action` new/update/same, frame range, evidence_read_ids[]; unique `(job_id, chassis_code, engine_code, production_start_year)` (RE-07/08/22) |
| `part_listing` | + `evidence_read_ids[]`, `trust_route` (a / b / c / owner_browser); `trust_set_by` accepts `engine`; save function takes `p_trust_set_by` + `p_evidence_read_ids`; phase-3a trust trigger accepts engine verdicts (RE-19/29) |
| `catalog_spec_value` | + `trust`, `trust_route`, `trust_set_by`, `evidence_read_ids[]`; `evidence_url` NULL only when needs_checking; mapped CSV backfill as needs_checking (RE-05) |
| `specs_for_variant`, `parts_for_vehicle`, readiness MV | trust returned; tier 3 + readiness use confirmed only; no `catalog_note` from columns (RE-05) |
| `vehicle_catalog` | + `chassis_serial_to`; mapped spec columns no longer written (RE-04/05) |
| `trusted_source` | unchanged key `(kind, maker_norm, domain)`, + FK domain → `trusted_site`; kind adds `reference`; owner-only writes; `catalog_trusted_source` dropped (RE-11/21) |
| `catalog_research_settings` | `daily_job_limit` → `daily_spend_usd` (computed nightly), `fill_target_date` (set from Spike 0), claim share 50/50, `max_open_browser_checks` 25; `catalog_research_streak_bump()` (RE-10/14/24/25/28) |
| `promote_part_proposal` | rewritten (RE-12), returns the batch id |
| `part_fitment` | table, unique index and writer dropped after its four readers move to `part_listing` (RE-12) |
| `catalog_research_health()` / `_unstick()` / `_raise_notices()` | read-only report / stuck-job reset / notice writer (RE-17) |
| SQL checks (`supabase/tests/research_engine_checks.sql`) | promote writes `part_listing`; `part_fitment` gone and no SQL function references it (plus a CI code search: no `part_fitment` / `"part_fitment"` in `supabase/functions/` or `apps/*/src/`); RLS on + no anon/authenticated privileges on every new table; an engine verdict survives the trigger on both `part_listing` and `vehicle_oe_number`; an owner-checked row unanswered 30 days after its re-check becomes needs_checking; engine verdict saved with `trust_set_by = 'engine'` and both route-c reads; spec backfill count = 2,471 tyre values, unmapped columns untouched; needs_checking spec never used by tier 3 or readiness; one trusted list; `reference` can't confirm; `research_page_read` rejects UPDATE/DELETE; duplicate proposal upsert keeps one row; vehicle job key has no org id |

## 5. Server layer

| Piece | What it does | Test |
|---|---|---|
| `research_page_reader.ts` | allowed-host https fetch, DNS/private-range block, redirect re-check, 2 MB / 15 s caps, saves `research_page_read`; 2× 401/403 → `blocked`; 429 → back off (`Retry-After`), never block; `not_checked` → no read | 200 saved; 403 twice → blocked + browser check; 429 → job deferred, site still allowed; private IP / non-allowed host / redirect to 169.254 refused |
| `research_recipes.ts` | search → result link → page; DOM block extraction; browser-check link builder | saved SB + NiBK pages give the right block; Amayama gives a link, no fetch |
| `catalog_research_route.ts` | routing by source rule (RE-19) | masuma + rockauto → review; SB + NiBK same number → auto-eligible; Amayama browser check → Confirmed, not auto |
| `catalog_research_worker.ts` | job types part / spec / vehicle_identity / vehicle_model; batch per car + group; ≤ 4 reads and 90 s per tick; step-idempotent; upserts | each type end-to-end with fixtures; redelivered message makes no duplicate |
| `catalog_research_verify.ts` | block checks (number + identity + position in one block) | number only in a "related parts" block fails; one-line synthetic page fails |
| `catalog_research_provider.ts` | one provider-fault enum incl. `ProviderBlockedError`, 404, 5xx | budget_daily → pause to 00:05, no job failed; 404 → pause, reason names model |
| `api_usage_logger.ts` (first in layer 2) | grounding line per call: queries × US$0.014 after 5,000 free/month; guard sums it | one grounded call moves the guard's day total |
| prompt builder (worker) | car identity + part type + fit only; `old_part_number` only if it matches the pattern (RE-27) | prompt contains no `need_text` / `looking_note` |
| claim (`catalog_research_claim`) | 50/50 Fleet vs fill; browser checks only for Fleet + owner-filled cars, max 25 open (RE-28) | 30 Fleet jobs + 30 fill jobs → alternating claims; sweep job creates no browser check |
| `listingsForVehicle` (new helper) | the four former `part_fitment` readers use it; one row per group + position (RE-12) | one route test per reader; no part listed twice |
| `/admin/part-fitment` (part_sourcing_routes) | `GET` returns the same JSON shape over `part_listing`; `POST`/`PATCH`/`DELETE` stay 403 (RE-12) | GET keys equal today's; the three write verbs return 403; fleet + admin `partSourcingService` tests pass |
| routes (`catalog_research_routes.ts`) | fill car / fill model / research identity; vehicle + spec proposal approve/reject; browser check confirm; trusted-source + recipe writes (owner only, audit row); reprocess-queued ≤ 50, 1/min | one route test each; non-owner trusted-source write → 403 |
| `POST /research/recipes/:id/test` (round 2) | runs one recipe once for a chosen car under RE-21 fetch limits; logs the read in `research_page_read` with `purpose = 'recipe_test'` (no job); never counts toward the 2×401/403 block, never creates a browser check, writes no proposal, listing or spec; returns the block or "nothing found"; owner only | test returns the SB block for the Roomy and one `recipe_test` read row; two failed tests leave the site `allowed`; non-owner → 403 |
| `POST /research/conflicts/:id/resolve` (round 2) | body `picked` + proposal id, or `both_wrong`. **picked:** the chosen proposal is promoted through the Looks-right path, the other is rejected with reason "owner chose the other number", the conflict closes as `picked`, and the request closes once. **both_wrong:** both proposals rejected, conflict closes as `both_wrong`, job set to `not_found`. Owner + `catalog.write`; one `dominion_audit_log` row | picked → one `part_listing`, other proposal rejected, request closed once; both_wrong → no listing, job `not_found`; resolving a closed conflict → 409 |
| browser-check confirm (in routes) | gate by job type: **part** → the pasted line must contain the car (frame code or model) and a part number; **spec** → the car and a non-empty value of that spec's shape (battery code/type, viscosity, litres, mm, tyre size, colour/type text). The value read is echoed in "Detected:" | part line without a number → 422; battery spec "M900A … EFB" → accepted with value EFB; coolant "M900A … LLC Pink" → accepted |
| `POST /research/jobs` single item (round 2) | "Research this part" on a coverage tile queues one job (same route as Fill this car) | one tile → one job with `origin = owner_fill` |
| `promote_part_proposal` + approve route | Add-parts save path in SQL; route/worker then calls `autoResolveFromBatch` | approved proposal shows in `parts_for_vehicle` and the request closes |
| `catalog_privacy.test.ts` | all research + pending routes registered; banned keys extended; export.csv scanned | a response with `fleet_count` or `first_requested_at` fails |

## 6. Screens (Dominion) — every screen and button this touches

**S1 Pending catalog → Parts tab.** List columns: car version, part, place, status, result, Open. No asked dates
(RE-23). Filters: All / Needs review / Browser check / Researching / Queued / Added automatically / Added / Couldn't
find / Failed, with the open browser-check count ("7 of 25 open", RE-28). Also search, Export CSV (no request or org fields), Reprocess queued (up to 50), Queue priority and
Resume dispatcher. *Request drawer:*
- Header badge shows the job state (RE-16). "What they asked", "First asked" and "N companies told" are removed.
- **Roam found** cards show the evidence block, the site and its kind, the read date, the structured fit (cars,
  positions, frame range) and the trust route (a/b/c, RE-19).
- Checks list.
- **Looks right** saves via the Add-parts path (RE-12). Also **Edit and add**, **Research next** and **Couldn't find
  it**.
- **Undo auto-add**, shown only when the item was auto-added.
- *Browser check card:* **Open catalogue page** (new tab to the exact link), a paste box for the matching row, a
  "Detected:" read-back, **Confirm** (enabled per job type: part → car + part number; spec → car + a value of that
  spec's shape) and **Not on this page**.
- *Two makers disagree card* (RE-19): two maker cards (logo, number, read date, **See the saved page text**, **Use
  this one**) and **Neither is right**. Both call `POST /research/conflicts/:id/resolve`.
- Footer: **Added — pick the part**, **Can't find it**, **Mark as looking**.
- Hand-added requests show no robot buttons (live since 412399b0).

**S2 Pending catalog → Vehicles tab.** Queue filters + market filter + paging + Open. *Vehicle drawer:* one proposal
per version (chassis, frame range, years, engine, drivetrain, transmission, grade), each with its evidence and a
`new / update / same` tag. Buttons: **Approve** (writes `vehicle_catalog`), **Reject** (with reason), **Research
again**, **Couldn't find it**, plus browser-check cards as in S1. *Model review:* one table per "Research this model"
job, with **Approve all new** and per-row Approve / Reject.

**S3 Pending catalog → Auto-match conflicts.** Unchanged (out of scope); listed so the section is complete.

**S4 Settings & Health / Research settings.** Pause / Resume. Shadow mode on/off with the graduation streak
(RE-14). Cost per job (7 days), today's spend against the cap, the fill target date and the expected finish date
(RE-24), and an "identity first" line for cars with no chassis code. Export CSV, Reprocess queued, and the incidents list with **Retry**. Trusted sites move to S5, and this page
links there.

**S5 Parts database → Trusted sources** (platform owner only for edits). This is the one list (RE-11). Per site it
shows kind, maker, automated reading (Allowed / Blocked / Not checked, with check date), pages confirmed and last
reads (expand to see the read log). Buttons: **Add site** (car maker / part maker / reference, with the
automated-read check date), **Mark allowed** / **Mark blocked**, **Remove**, maker rename / **Remove maker**. Each
site lists its lookup recipes (RE-02) with **Add recipe**, **Edit**, **Turn off** and **Test on a car** (runs once,
shows the block or "Nothing found", saves no data; round 2). Per recipe: "Worked N times · last on <date>" ("Not run yet" when N is 0) = count
and latest `read_at` of `research_page_read` rows with that `recipe_id`, `purpose = 'job'` and a block found. Per
site: "Pages confirmed" = `trusted_site.pages_confirmed`. No suggestion counter is shown.

**S6 Vehicle Catalog → car page.** A new **Coverage** tab on the existing car page. Grid: the 10 core part types +
core spec keys. Each tile shows its state and one action:
- Confirmed → **Open**
- Needs checking → **Review**
- Browser check → **Open browser check**
- Two makers disagree → **Choose**
- Researching → no button
- Waiting its turn (= job `state IN ('queued','browser_check_queued')`) → no button
- Not started → **Research this part** (queues that one job, `origin = owner_fill`; round 2)
- Couldn't find → pill + **Research again**
- Not applicable → muted, no action

The states come from `variant_parts_readiness` (incl. `not_applicable`) and the job state. **Fill this car** (RE-09). **Research identity** when the
chassis code or frame range is missing (RE-04). Model level: **Fill every version** and **Research this model**
(RE-08).

**S7 Vehicle Catalog → car specs section.** Every spec shows its trust (Confirmed / Needs checking + "CSV import"
note) and source link, with **Research this spec**. Edits write `catalog_spec_value` (RE-05). The brakes rows use
`front_brake_type` / `rear_brake_type`.

**S8 Overview + Pending catalog banner.** Open `dominion_system_notice` rows (engine paused, site blocked, spend cap
reached, evidence changed), each with a link to S4 or S5 (RE-17).

**Stitch screen map** (`docs/stitch/research-engine/research-engine-dominion-prompt.txt`). Spike 0 may land on "fills the cars that
matter first", so the empty and waiting states are drawn as screens of their own.

| Screen | Audit id |
|---|---|
| 1 Pending parts list | S1 |
| 2 Request drawer — Roam found | S1 |
| 3 Request drawer — browser check | S1 |
| 4 Request drawer — two makers disagree | S1 |
| 5 Pending parts — nothing waiting / filling the cars that matter first | S1 |
| 6 Pending vehicles list | S2 |
| 7 Vehicle proposal drawer | S2 |
| 8 Research this model — review | S2 |
| 9 Research settings and health | S4 |
| 10 Trusted sources | S5 |
| 11 Add a site | S5 |
| 12 A site's lookup recipes | S5 |
| 13 Car page — coverage | S6 |
| 14 Car page — identity first (no chassis code) | S6 |
| 15 Car specs with trust | S7 |
| 16 Overview with notice banner | S8 |
| 17 States | all |
| 18 Phone — browser check | S1 |

### 6b. Round 2 — Stitch screens, Keep / Drop / Add (20 Nov 2026)

The screens are in the repo at `docs/stitch/research-engine/` (18 screen folders with `code.html` + `screen.png`,
plus `dominion_roam_console/DESIGN.md` "Dominion Roam Console", Corporate Modern / Soft Minimalism). The look is right and no remake is needed. Stitch decides the look
(layout, cards, pills, spacing, colours) and is ported exactly. The audit decides the content, so everything Stitch
invented is dropped below. Every value shown comes from real data. Build in exact hex colours, never colour names
(Dominion dark-mode remap).

**All screens (frame + shared rules)**
- **Keep:**
  - Inter type, 16px cards, soft shadow and the pill colours (they match the prompt).
  - Right drawer at ~560px over a blurred list.
  - Sticky bottom action row in drawers.
- **Drop (frame):**
  - Stitch's sidebar items "Research Engine", "Fitment Matcher", "Normalizer", "Fleet APIs", "Consumer App Feed",
    "Catalog Integrations", "System Health", "Settings & Roles", "Audit Log".
  - "Dominion v4.8.2 · Online", the "Daily Budget $1.20 / $5.80" sidebar pill and the top-bar "Research Cost" pill.
  - The real Dominion sidebar and top bar stay exactly as they are today.
- **Drop (wording that breaks the rules), everywhere it appears:**
  - Bypass or crawler wording: "headless", "Headless Worker", "human proxy", "Bypassed", "403 redirected",
    "Scraped", "crawler", "Circuit open", "Worker node", "sockets", "telemetry", "Engine #04".
  - Invented providers: "SerpAPI", "Serper", "Gemini 1.5 Pro".
  - Invented ids: "#VH-9021", "PROP-…", "Part review #4092", "Session #DOM-…", "Signed Hash".
  - Scores the engine doesn't compute: "Confidence: 89%" and any other confidence %, "98.4% Match", "% pass",
    "extraction accuracy".
  - Wrong trust rules: "Strict Dual-Proof", the "Spec Validation Integrity Rule" card, "Corroboration rule enforced
    DOM-COR-01". These state a wrong rule (part maker + car maker); the real rule is §0.
- **Add (button rule):**
  - Every danger action ("Couldn't find it", "Neither is right", "Not on this page", "Reject", "Remove", "Turn off",
    "Undo") gets a red #a83836 border + red text. Stitch drew several as bare red text.
  - Grey-filled secondary buttons ("Edit and add", "Research again") get a visible #c5c6d0 border.
  - Text-link actions become small bordered buttons: tile actions "Review →", "Inspect", "Verify", "Resolve",
    "Launch", "Start now", "Check", and the drawer link "Open Amayama Roomy M900A page".

**Screen 1 — Pending parts list (S1)**
- **Keep:**
  - Title, sub-line, Export CSV, "Re-run waiting jobs (up to 50)" and the tabs with pending counts.
  - Four summary cards with their numbers. The counts are real: pending vehicles count on the Vehicles tab, not
    2,679.
  - Filter pills with counts, the table columns, and the "Two makers agree" sub-line under the status (trust
    route c).
  - The green "Added … Undo" toast and the pagination.
- **Drop:**
  - The drawer Stitch opened over the list. It is a second, wrong "Roam found" variant: "Cross-Maker Comparison",
    "Koyo 3DACF026F-24S", "Alt OE 42410-B1080", "Line 412" and "Neither is right" on a single proposal.
  - The whole "Workflow Demonstration" browser-check block under the table.
  - The summary-card sub-lines ("Sites blocking automated crawler", "Manual 1-line paste workflow", "Verified &
    active", "High confidence fitment", "Querying Masuma & SB…", "Worker node #2", "~45s left").
  - "Official Bearings", "1 Maker unconfirmed", "Cross-check pending", "Pending catalog assignment" and "#14 in line".

**Screen 2 — Request drawer, Roam found (S1)**
- **Keep:** the whole drawer as drawn: header + status pill, the "Roam found" card (number, trust pill, fit block,
  site chip, "Read on", "See the saved page text", the how-sure line), the Checks list (green check / red dot), and
  the bottom row.
- **Drop:** the background list's invented rows and columns (Honda Fit GK3 Akebono, Nissan Note 555, "Updated 2m
  ago", "Run batch research", "Export queue"). The background is Screen 1.
- **Add:** an amber dot (not red) for a check that didn't pass, which matches the prompt. The "Couldn't find it"
  border per the button rule.

**Screen 3 — Request drawer, browser check (S1)**
- **Keep:** the three numbered steps, the primary "Open the Amayama page ↗", the paste box, "Roam read from pasted
  line" + "Matched", the footer counter line, "Confirm" and "Not on this page".
- **Drop:** the background's "Avg. check time 19s / target 30s", "94.2% auto", "EPC Data", "Denso Catalog",
  "Alternator Assembly / Honda Fit GP5", "Queue rules" and "Resume engine". The background is Screen 1.
- **Add:** "Confirm" stays disabled until the read line passes the gate for the job type. A part needs the car + a
  part number. A spec needs the car + a value of that spec's shape (e.g. "EFB", "LLC Pink", "3.6 L", "525 mm"). The
  "Matched" pill and the read value show only then.

**Screen 4 — Two makers disagree (S1)**
- **Keep:** the two maker cards (logo, number, "Read on", "See the saved page text", "Use this one"), the inline
  "Saved page text · Hide" panel, "Neither is right", and the muted line.
- **Drop:** "Maker A / Maker B" labels. The background list's invented rows (Honda Fit 45022-TZA-J01, Nissan Note,
  Mazda CX-5, Subaru Impreza…) and its "Two Makers Disagree 19 / Ready to Add 84" cards. The background is Screen 1.

**Screen 5 — All caught up (S1)**
- **Keep:** the summary cards at zero, the empty card + illustration + text, the "Cars being filled first" strip and
  "See what's waiting".
- **Drop:** "2024 Toyota RAV4 Hybrid" (show the real car being researched, or nothing).
- **Add:** the strip's counts come from the fill plan (`origin = sweep` jobs and their cars' readiness), never from the
  Fleet demand ranking. The strip never says why those cars are first.

**Screen 6 — Pending vehicles list (S2)**
- **Keep:** filters, market filter, table (logo tile, vehicle, kind pill New version / Identity filled, status,
  next-action column) and paging.
- **Drop:** invented trims and sample rows ("X S / G", "L Smart Assist", "Home / Luxe", "Bandit MV", Honda Fit GR3,
  Suzuki Solio). Rows come from data.

**Screen 7 — Vehicle proposal drawer (S2)**
- **Keep:** the header + "New version" pill, the green duplicate-check card, the fact grid with a trust pill per
  value, the source row + saved text, and the bottom row.
- **Drop:**
  - The background "Vehicle Proposals" page ("Catalog Sync Engine: Active", "Dominion Fleet API ingestion", PROP
    ids, Honda N-Box, Nissan Serena). The background is Screen 6.
  - The fact rows "Body Style" and "Power Output". The fact grid is only frame code, frame range, years, engine,
    drivetrain, gearbox and grade.
  - "toyota.jp / gazoo.com catalog".
  - "Adding this version enables part-matching for 14 parts … Fleet APIs".
  - The toast "queued for Fleet API sync". The toast becomes "Added Toyota Roomy 2020 on · 2WD to Vehicles".
- **Add:** "Reject proposal…" opens the in-app reason dialog (Screen 17 card 5).

**Screen 8 — Research this model (S2)**
- **Keep:** the title, "Roam found 5 versions", "Back to Vehicles", "Approve all new (2)", the "2 Unchanged · 1
  Update · 2 New" summary, the version table with Same / Update / New pills and per-row Approve / Reject, and the
  "Nothing is overwritten until confirmed" line.
- **Drop:**
  - The "Source Verification Provenance" card, "Catalog Health 98.4%", "homologation filings" and "System
    Reference #VH-…".
  - The invented frame range "M900A-0001001 ~ M900A-0489201", "Updates 24 downstream parts", "Intercooler… 72kW",
    "Rear differential #41110-B1080".
  - The three footer cards (Fitment Safety, Cross-OEM Mapping, Audit Trail).
  - "Approving a version queues 14 checks".
- **Add:** the Update row shows the real changed fields from the proposal ("Frame range added").

**Screen 9 — Research settings and health (S4)**
- **Keep:**
  - The Engine card (status, toggle, Pause) and the safe-stop explanation line.
  - The Auto-add card (practice-mode toggle + "6 of 20" meter + its line).
  - The Cost & Progress card (cost per job, today's bar, goal + "On track", the 763 identity line).
  - The Recent problems card with Retry, and the Trusted sources card + "Manage trusted sites".
  - "Queue · N items pending".
- **Drop:**
  - "Autonomous crawler worker pool" and "Halt dispatcher without tearing down sockets".
  - "~115 queries left", "Averaged across Gemini 1.5 Pro and Serper…", "Engine cooling rate quota backoff active".
  - "Redirected through headless human proxy", "Amayama blocked Roam IP" and "Issues resolve automatically…".
  - The telemetry footer.
- **Add:** the problem rows read "Google's daily search limit reached — paused until 00:05" and "Amayama blocks Roam
  — its items are now browser checks". The Trusted sources card counts sites from data and drops "OEM parts catalog
  authority".

**Screen 10 — Trusted sources (S5)**
- **Keep:** the title + sub-line, "Add a site", the three group cards with their explanation lines, and the site rows
  (logo tile, domain, reading pill, pages confirmed (`trusted_site.pages_confirmed`), maker chips, "Recipes (n)", "Mark as …",
  "Remove").
- **Drop:**
  - "Enforcement: Strict Dual-Proof" and the three top stat cards ("Verified Seed Endpoints", "Cumulative
    Confirmations", "Automated Scraping Policy: Headless & Supervised Fiche").
  - "Auto-rate: 10 req/min", "Browser Sessions: Idle", "Identity Lock: Enforced" and "Roam relies on supervised
    browser extraction due to automated query firewalls".
  - The wrong-rule card, and the inline "Add Trusted Source" form at the bottom (Screen 11 is the add path).
  - Invented maker coverage. Chips come from `trusted_source` rows.
  - The reference-site "Suggestions generated" counter (no source).
- **Add:** one rule card with the real rule: "Confirmed when the car maker's catalogue lists it, the part maker's own
  catalogue lists its own part, or two part makers agree. Reference sites can suggest but never confirm."

**Screen 11 — Add a site (S5)**
- **Keep:** the dialog with four numbered questions, the three kind cards, maker chips + "Add another maker", the
  two reading cards + "Checked on" date, and "Cancel" / "Add site".
- **Drop:**
  - The background page (Configured Domains 42, 99.4% JDM parity, Human Verifications 124, Crawler Error Rate,
    denso-am.com). The background is Screen 10.
  - "DNS valid · HTTPS :443", "Roam validates the hostname and checks robot accessibility".
  - The kind tags "Direct Auth", "EPC / Diagram", "Tier 3", and "Roam crawler runs autonomous headless queries…",
    "Requires human operator", "Admin Tier".
- **Add:** the reading card lines "Roam reads its pages directly" / "You check its pages in your browser". The address
  field shows "Needs https" if it isn't https.

**Screen 12 — A site's lookup recipes (S5)**
- **Keep:** the drawer title, "+ Add a recipe", recipe cards (name, Active pill, three plain numbered steps, "Worked
  14 times · last on 20 Nov 2026" (from `research_page_read` by `recipe_id`, see S5), Edit, Turn off) and "Changes take effect on the next run".
- **Drop:**
  - The background source list (MonotaRO "API Connector v2", "SB Parts Japan … Direct crawler", "% pass").
  - "ID: src_jp_sbparts", "100% / 98.2% extraction accuracy".
  - The third "Reverse lookup via OEM code cross-table — Testing" recipe, with "Pre-flight Stage 2" and "Activate".
  - Step wording "SKU", "canonical", "saves HTML snapshot and marks fitment as confirmed by manufacturer".
- **Add (audit S5 extended):** a per-recipe secondary button **"Test on a car"**. It runs the recipe once for a chosen
  car version and shows the block it found (or "Nothing found"). No data is saved; the read is logged with `purpose =
  'recipe_test'`, never counts toward blocking a site, and never creates a browser check. Route `POST /research/recipes/:id/test`, owner only. Stitch's "Test all recipes on Roomy
  M900A" footer button is dropped in favour of the per-card button.

**Screen 13 — Car page, coverage (S6)**
- **Keep:**
  - The car header (logo tile, name, codes line), the "4 of 10 key parts ready" ring, and "Research this model" /
    "Fill every Roomy version" / "Fill this car".
  - The summary chips ("4 Confirmed · 3 Needs checking · 1 Browser check · 1 Researching · 1 Not started").
  - The 10 key-part tiles. Each has category + part name + pill + part number + one source line + one action button.
  - The specs card grid (name, pill, value).
- **Drop:**
  - Every invented number and fact: NiBK PN-11024, "OEM 04465-B1390", 90915-10003, MFA-1204, DCC1009, ILKR7D8,
    SC20HR11, thread sizes, "Split Year Alert", "Arm 9×3 U-Hook", "60B20L", "Furukawa & GS Yuasa", "6PK", 40Ah, the
    spec descriptions and alternates ("API SP / GF-6A", "Dry fill 3.6 L", "LED Main · H16", "SLLC Pink", "DOT 4 /
    SAE J1704", "240 kPa").
  - "#VH-9021", "Live Homologation", "996 cc I3 · JDM · Kei-class", "Auto-sync worker active" and "Queue Priority:
    08".
  - The "Homologation Versions" tab, and the "Corroboration rule enforced" card.
- **Add:**
  - Coverage becomes a new **tab on the existing car page**, next to its current tabs (Overview, Car specs, Parts on
    file, Sister cars, History). "Audit History" maps to the existing History tab.
  - Tile values come from `part_listing` / `catalog_spec_value` with their trust.
  - The tile action by state: Confirmed → "Open"; Needs checking → "Review"; Browser check → "Open browser check";
    Two makers disagree → "Choose"; Not started → **"Research this part"** (audit S6 extended: queues that one job,
    same route as Fill this car with one item); Researching → no button; Couldn't find → pill + "Research again";
    Not applicable → muted, no action. The full list is in §6 S6.

**Screen 14 — Car page, identity first (S6)**
- **Keep:** the header with "Frame code: Not on file", "0 of 10", the slate "Roam needs this car's frame code…" card
  with "Find this car's identity", and every tile + spec card shown as "Waiting for identity".
- **Drop:**
  - "ROAM-ID: VHC-IN-TYGLA-2019", "APAC / EMEA", "Market: India / South Africa", "1.2L K12N DualJet" (show only real
    columns), and "Missing Frame Identity".
  - The long catalogue paragraph, "Ministry homologation databases, gazoo registries, VIN decode tables" and "Est.
    pipeline runtime ~14s".
  - The tile sub-lines "OEM # — / Unresolved", the spec sub-labels ("Cold Cranking Amps", "OAT / HOAT"…), "Ready
    queue: idle" and "Review Match Engine Config".
  - "Enter frame code manually". Editing the frame code stays on the existing Overview tab's Edit.
- **Add:** one muted line under the card: "Once the frame code is found, Roam looks up the parts and specs below."

**Screen 15 — Car specs with trust (S7)**
- **Keep:** the header chips ("4 of 10 key parts ready · 6 of 8 specs confirmed"), "Fill this car", the table
  (specification, value, trust pill, source line, "Research this spec", "Edit") and the "Not on file" row style.
- **Drop:**
  - The side panels ("Confidence Index 75%", "Data Provenance Engine / Tier 1 Trust", "Operator Sign-Off … engine bay
    plate M900A-002194", "Signed Hash", "Research Budget Burn").
  - "Export specs table", "Research all specs", "Accept all high-confidence", "Re-research all legacy import
    values", "Filter: All Categories", "Column visibility".
  - The category sub-labels and value sub-lines ("API SP · ILSAC GF-6A", "79S standard steel wheel", "Single piston
    floating caliper", "Undefined LLC capacity", "Glycol-based formulation", "Page 382 § 8-2").
  - "Manual bench audit log #OP-1102", "Legacy CSV table migration v2.4", "Autonomous worker queued (P2)".
- **Add:**
  - Source line wording: "From the old import" for CSV rows, the site name + "Read on <date>" for engine rows, and
    "You checked it on <date>" for owner-checked rows.
  - Brake rows read `front_brake_type` / `rear_brake_type` (RE-05).

**Screen 16 — Overview with notice banners (S8)**
- **Keep:** the two banners only (amber paused banner with "Open research settings", blue Amayama banner with "Open
  trusted sources"), in Stitch's banner style.
- **Drop:** everything Stitch drew under the banners. The Overview page itself stays exactly as it is today
  (prompt: "the rest of the Overview is unchanged"), so these all go: "Catalog Completion 84.2%", "2,256 verified",
  "Autonomous Queue", "Corroboration Confidence 96.8%", "Today's Research Burn", "Canonical Repositories", "Google
  Custom Search 600/600", "SerpAPI Secondary", "Quota Consumption Distribution", "Verification Desk" (Land Cruiser /
  Hilux / D-Max), "Fleet Ingestion Feed / Pacific Fleet API", "Amayama Crawler Worker … Bypassed", "Override & Resume
  100 Jobs", "Export Ledger" and the cluster footer.
- **Add:** the banner text from the notice table. Amayama: "Amayama blocks Roam. Its items are now browser checks."

**Screen 17 — States (S1)**
- **Keep:** the five state cards' look: skeleton rows, "Couldn't load the queue" + "Try again", "Research is paused"
  + "Resume", the green toast with Undo, and the reject dialog with text box + "Keep it" / solid red "Reject".
- **Drop:**
  - The spec-sheet framing ("Pattern Spec v4.8.2", "Re-simulate All", "DOMIN_ROAM_v4", the "LATENCY / TLS" strip,
    "State Transition Matrix", "Operator Safe-Net", "Audit Protocol").
  - The "01 / QUEUE"-style labels, "HTTP 202", "ERR_SOCKET_TIMEOUT · host…", "Circuit breaker", the Trigger lines,
    "STASHED 1,428 jobs", "EST. RESTART 00:00", "Budget lock".
  - The toast's "Pending Verification" list (Rear Caliper Bushing, Oxygen Sensor), "Dismisses in 8s", "Docked 16px".
  - The reject dialog's "Quick Reasons" chips and "Help the Roam Normalizer learn".
  - The "Operator Ergonomics & Guardrail Rules" footer.
- **Add:** the paused card reads "Research is paused" + the reason from the notice + "Resume".

**Screen 18 — Phone, browser check (S1)**
- **Keep:** the full-screen sheet, the car header, the large "Open the Amayama page", the paste box with Paste /
  Clear, the "Detected:" read-back line and the sticky "Confirm" / "Not on this page".
- **Drop:** "Sheet Detail Execution", "Amayama EPC", "Targeting Fig. 82-01 Starter & Battery Wire Assy", the "Expected
  Matches" box (28800-B2160, 60B20L), "Looking for: M-42 / 60B20L / 28800-B2160", "paste the page text or URL" and
  "Human Verification Needed".
- **Add:** the instruction line from Screen 3: "Find the line that shows M900A and the battery." "Detected:" shows
  what Roam read from the pasted line.

**Proof for round 2:** a side-by-side of each Stitch `screen.png` with the built screen (screen-check recipe). Every
Keep/Add item must be present and no Drop item may appear, checked by a click-through test that presses every
button listed above.

## 7. Done-tests (written before building)

0. **Spike 0 (RE-25)** is written into §2: robots/terms verdict for sbparts.jp, jnbk-brakes.com, bremboparts.com
   and masuma.parts; how many of the Roomy M900A's 17 core items can be Confirmed by route (b)/(c); queries and cost
   per grounded call from 20 runs; `fill_target_date` set from those numbers.
1. SB and NiBK both list the same factory number for the Roomy M900A rear pads. The engine reads both pages directly,
   each `research_page_read` block shows the number and M900A, and the proposal is Confirmed by route (c), with both reads in `evidence_read_ids[]` and `trust_set_by = 'engine'`.
2. Amayama is `blocked`. A Toyota OEM number job makes a browser check with the exact Amayama link and no server
   fetch to amayama.com. After the owner confirms with pasted text, the proposal is Confirmed by route (a) and goes
   to review, not auto. It shows as "Confirmed · owner-checked <date>".
3. Ask for "wheel bearing · rear" on the Roomy M900A. The proposal's fit lists the Roomy version(s), positions LR/RR
   and the frame range from the page block, not the model's guess.
4. **Looks right** on that proposal → Fleet Find parts for 5179KZ shows it, the four former `part_fitment` readers return
   it through `listingsForVehicle`, the request closes by itself, and Undo removes it.
5. **Fill this car** on the Roomy M900A → jobs for every missing core part and spec. After the queue drains, each
   item shows Verified, Needs checking, Browser check or Couldn't find; none is left Missing without a job.
6. Spec job "battery_jis" for the Roomy M900A → proposal M-42 · EFB with its evidence. Looks right writes
   `catalog_spec_value` with trust confirmed and `evidence_read_ids[]`.
7. CSV tyre sizes appear in `catalog_spec_value` as Needs checking. Fleet shows them as "Check before buying", they
   never give a tier-3 "fits by size" match, and readiness doesn't count them.
8. A car version with no chassis code → **Research identity** fills chassis + frame range + engine with evidence,
   and then its part jobs run.
9. **Research this model** "Toyota Roomy" → every version is tagged new / update / same, **Approve all new** adds
   them with evidence, and nothing is duplicated.
10. The daily Gemini budget is hit → engine pauses until 00:05 UTC with a banner, no job is marked failed or loses
    reads, and next day the jobs run. Same for a 404 "model no longer available" (pause until Resume).
11. A page with the number only in a "related parts" list fails the block check. A one-line synthetic page fails.
12. masuma.parts + rockauto.com passing the same number → review, Needs checking; never auto.
13. A redelivered queue message creates no second proposal.
14. `research_page_read` rejects UPDATE and DELETE. When a re-check finds the number gone from an evidence page, the
    row becomes Needs checking and a notice opens.
15. `readSourcePage` refuses a non-allowed host, http://, a private IP and a redirect to 169.254.169.254. A
    `catalog.write` user who isn't the owner can't add a trusted site.
16. No Dominion route, screen or export.csv contains a fleet/company count, asked date, request text, organisation
    id or pending request id. The privacy test covers every research and pending route.
17. S4 shows the measured cost per job, including the grounding fee, the computed daily cap and the expected finish
    date.
18. One grounded call moves the spend guard's day total by its query count × US$0.014 (after the free 5,000). Once,
    on a test key, the 1,500-a-day grounding limit is passed, and the reply (status + body) is recorded. The engine
    pauses until 00:05 UTC with no job failed.
19. The vehicle job re-key on a copy of live data: every open vehicle job's key has no organisation id, jobs for the
    same car are merged into one, and their requests still point at a job.
20. Spec backfill: 2,471 tyre values arrive as Needs checking; wheel offset, disc size and dimensions are untouched.
21. A part-maker site answering 429 defers the job (back on the queue after `Retry-After`), stays `allowed`, and
    no job is failed. Two 403s block it and turn its pending reads into browser checks.
22. The Gemini prompt contains no `need_text` or `looking_note`.
23. Every new table has RLS on, and an anon or authenticated REST call to it returns nothing.
24. With 30 Fleet jobs and 30 fill jobs queued, claims alternate. The nightly sweep creates no browser check, and
    never more than 25 are open.
25. `/jobs` and `/jobs/:jobId` responses contain no `requested_name` or `requested_part_number`.
26. Two part makers name different numbers (not in one group) for the same car + part type + position → neither
    auto-adds, one `research_number_conflict` row opens, and S1 shows "Two makers disagree".
27. Every trusted-site or recipe write leaves a `dominion_audit_log` row.
28. A browser check left 30 days closes as "Couldn't find" and its slot opens the next queued check.
29. `POST`, `PATCH` and `DELETE /admin/part-fitment` still return 403.
30. Round 2 proof: each built screen side by side with its Stitch `screen.png`. Every Keep/Add item from §6b is
    present, no Drop item appears (none of the words listed under "All screens"), and a click-through presses every
    button listed in §6b.
31. "Test on a car" on the SB recipe shows the found block for the Roomy, logs one `recipe_test` read, writes no
    proposal / listing / spec, and two failed tests leave the site `allowed`.
32. **Use this one** on a conflict adds that number, rejects the other, and closes the request once. **Neither is
    right** adds nothing and sets the job to Couldn't find.
33. A battery-type browser check with the line "M900A … EFB" confirms value EFB. A part check whose line has no
    number keeps Confirm disabled.
34. The coverage grid shows Couldn't find (with Research again) and Not applicable (muted) tiles.
35. Promote one proposal → the `part_listing` exists, its `interchange_fitment_rule` (`source = 'listing'`) exists,
    `parts_for_vehicle` returns it for that car + place, and any `part_match_conflict` it opens shows on S3 with the
    part named.
36. A new pending vehicle request creates a job with `origin = 'fleet'` and `browser_check_allowed = true`.

## 8. Build order (layers)

0. **Spike 0** (RE-25, done-test 0), about half a day. Its numbers go into §2 before any migration is written.
1. **Data** (one migration + SQL checks): the tables and columns in §4, the trusted-list merge (`trusted_site` +
   `trusted_source`) with `automated_read` set from Spike 0, the spec home + map + backfill with trust gating, the
   `promote_part_proposal` rewrite, RLS on
   every new table, CHECK constraints recreated, vehicle job re-key, notices, and unique keys.
2. **Server:** grounding cost logging (RE-24, first) → page reader + security → recipes + DOM blocks → routing by
   source rule → worker job types, batching, idempotency, claim split and prompt trim → provider-fault enum → the
   four `part_fitment` readers moved to `listingsForVehicle` → routes (incl. conflict resolve, recipe test,
   single-item research, per-type browser-check gate) → privacy test. After this deploy, a second
   small migration drops `part_fitment`, its index and its writer.
3. **Screens:** S1–S8 built to §6 and the round-2 Keep/Drop/Add (§6b). The Stitch designs are in
   `docs/stitch/research-engine/`. Proof is done-test 30.
4. **Prove:** done-tests 1–36 on the private copy where data changes. Then run live on the Roomy M900A with
   `catalog_research_settings.enabled = true` and shadow mode on. The admin app's revision pin moves to the server's
   (`catalog-research-7`, bumped by this build) so both sides agree. Then switch it on for everyone.

## 9. Not in this audit

- Maintenance schedules / service intervals research (a separate audit when asked).
- Prices, suppliers, stock (owner rule).
- Licensed data feeds (TecDoc/TecAlliance): under the source rule they are Needs checking, so they add no Confirmed
  data.
- The parts auto-match engine itself (Auto-match conflicts tab) — only listed in S3.
- `log-service-parts-gaps-audit.md` items.

## 10. Size

For one careful developer: Spike 0 half a day · layer 1 three to four days · layer 2 nine to eleven days (incl. the
conflict, recipe-test and single-item routes) · screens eight to ten days (18 screens, phone sheet, new Coverage tab,
conflict card) · proving four to five days. **About five to six weeks.**
