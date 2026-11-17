# Vehicle pictures + Add vehicle — audit

**Rev 9 · 17 Nov 2026** · Roam Fleet (first), Roam Dominion (staff screen). Rev 9: live on production (switch still off); §0 rewritten for a new chat.

**Goal:** when a fleet adds a vehicle, Roam reads its fitness and registration certificates and keeps the details, not the files. It then shows a studio picture of that exact car in that exact colour. Each picture is made once by AI, stored on Cloudflare R2, and reused for every later vehicle with the same car and colour.

**Rev 8 is a slimmed version.** Rev 7 (signed off by the reviewer at Rev 5, with owner corrections in Rev 6–7) went through review, build and screen check. Rev 8 removes the review history, the old findings, the "what exists today" survey and the Stitch Keep/Drop/Add lists, because all of that is built. The full Rev 7 is in git history.

**Depends on:** [cloudflare-r2-storage-migration-audit.md](./cloudflare-r2-storage-migration-audit.md). Its R2 storage code and the maker-logo slice are committed and live (17 Nov).

---

## 0. START HERE (new chat)

**Where we are (17 Nov 2026, ~01:45 UTC): LIVE, but AI pictures not switched on yet.**
- **Proven end to end on the local test copy (17 Nov):** the owner added a real red Toyota C-HR (5404LK). Gemini read both certificates, the car matched the catalogue, and a correct red C-HR studio picture was made in seconds and shown.
- **Committed and pushed:** `3b9c9805` (all of this work, 146 files) + `ebd374fc` (strips a UTF-8 BOM from another chat's migration `20261116235152_week_recon_activity_timeline.sql`, so the pre-push check passes). Both are on `parts-auto-match` **and on `main`** (main moved from `cbd83e83` to `ebd374fc`). `main` also carries `f7835f2b` (another chat's Week Recon activity timeline).
- **Done on production (17 Nov):**
  - Supabase secrets set: `GEMINI_API_KEY` (the owner's new key, billing on), `R2_ACCESS_KEY_ID` + `R2_SECRET_ACCESS_KEY` (the new `roam-app` token: read/write on roam-public + roam-private, tested). `R2_ACCOUNT_ID` and `R2_PUBLIC_BASE_URL` were already right. No OpenAI needed.
  - The 7 migrations applied with `npx supabase db push --remote=csfllzzastacofsvcdsc --include-all --yes`, which also writes the logbook lines.
  - The push to main ran **Deploy Supabase Edge Function** (run 43997030787): success, and the log lists fleet-core under "Deployed Functions" (with all other functions).
  - **Vercel path deploy** (run 43997030955): success. Hooks fired HTTP 201 for roam-fleet, roam-dominion and the other apps. Vercel builds take a few minutes after that.
- **Runs on `ebd374fc` checked (17 Nov, ~02:10 UTC):** Deploy Edge, Vercel, Parts SQL, Parts auto-match e2e and Deploy recon-worker passed. **CI** and **Test Supabase Functions** failed, both from the test helper `vehicle_picture_test_harness.ts`, not live code: its fake day counter used a plain UTC date slice (trips the one-week rule check) and stamped pictures with the real clock while T28 fixes "today" at 16 Nov, so T28 failed once the real date became 17 Nov. **Fixed locally (not pushed yet):** the helper uses `jamaicaPictureDay` like live code, and T28 stamps its 50 pictures on the test's own day. Local: date check OK, all `_fleet-server` Deno tests pass (1137), the other CI node checks pass (two need CI-only secrets). Most CI steps were skipped after the first failure, so the next push is the first full CI run.
- **Live apps checked (17 Nov):** roamfleet.co has the new Add vehicle flow ("Send for checking", "Filled by Roam"); roamdominion.co has the Vehicle pictures page with the AI pictures switch.

**How a new chat should continue (in this order):**
1. Read this §0, §1 and §2.
2. `gh run list --branch main --limit 10`: report the result of every run on `ebd374fc` (CI, Test Supabase Functions, Parts SQL checks, Parts auto-match e2e, Deploy recon-worker). Fix anything red.
3. Check that roamfleet.co (Fleet) and Dominion show the new Add vehicle flow / Vehicle pictures page (the Vercel builds finished).
4. **Owner:** in live Dominion → Vehicles → Vehicle pictures, turn **AI pictures: On** (owner-only switch). It is off by default.
5. **Real run (§2 row 7):** the owner adds one real vehicle in live Fleet; the picture appears in about a minute. A second vehicle of the same car + colour reuses it.
6. Then the leftovers in §2 row 6: production settings/budgets check, the reset script on production (§8: dry run first; it needs the prod service-role key, which is not in `.env.local`), and deleting the `roam-scratch` bucket + its token in Cloudflare.
7. Never paste secrets in chat. The Supabase MCP connector was broken in the 16–17 Nov chat; the `npx supabase` CLI is logged in and works (it asks for `--yes` on production changes, and the owner has to have said go).

**Separate, not part of this audit:** the prod `service_role` key was public in the repo until 16 Nov (repo now private) and still needs rotating. See memory `service-role-key-public-repo`.

**Local test copy (works end to end):** `pnpm testcopy` passes the owner's Gemini/R2 keys and the local cron secret into the served functions (`scripts/testcopy.mjs`). Fleet http://127.0.0.1:5181 (`mm-f01-fleet@local.test` / `MmF01Local2026!`), Dominion http://127.0.0.1:5180 (`mm-p01-owner@local.test` / `MmP01Local2026!`, TOTP key `JBSWY3DPEHPK3PXP`). Local AI pictures are on; pictures go to the real roam-public. The local catalogue has only Roomy + a C-HR row Claude added. Before testing server changes locally, run `node scripts/build-edge-bundle.mjs fleet-core` (the local bundle goes stale). Stop with `pnpm testcopy:stop`.

**Working rules (owner):**
- Cursor does the server and database rounds. Claude ports the screens and checks Cursor's work.
- Claude compares screens with Stitch itself on the test copy; the owner doesn't check screens one by one. The method is in memory `screen-check-recipe`.
- Plain words in chat. Every action is a real button. No browser pop-ups.
- Dominion shows **only its own data**: no fleet names, plates, drivers, vehicle counts or "used by".
- **Fleets never pick a catalogue car (owner, 17 Nov).** On Confirm car, one clear match is shown. Anything else (no match, or several) shows the car from the documents with "Send for checking", is saved as parked, and lands in Dominion → Pending catalog (already built: `upsertPendingFromKvVehicle`). The make/model/year panel and "Pick a different car" are gone. The document's model snaps to the catalogue name (`snapModelToCatalog`: "CHR HYBRID" → "C-HR").
- **Usage category and plate class fill themselves in (owner, 17 Nov)** from the registration plate and body type (`inferVehicleUse`): 4 digits + 2 letters = Private / White; C + letter = Commercial / Green; P + letter = PPV / Red; a "cycle" body = Motorcycle; trailer or tractor = Trailer. Unclear cases stay "Not set". It never overwrites a choice, and the person can still change it. Toll class already defaults to Class 1. **Vehicle use is its own step (owner, 17 Nov)**: Fitness → Registration → **Vehicle use** → Confirm car → Done. It has the same light tiles (`ChoiceTile`) with a "Filled by Roam" badge until changed, plus the service-line chips and the commercial first-registration box. The toll list comes from `useTollClasses()`.

---

## 1. What is built (where to find it)

| Part | Where | Notes |
|---|---|---|
| Build rounds and prompts | [docs/vehicle-pictures-build/](./vehicle-pictures-build/README.md) | README table: C1–C3d passed, UI1–UI3 done |
| Database (7 migrations, applied to production 17 Nov) | `supabase/migrations/20261116175911_vehicle_pictures.sql` … `20261116200225_vehicle_picture_stale_flag.sql`; checks in `supabase/tests/vehicle_pictures_checks.sql` | Tables: `vehicle_picture`, `vehicle_picture_version`, `vehicle_picture_worker_lock`, `fleet.vehicle_document_check`, `fleet.vehicle_document_read_log`. Columns `fleet.vehicles.color_standard` and `picture_id`; the view `public.fleet_vehicles` was recreated to include them. Two `pg_cron` jobs. Each needs a **logbook line** when applied to production. |
| Shared server code | `supabase/functions/_shared/vehiclePictures/` (colour, look key, prompt, document whitelist, reader prompt, last error), `supabase/functions/_shared/objectStorage/` (R2) | |
| Server routes | `supabase/functions/_fleet-server/vehicle_picture_*.ts`, `vehicle_document_read*.ts`, `vehicle_save_*.ts`, `vehicle_pictures_settings.ts` | All in **fleet-core**. The route list `supabase/functions/fleet-core/routes.generated.json` was refreshed (837 routes). |
| Fleet screens | `apps/fleet/src/components/vehicles/add-vehicle/` (AddVehicleFlow, AddVehicleUi, VehiclePicture, VehicleListCard, vehicleColors), `detail/VehicleCertificateCards.tsx`, `detail/VehicleDetailHeader.tsx`, `VehiclesPage.tsx` | The old AddVehicleModal and VehicleCard are deleted. The Vehicles page opens on the picture cards; the table view is one click away. |
| Dominion screen | `apps/admin/src/components/admin/vehicle-catalog/vehicle-pictures/` | Page id `vehicle-pictures`, under Vehicles. Admin screen tests needed `@testing-library/react` aliased to its ES build in `apps/admin/vite.config.ts`. |
| Shared app code | `packages/roam-shared/src/storage/` (`vehiclePictureSrc`, `pictureStateLabel`, `uploadToStorage`) | |

**Settings:** one KV row, `kv_store_37f42386.key = 'vehicle_pictures:settings'`. Keys:
- `ai_vehicle_pictures` (default **off**)
- `vehicle_picture_model` (`gemini-3.1-flash-image`; Imagen 4 returns 404 on the owner's key as of 16 Nov, switched in C4 Part 0)
- `vehicle_picture_max_attempts` (3)
- `vehicle_picture_retention_days` (30)
- `vehicle_picture_org_daily_max` (50)
- `reader_provider` / `reader_model` (`gemini` / `gemini-3.8-flash`; owner 16 Nov: one Gemini key, no OpenAI; switched in C4 Part 0)
- the pause fields

There is **no** `new_add_vehicle_flow` flag: the new add flow simply replaces the old modal.

---

## 2. What is left

| # | Step | Who | Status |
|---|---|---|---|
| 1 | Owner setup for C4 (§10 items 1, 2, 4) and the real documents folder | Owner | **Done (16 Nov):** `roam-scratch` bucket + token; R2 + Gemini keys in `.env.local` (no OpenAI key, the reader moves to Gemini); Gemini billing on; Image Transformations on (origin `media.roamfleet.co` only); `X-Robots-Tag: noindex` rule live (checked); `fitness.png` + `registration.png` in the git-ignored `.vehicle-docs-test/` |
| 2 | **C4:** Part 0 (Imagen → `gemini-3.1-flash-image`, because Imagen 4 returns 404), reset script + T22, pre-production run (§11), real document check | Cursor, then Claude checks | **DONE (16 Nov), all checks pass.** C4b ran. Claude verified it ([preprod-run.md](./vehicle-pictures-build/preprod-run.md), last section): the real Gemini picture is good (Tank-twin grille noted), cleanup is proven (keeps current + newest retired), sweep works, real documents read OK, and Gemini sends JPEG (now handled). Check e passed (AVIF/WebP ~13 KB from an 857 KB PNG). |
| 3 | Manual accessibility check (keyboard only, 200% zoom / 320 px, reduce motion, no meaning by colour alone) on the Fleet add flow and Dominion page; axe has no serious/critical issues (T21) | Claude on the test copy | **DONE 17 Nov.** axe 4.10.2 (WCAG 2.1 A/AA) + Tab sweep + 320 px reflow + reduced motion on 7 screens: Vehicles list, add flow F1–F5, Dominion Vehicle pictures. **Fixed:** names on the Vehicles filters + view toggle (`aria-pressed`); green step / notice / chip text `#059669` → `#047857` (contrast); TollClassPicker label linked to its select; Dominion card title shows "Toyota Roomy" / "Toyota C-HR" / "BMW X5" instead of the lower-case look names (+ test). **After fixes:** 0 serious/critical on these screens, no sideways scroll at 320 px, nothing animates under reduced motion. Status always has a word next to its colour. **Outside this work (app shell):** sidebar avatar alt, sidebar section buttons with no focus ring, the test-copy banner contrast. Dominion 11 tests, Fleet vehicles 133 tests pass; tsc Dominion 0, Fleet 334 (≤ 335). Note: the local `fleet-core` bundle (git-ignored) was stale; `deploy:fleet-core` rebuilds it, so go-live is unaffected. |
| 4 | Security checklist (§6) | Claude | **DONE 16 Nov.** All 7 items pass for this work (detail in §6). Found during the scan and tracked outside this audit: the repo was public with the prod service_role key in the baseline migration (made private 16 Nov; key rotation still to do), and older dependency issues. |
| 5 | Commit | Claude | **DONE 17 Nov:** `3b9c9805` + `ebd374fc`, pushed to `parts-auto-match` and `main` |
| 6 | **Go-live:** apply the 7 migrations to production, each with a logbook line → deploy fleet-core (check the deploy log says "Deployed Functions") → deploy Fleet and Dominion → set the Supabase secret `GEMINI_API_KEY` to the owner's new key (billing on; no OpenAI needed) → set the production settings row and the Gemini budgets → delete the `roam-scratch` bucket and its token → reset script on production (§8): dry run, then apply | Claude + owner | **Mostly DONE 17 Nov:** secrets set, 7 migrations applied, fleet-core deployed, Vercel hooks fired. **Left:** push the test-helper fix and see CI + Test Supabase Functions go green (live apps checked 17 Nov: new screens are there); settings/budgets check; reset script on prod (§8); delete `roam-scratch` + its token |
| 7 | **Real run:** turn on `ai_vehicle_pictures` → add one real vehicle with a new look → picture made → add a second with the same car and colour → reused, with no Imagen call in the logs | Owner + Claude | Not done |
| 8 | Owner paperwork (§10 items 3, 5) | Owner | Not done |

---

## 3. How it works (reference)

### 3.1 The car look (`look_key`)
- One picture = **make + model + generation + body + facelift stage + colour**, all from the matched catalogue row.
- Each part is lowercased and trimmed, with spaces collapsed and `-`/`_` turned into a space.
- Body synonyms: hatch back → hatchback; stn/waggon, station wagon, wagon → wagon; saloon → sedan; mini van → minivan.
- Generation: "1st Gen" and "1st generation" → `1st gen`.
- Facelift stage from `trim_series`: `pre_facelift`, `facelift` (facelift / minor change / mc), otherwise `standard`.
- Key example: `toyota|roomy|1st gen|hatchback|pre_facelift|white`.
- Engine, trim and chassis code don't split pictures.
- A renamed catalogue row gives a new key; the old picture shows as **Stale look** in Dominion.

### 3.2 Colours
- **16 standard colours:** White, Pearl White, Black, Silver, Grey, Dark Grey, Blue, Dark Blue, Red, Maroon, Green, Brown, Beige, Gold, Yellow, Orange. They're stored lowercase.
- `mapVehicleColor(raw)` takes the first colour of a two-tone, then checks in this order: PEARL → Pearl White; GUN/CHARCOAL/DARK GREY → Dark Grey; NAVY/DARK BLUE → Dark Blue; MAROON/WINE/BURGUNDY → Maroon; then the plain colours; BROWN/BRONZE → Brown; BEIGE/CHAMPAGNE/CREAM → Beige.
- **No match:** the add flow shows an amber "Pick a colour", and **Next** stays disabled until one of the 16 is picked. There is no "Other" colour.
- Older vehicles with no colour get one through **Change colour** on the vehicle page.
- Two-tone cars get a picture in the first colour (known limit).

### 3.3 The AI prompt (`prompt_version` 1)
- Built only from the normalised catalogue values and the colour. Each value is cut to 40 characters and keeps only safe characters.
- A non-Latin catalogue value stops the lookup with `NON_LATIN_CATALOG_VALUE`.
- The prompt asks for: a studio photo, front three-quarter view facing right, Japanese-market right-hand drive, pure white background, soft shadow, no floor reflection, no plate text, no added text or people.
- Aspect 4:3. The model comes from settings.
- The prompt, version, model, cost and date are saved with each picture, so a picture can be **remade** later. AI pictures can't be reproduced exactly.

### 3.4 Lookup, queue and worker
- **On save,** after the catalogue match, no picture is queued when the vehicle is parked, has no colour, or has no buildable look, or when AI pictures are off and no ready picture exists.
- **Linking:** insert-or-link on `look_key`. A removed row comes back through a guarded update (`where deleted_at is not null`), so only one resurrect and one Imagen call happen. Linking an existing ready picture costs nothing.
- **Per-org daily limit:** `vehicle_picture_org_daily_max` new looks per day, by the Jamaica calendar day. Over the limit, the reply is `limited` and the nightly fill picks the vehicle up.
- **Kicks:** a new or resurrected row fires one `pg_net` kick to the worker. The per-minute cron is the backstop. The **fill run** at 00:15 Jamaica time works in batches of 200, chains itself, and kicks the worker once at the end.
- **Worker** (`/fleet-core/internal/vehicle-pictures/run`, service role or cron secret only):
  - a lease row (not an advisory lock; PostgREST pools connections) lasting 120 s
  - claims nothing when AI pictures are off, while paused, or when the budget is blocked
  - rounds of 5, live lane first, at most 2 remake rows per round; stops starting rounds after 90 s
  - row lease 3 min; a row is only started if more than 60 s of lease is left
- **Attempts** are counted only when an Imagen call is actually sent. Backoff is 2^n minutes; after 3 attempts the row is `failed`.
- **Failure classes:**
  - outage: timeout, 5xx or 429 → retry. 5 in 10 minutes → pause for 30 min (circuit breaker).
  - content: refused → `failed` for that look only.
  - key: 401/403 → global pause for 1 h with reason `key`, attempt given back.
- **Budget wall during a remake:** remake rows move to the 1st of next month.
- **"Becomes ready"** is one SQL function: insert the version row, retire the older versions, set the picture to ready. Every path uses it.
- **Change colour, catalogue re-match and Dominion approval** unlink `picture_id` in the same transaction, then look up the new look.

### 3.5 Certificates: details kept, files never stored
- **Reading:** `POST /fleet-core/parse-document` (multipart).
  - Accepts images only, up to 8 MB; magic bytes are checked. The app turns PDFs into images in the browser first.
  - Read limits: 20 per user per hour and 200 per org per day, kept in Postgres (`fleet.vehicle_document_read_log`).
  - 45 s timeout. The request body is never logged.
- **Real Jamaican documents:**
  - **Fitness** (Form A1, ITA): dates are printed **YYYY / MM / DD**. The plate can be temporary (`TMP…`).
  - **Registration** (Form S3): issue date is `YYYY-MM-DD`. Expiry is **year + month only** and is stored as the **last day of that month**.
  - Both documents show the colour.
  - The registration also shows the owner's name, address and TRN. These are **never** returned or kept.
- **Server date checks:** year 1980 to next year; expiry after issue; expiry at most 5 years ahead. A failed check leaves the field empty and marks it "Check this date".
- **Plate and matching:**
  - The registration plate is the vehicle plate (and its id). A temporary fitness plate never blocks a save.
  - The two documents are matched by **chassis**. A mismatch shows a notice and blocks Next.
  - If the colours differ, the fitness colour is pre-picked and the registration colour is shown under it.
- **Kept:** `fleet.vehicle_document_check`, one row per accepted document:
  - type, issue and expiry dates, `file_sha256`, who read it and when, reader model
  - `fields_json`, holding only these **18 whitelisted keys**: plate, vin, chassis, engineNumber, cc, make, model, year, colorAsWritten, bodyAsWritten, fuel, seating, certificateNumber, controlNumber, mvid, laNumber, issueDate, expiryDate
  - Rows are deleted with the vehicle.
- **Never kept:** no file and no link. The certificate URL fields and the certificate upload are removed.
- **Screens:** the wording is "We read your certificate and keep the details — not the file." The vehicle page Documents tab shows the dates, status and "Checked by … on …", plus **Update**, which reruns the add flow for that one document and saves with `updateDocumentsOnly`. A different plate gives `PLATE_MISMATCH`.

### 3.6 Showing pictures
- The API returns `picture: { status, url }`. Only queued / generating / ready / failed are stored.
- The status shown is worked out in this order: ready → paused (pictures paused or budget blocked) → generating → queued → failed → `limited` (org at its daily limit) → none.
- `vehiclePictureSrc(url, "card" | "detail")` builds the Cloudflare `/cdn-cgi/image/` sizes: card 480/960, detail 1200/2400.
- Wording when there's no picture yet:
  - queued / generating: "Picture coming"
  - paused: "Pictures are paused for now — Roam will add yours shortly"
  - limited: "Picture will be added tomorrow"
  - failed: "Picture unavailable — Roam is on it"
  - none: the outline only
- The vehicle page caption reads "Studio picture of this model — your vehicle may look different."

### 3.7 Versions, restore and removal
- Every file has a `vehicle_picture_version` row, and every change writes a new key (`…/v{n}.png`), so the Cloudflare cache never goes stale.
- **Restore previous** copies the file to a new key.
- **Cleanup** runs inside the worker, at most every 10 minutes, through one RPC:
  - keeps the current version and the newest retired one
  - deletes other files retired more than `vehicle_picture_retention_days` ago
  - deletes all files of a removed picture 30 days after `deleted_at`
  - sets `file_deleted_at` only after R2 confirms
- **Remove** works only when no vehicle uses the picture; otherwise the server answers `PICTURE_IN_USE`. Removal is a soft delete, and a later vehicle with the same look brings the row back.

---

## 4. Screens (built)

**Fleet:**
- Add a vehicle: 1 Fitness → 2 Registration → 3 Confirm car → 4 Done, plus "couldn't read" and "too many scans" screens. "How you use this vehicle" (platforms, usage, plate class, first registration, toll class) is on the registration step.
- Vehicle page header: picture, maker logo, name, plate block, colour + **Change colour**, status.
- Documents tab: certificate cards.
- Vehicles page: picture card grid.

**Dominion → Vehicles → Vehicle pictures:**
- Counts: Ready / Being made / Failed / Stale.
- AI settings (owner only): picture spend, the On/Off switch, **Remake all from older prompt**.
- Banners for paused, key rejected, AI off, 80% of budget, remake paused.
- Filters, then 24 cards a page.
- Drawer: Looks good/wrong, how it was made, versions, Regenerate / Upload replacement / Restore previous / Remove.
- Dialogs for regenerate, remove and remake, plus empty, loading and error states.

---

## 5. Targets, cost, vendors

- **Targets:**
  - save p95 < 2 s
  - parse p95 < 12 s
  - new picture: 95% within 60 s, 99% within 10 min
  - an existing picture shows at once
  - no `generating` row older than 5 min
- **Cost:**
  - reading: ~US$0.01 per document on Gemini (reader cap US$30/month, hard stop)
  - picture: ~US$0.04 (Gemini cap US$50/month ≈ 1,250 pictures, hard stop; daily caps 10 / 5)
  - R2 storage: about US$0.18 for 5,000 pictures
  - Image Transformations: free up to 5,000 unique a month; an SMS goes out at 4,000
- **Vendors:**
  - Google Gemini (reader + pictures): paid tier only (billing on), so Google doesn't train on the documents; the reader gets the certificate image, the picture call gets prompt text only
  - Cloudflare R2: ENAM region
  - Supabase: us-east-1; **owner signs the DPA**
  - Rotate `GEMINI_API_KEY`, `OPENAI_API_KEY`, the R2 token and `CLOUDFLARE_ANALYTICS_TOKEN` together every 12 months.

## 6. Security checklist (before turning AI pictures on)
1. RLS: anon and authenticated read nothing from the new tables (T23 ✓ in C1).
2. Authorisation per route (T15, T16 ✓ in C3).
3. No request-body logging (T14 ✓).
4. Secrets are Supabase function secrets only, and none are in an app build. ✓ 16 Nov: app code names the keys only in a warning message and docs, and no app `.env` has a secret `VITE_` variable.
5. `pnpm audit`: no high or critical. ✓ 16 Nov for this work: it adds no packages. The repo already had 9 high / 2 critical in production packages (Capacitor, pdfjs, react-router, hono, xlsx, zod, ws, form-data). That is a separate dependency round.
6. A `gitleaks` secret-scanning step in [ci.yml](../.github/workflows/ci.yml), green. ✓ 16 Nov: job `secret-scan` (gitleaks 8.18.4) scans only the commits in each push / PR. Settings are in `.gitleaks.toml` (lock files allowlisted), and known-safe test values carry `gitleaks:allow`. The next commit's files scan clean, and a dry run on HEAD~3..HEAD is clean. A full-history scan stays red until the old service_role key is rotated.
7. Staff sessions need 2FA (`aal2`); write routes need `catalog.write`; the switch and remake-all are owner only; everything is audit-logged. ✓ 16 Nov: reads use `assertCatalogStaffReadResponse` (staff + MFA), writes use `assertCatalogWriteResponse`, toggle / remake use `ownerDenied`, and every write calls `logAdminAction`.

## 7. Runbooks

| Event | What to do |
|---|---|
| Imagen down | The circuit breaker pauses for 30 min and rows wait. To stop it for longer, turn AI pictures off in Dominion; turn them back on and the queue drains. |
| Key rejected | Dominion banner. Fix `GEMINI_API_KEY` in Supabase secrets, then wait out the hour. |
| R2 down | Rows back off and retry. Vehicles show the outline. |
| Stuck rows | The sweep requeues them every minute. If `vehicle_picture_worker_lock.held_until` is more than 120 s ahead, clear it. |
| Files not cleaned | Version rows past retention with `file_deleted_at` null are retried every run. If the count keeps growing, check the worker log for `R2 DELETE` errors. |
| Cost spike | Budgets hard-stop on their own. Change them in Dominion **API center → Budgets**. |
| Stale looks | Use the Dominion **Stale look** filter, and remove the ones no vehicle uses. |
| Bad picture | Looks wrong → Regenerate, or Upload replacement. Restore previous undoes it within 30 days. |
| Model retired | Change `vehicle_picture_model`, then **Remake all from older prompt**. |

**Rollback:** the schema only adds things. Turning `ai_vehicle_pictures` off stops new pictures; everything else keeps working.

## 8. Reset script (data step, owner decision: start from scratch)
`scripts/vehicle-pictures-reset.mjs`, built in C4. Default is `--dry-run`; `--apply` makes changes.
1. Back up and list every object in the `make-37f42386-vehicles` bucket, plus the certificate files linked from `payload_json`.
2. With `--apply`: delete those objects and strip `image`, `fitnessCertificateUrl` and `registrationCertificateUrl` from `payload_json`.
3. Set `color_standard = mapVehicleColor(color)` where it's null.
4. Report any `UNKNOWN-` ids. On 16 Nov there were none; the only live vehicles are 5179KZ and 1505LM.
5. Run the fill once. On production that's expected to make 2 pictures (White Roomy, Grey Fit), about US$0.08.

It only touches rows still in the old shape, so running it twice changes nothing (T22).

## 9. Tests
- **Passed:**
  - server: T1–T17a, T23–T36, T7a–T7c, T9a–T9c, T24a/b, T28b
  - Fleet UI (vitest): T18–T19 screen logic and T29
  - Dominion (vitest): T20, including the no-fleet-data text scan
- **Open:**
  - **T22** (reset script, C4)
  - **T21** (click sweep + axe + manual accessibility, §2 step 3)
  - **T13 on real documents** (C4 Part 3)
  - the real run (§2 step 7)
- Playwright versions of T18–T20 weren't written. Claude's test-copy screen check covered the screens instead.

## 10. Owner setup (one time)
1. roamfleet.co → **Images → Transformations → Enable**, with sources limited to `media.roamfleet.co`.
2. roamfleet.co → **Rules → Transform Rules → Modify response header**: when the hostname is `media.roamfleet.co`, set `X-Robots-Tag: noindex`.
3. Sign the **Supabase DPA** (no OpenAI DPA: the reader is Gemini on the paid tier) (Dashboard → organisation → Legal documents), in the Digital Goodys name.
4. For C4: an R2 bucket `roam-scratch` with a token for that bucket only. Delete both after the run.
5. An API token with **Account Analytics: Read** (and zone Analytics: Read for roamfleet.co), saved as the Supabase secret `CLOUDFLARE_ANALYTICS_TOKEN`.

## 11. Pre-production run (C4 Part 2), on the local test copy
- **Wiring:**
  - `R2_BUCKET_PUBLIC` and `R2_BUCKET_PRIVATE` both = `roam-scratch`
  - the real `GEMINI_API_KEY`
  - `private.invoke_*` pointed at the local `functions serve` address
  - both cron jobs present
  - retention 0
- **Checks:**
  - one real Imagen call → `catalogue/images/<id>/v1.png`
  - compare the picture with the owner's two reference photos
  - kill the serve mid-run → the sweep requeues the row
  - regenerate → cleanup deletes v1
  - one real Cloudflare resize of `_test/preprod.png`, then delete it
- Everything is written in `docs/vehicle-pictures-build/preprod-run.md`. Only after this does production get the migrations.
- **Local test copy note:** if `pnpm testcopy` times out on `/rest/v1/`, set the local `anon` role `statement_timeout` to 15s (local only).

## 12. Later (not in this audit)
- Roam Plug and the Driver app use the same picture table and lookup.
- More angles (side, rear).
- Two-tone pictures.
- Real plate changes: today a mismatched plate is refused instead.
