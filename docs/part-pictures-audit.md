# Part pictures from catalogue diagrams — plan

**Rev 3 · 26 Nov 2026 · CLOSED — ready to build** (round 1 by DSH, round 2 on the Stitch screens) · Roam Dominion (makes and manages the pictures), Roam Fleet (shows them in Find parts).

**Goal (one sentence):** when the owner uploads a saved catalogue page, every Roam part on it gets a realistic picture, so anyone looking up that part in Dominion or Roam Fleet can see what it looks like ("a face to the voice").

**Depends on:** [saved-page-parts-audit.md](./saved-page-parts-audit.md) (the upload this builds on, live 26 Nov), [vehicle-pictures-and-add-vehicle-audit.md](./vehicle-pictures-and-add-vehicle-audit.md) (the car-picture system this copies), [cloudflare-r2-storage-migration-audit.md](./cloudflare-r2-storage-migration-audit.md) (storage, live).

---

## 0. START HERE (new chat)

- **Build started 26 Nov.** Step 0 done (single-file save). **Step 2 gate PASSED 26 Nov** (run ahead of step 1, it needs no data): the owner's `.mhtml` → its one image part `179509A.png` (20,144 bytes, real PNG) → one `gemini-3.1-flash-image` call with the diagram as `inlineData` + the §3.4 prompt, `aspectRatio 1:1` → **1024×1024 JPEG in 7 s**, 258 image-input tokens. Try 1 drew the filter inside a black case with clips (the Filters materials line mentions housings and clips); try 2 with the two lines added to §3.4 ("only where they belong", "on its own, exactly as it is sold") drew the correct flat panel filter, no words. Probe script kept outside the repo.
- **Step 1 data DONE 26 Nov (DSH round D1, checked by Claude):** [migration 20261126085053_part_pictures.sql](../supabase/migrations/20261126085053_part_pictures.sql) (4 data tables + `part_picture_worker_lock`, 8 functions, deny-all RLS, 13-group template seed, settings row off), [checks](../supabase/tests/part_pictures_checks.sql) (32, in the CI replay loop), paste file [part_pictures_LIVE_apply.sql](./part_pictures_LIVE_apply.sql). Local replay 417 migrations from empty OK; Claude re-ran the checks: 32/32, no test rows left. Claude fixed the paste file's last line (`DO NOTHING.` → `DO NOTHING;`). **Not applied to production, not committed.** Next: server round S1 (DSH).
- **Server round S1 built 26 Nov (DSH), checked by Claude:** reader, queue, worker, prompt, cleanup, settings, internal route, `parts-run` on `fleet-picture-cron`, cron migration `20261126090807_part_picture_cron.sql` (added to the paste file). Claude re-ran 150/150 tests; new files type-check clean (the 15 errors are the old ones in `catalog_research_worker.ts`). **Three fixes needed (round S1b):** (1) the test fixture is the owner's real page — it holds the owner's car frame number, their Windows user name and Amayama's whole page with the Toyota diagram, and the repo is public → replace it with a cut-down page with made-up content; the real-file test reads the file from Downloads only when it exists; (2) retries made 4 Gemini calls, not 3 → `max_attempts` = total calls (§3.3); (3) a run could start a 50 s call with too little time left → §3.3 time guard. Not committed, not live.
- **Fix round S1b DONE 26 Nov (DSH), checked by Claude:** real-page fixture deleted, replaced by a 6 KB made-up single-file page (`fixtures/single-file-diagram.mhtml`: quoted-printable HTML, base64 + binary PNG parts, CSS part); the real-file test reads Downloads and is ignored when the file is absent. 3 Gemini calls in total; 60 s time guard; one diagram per image (no duplicates). Claude re-ran 154/154. Next: server round S2 = §3.5 Dominion routes + §3.6 Fleet lookup (DSH), then the screen round (Claude).
- **Server round S2 DONE 26 Nov (DSH), checked by Claude:** [part_picture_admin_routes.ts](../supabase/functions/_fleet-server/part_picture_admin_routes.ts) (10 routes on platform-catalog; each calls `assertCatalogStaffReadResponse`, the 3 owner writes also `ownerDenied`; fleet owner / driver refused, tested), `part_picture_admin_db.ts`, `part_picture_reads.ts` (picture shape, waiting reason, four banners), `part_picture_urls.ts`; `GET saved-pages/:id` rows carry `picture`; `fleet_parts_lookup.ts` gives `picture` only for `status = 'ready'`. `part_sourcing_routes.ts` skips its master-write gate for `/admin/part-picture*` (auth still runs; the routes' own staff check covers it). Claude re-ran 225/225 (part-picture, saved-page, vehicle-picture, fleet-parts). Not committed, not live. Next: screen round (Claude).
- **Screen round built 26 Nov (Claude), not yet checked in the app:**
  - Server additions by Claude: `GET part-pictures/by-numbers` (S2 job panel; staff check; test added) and `attachFleetPartPictures` on `GET /parts/find`, so the calipers / cables / shoes cards each get their own ready picture in one read (test added). Fleet parts + admin route tests 57/57.
  - Dominion: `part-pictures/partPicturesApi.ts`, `PartPictureBits.tsx` (frame, state pill, Remake confirmation with cost, large view), `PartPicturesPage.tsx` (S3: settings card, banners, five tiles, filters incl. "This upload", 24-card grid with Newer/Older, loading / error / empty, Templates tab with owner-only Save and the remake-older dialog); page id `part-pictures` in all six spots (sidebar child, shared-pages list, activeWhen, Vehicles home tile, Dominion home tile, AdminPortal + `savedPageId` kept in the address). S1 in `SavedPageOverlay.tsx`: single-file how-to step, 8 MB, per-row thumbnail + state, pictures line, "Pictures need the drawing" notice, "Nothing new to save" title, **See pictures**, refresh every 10 s while one is being made. S2 in `ResearchJobDrawer.tsx`: picture beside the number, state line, Remake / Hide from Fleet / Show in Fleet, large view, refresh every 10 s while making.
  - Fleet: `everyday/PartPictureTile.tsx` (photo + caption, drawing while loading or when broken, large view with Close) in the pads card (`StitchAnswerCard`) and the calipers, cables and shoes layouts.
  - Checked: Dominion and Fleet type-check clean in every changed file (the 24 admin errors are old, elsewhere).
  - **Checked 26 Nov after the owner repaired the install:** new tests — `PartPicturesPage.test.tsx` (11), `SavedPageOverlay.pictures.test.tsx` (4), Fleet `PartPictureTile.test.tsx` (3); full suites Dominion **289/289**, Fleet **2229/2229**. New browser test [e2e/dominion-part-pictures.spec.ts](../e2e/dominion-part-pictures.spec.ts) (6, done-test 19: every new button, no §4b Drop text; added to `playwright.dominion.config.ts`) passes; the old [saved-page browser test](../e2e/dominion-saved-page-parts.spec.ts) 9/9 after updating it to the new how-to wording, the 8 MB limit and the owner's earlier move of the upload card to the number steps. Side-by-side with the Stitch screens done for S1, S2, the large view, S3 both tabs, the remake dialog, banner/empty/error, and Fleet pads, calipers, shoes and phone (throwaway check, deleted with its screenshots).
  - Fixes from that run: S1 now copies only the pictures onto the result it already shows (it had swapped the whole result); Fleet no-photo tiles are a square with a large drawing (they read as an empty box), small one on the older-number card.
  - **LIVE 26 Nov 11:16 UTC:** [PR #15](https://github.com/DeekiiiiiiiT/Goride/pull/15) merged (main `b761b407`); edge deploy green (platform-catalog, fleet-core, fleet-picture-cron and the rest), Vercel green; the 2-minute job now gets `200 {"stopped":"off"}` (it got `404 Unknown operation` before the deploy). The PR also fixed the old `places-ui` test (Add parts has no match-types label or Advanced tune since 83fad398) and gave CI's "Deno test find parts" step `--allow-env`. **AI part pictures are OFF.** Next: owner turns them on (Dominion → Vehicles → Part pictures), then one real single-file upload (done-test 1).
  - **26 Nov go-live progress:** owner pasted the SQL (second try; the first failed on a `DO NOTHING.` typo in the cron logbook line, nothing applied) — checked live: 5 tables with RLS, 9 functions, 13 templates (Fluids + Tires off), settings off, both logbook lines, `part-picture-worker` every 2 min. Code shipped from a clean copy of main as [PR #15](https://github.com/DeekiiiiiiiT/Goride/pull/15) (branch `part-pictures`, 97 files, pre-push 7/7); the drawer there carries only the picture changes, not the separate unshipped "upload card on the number steps" change. Not merged yet.
  - Earlier note — go-live (§7 step 6): owner pastes `docs/part_pictures_LIVE_apply.sql` (both migrations + logbook lines), then the code ships from a clean copy of main (this folder carries other unshipped work); the switch stays off until the owner turns it on.
- Round 1 review (DSH) is done: [part-pictures-build/review-round-1.md](./part-pictures-build/review-round-1.md), 22 findings, all folded into this Rev 2 (see §8). Claude re-checked the four High ones on code and live data.
- **Stitch prompts written (26 Nov):** [stitch/part-pictures-dominion-prompt.txt](./stitch/part-pictures-dominion-prompt.txt) (14 screens: S1–S3) and [stitch/part-pictures-fleet-prompt.txt](./stitch/part-pictures-fleet-prompt.txt) (7 screens: F1).
- **Round 2:** done 26 Nov for both apps (§4b). **The plan is closed.**
- **Next (build, §7):** step 0 — owner saves the air-cleaner page in Chrome as **Webpage, Single File** into `Downloads` (done 26 Nov: `Downloads/Air cleaner … Amayama.mhtml`, 1.18 MB, holds the diagram as its one image part, the image map and the page link); step 1 data; step 2 the real Gemini probe (gate before any screen work).
- **Sample page:** `Downloads/Air cleaner for Toyota Tank_Roomy M900A-AGBVE … Amayama.mhtml` (1.18 MB, 8 parts, 1 image) and the older `.html` + `_files` folder. Note: the image-map rectangles in the `.mhtml` are scaled (17801 = `249,269,279,279`) and differ from the `.html` (`346,374,388,389`), so `map_box` is kept only as a hint, never trusted as pixels.
- **The owner's own prompts** (base, brakes, suspension, electrical) are the starting point for §3.4. Two changes, both in §5: one picture per part (not one sheet), and no words drawn in the picture.

---

## 1. What exists today (checked 26 Nov on code and the live database)

| Thing | State |
|---|---|
| Saved-page upload | Live. `.html` or `.mhtml` up to **5 MB** (the limit is in 3 places: server `MAX_FILE_BYTES`, the overlay's `MAX_BYTES`, the stop card's sentence). Reads text only; never stores the file. Rows end as `saved`, `already` (already on file), `held` or `not_roam_type`. |
| Single-file reader | `mhtmlToSavedPage` in `saved_page_text.ts` decodes the **whole file as UTF-8 text** and keeps only the `text/html` part. Pictures inside the file are thrown away; nothing links `<img usemap>` to its `<map>`. |
| Car pictures | Live since 17 Nov. `gemini-3.1-flash-image`, US$0.04 each, text-in only (no image input yet). Queue + lease + retries + versions in SQL functions (`vehicle_picture_db.ts`). Stored on R2 `roam-public` as `catalogue/images/<id>/v<n>.<ext>` (live keys are `.jpg`), immutable cache header, card/detail sizes through Cloudflare resizing on `media.roamfleet.co`. Cron runs through the `fleet-picture-cron` relay because a bare cron call got 401 on production. |
| Gemini cap | `api_budget:gemini` = US$15/day, US$80/month, hard stop, checked before every call. Shared by all Gemini use. |
| Parts | `part_master`: 64 rows, 63 numbers, **55 interchange groups**. Maker column is `manufacturer`. `image_url` and `photo_verified` exist, both unused (0). One group can hold several makers' rows for the same part (live: `04465-B1190` has a Toyota and a Daihatsu row in one group). |
| Already on file | 485 Confirmed listings over **47 numbers**. The sample's air filter `17801-21060` is already Confirmed on the Roomy, so its upload says **Already on file**. |
| Part groups | 18 `kind='system'` rows: the **13 part groups** (Engine, Exhaust & emissions, Brakes, Hybrid & electric, Suspension & steering, Lighting & visibility, Filters, Battery & electrical, Fluids, HVAC, Tires & wheels, Transmission, Belts & hoses) plus 5 that are not part groups (Shop fees, Vehicle OE numbers, Part cross-references, Shared platform links, Car specs). Every active part type sits under one of the 13. |
| Fleet Find parts | Answer card `StitchAnswerCard.tsx` has one picture tile that always draws a brake pad (`StitchPadIllustration`); the calipers, cables and shoes answers have no picture slot. The lookup already returns `brand` (= `manufacturer`) and `groupId`. Information only, no prices (owner rule). |

**Cloudflare:** no new setup. The public and private buckets, `media.roamfleet.co`, image resizing and the no-index rule are live. The two new folders (§2 D6) are added to the folder table in the storage audit.

---

## 2. Data

### D1. `public.part_picture` — one row per physical part (interchange group)
- `id`, `interchange_group_id` (**unique**), `manufacturer`, `part_number`, `part_name` (display only), `catalog_group_id` (Brakes/Engine/…), `component_id`
- `status`: `queued` · `making` · `ready` · `failed` · `hidden`
- `label` (diagram callout, e.g. `17801`, or null — source in §3.1), `r2_key`, `version`
- `template_version`, `prompt`, `ai_model`, `cost_usd`
- `attempts`, `next_attempt_at`, `lease_until`, `last_error`
- `made_at`, `hidden_at`, `hidden_by`, `source_saved_page_id`, `created_at`, `updated_at`
- Rules: `ready` needs `r2_key` and `made_at`; RLS deny-all (server only), same as `vehicle_picture`.

### D1a. SQL functions (mirror the car system's seven)
1. worker lease acquire / release
2. claim next rows (atomic, skips leased rows)
3. add an attempt
4. **becomes ready** — insert version + retire old + set `ready`, one transaction; every path uses it
5. sweep stuck `making` rows back to `queued`
6. requeue giving back an attempt (budget block, key pause)
7. cleanup candidates (old versions and diagrams past 30 days)

### D2. `public.part_picture_version` — old pictures
One row per earlier picture (key, prompt, template version, model, cost, date). File deleted after 30 days.

### D3. `public.part_picture_diagram` — the diagram, kept 30 days
- `id`, `picture_id`, `saved_page_id`, `r2_key` (private), `map_box` (the part's rectangle from the page's image map, or null), `delete_after` (+30 days), `deleted_at`
- Kept so **Remake** works for 30 days; deleted by the same cleanup as old versions.

### D4. `public.part_picture_template` — one row per part group
- `catalog_group_id` (key), `materials`, `enabled`, `version`, `updated_by`, `updated_at`
- Save adds 1 to `version`. Fluids and Tires & wheels start `enabled = false`.

### D5. Settings row `kv_store_37f42386.key = 'part_pictures:settings'`
`ai_part_pictures` (default **off**), `part_picture_model` (`gemini-3.1-flash-image`), `max_attempts` (3), `daily_max` (50), `retention_days` (30), plus the pause fields the car settings have.

### D6. Storage layout (server-written, no upload purpose)
- Public: `catalogue/parts/<pictureId>/v<n>.<ext>` (`<ext>` from the bytes the model returns), cache `public, max-age=31536000, immutable`.
- Private: `part-diagrams/<pictureId>/<uuid>.<ext>`.

### D7. Checks (`supabase/tests/part_pictures_checks.sql`, run in the CI replay loop)
- unique `interchange_group_id`; `ready` has a file; nobody but the server can read or write the four tables
- each D1a function: claim never returns a leased row; becomes-ready leaves exactly one current version
- a diagram past `delete_after` with no `deleted_at` is reported
- `part_master.image_url` and `photo_verified` stay empty after a picture is made
- server code: no `select("*")` on `part_picture*` (explicit column lists only)

---

## 3. Server

### 3.1 Reading the single-file page (`saved_page_text.ts`)
- New byte-level reader beside the text reader: walks the MIME parts on the raw bytes, keeps each part's bytes, type, `Content-ID` and `Content-Location`, decodes base64 or binary correctly.
- Links `<img usemap="#m">` → `<map name="m">` → the `<area>` whose title or key names the part → that image part.
- Diagram choice per part: the image whose map names this part; otherwise the largest image at least 300 px each way. At most 3. No site names in the rule.
- **Label:** the leading token of the part's group line (the text before " - ", 3–5 digits/letters, e.g. `17801` from `17801 - ELEMENT SUB-ASSY, AIR CLEANER FILTER`); none → null.
- Tested with the owner's real Chrome single-file page (§7 step 0), not a hand-made file.

### 3.2 After the upload saves (`research_saved_page_routes.ts`)
1. For every proven row whose part type is an active Roam type — **`saved` or `already`** — find its interchange group.
2. Skip it when the group's template is off or the group already has a `ready`, `queued`, `making` or `hidden` picture.
3. Otherwise add a `part_picture` row (`queued`) and store its diagram(s) (D3).
4. `.html` upload or no diagram found → nothing queued, counted as `noDiagram`.
5. **Best effort:** any error in steps 1–4 is caught and logged; the upload still returns `done` with `pictures.failed = true`.
6. Result gets `pictures: { queued, alreadyHave, noDiagram, failed, rows: [{ number, status }] }`. Older results without `pictures` still show.
7. Nothing is drawn during the upload (150-second limit).

### 3.3 The worker (copy of `vehicle_picture_worker.ts`)
- Cron path: `pg_cron` (every 2 min) → `private.invoke_part_picture_worker()` → `net.http_post` to the worker route with `X-Fleet-Cron-Secret`, through a `verify_jwt = false` relay like `fleet-picture-cron`. Its own migration, pasted by the owner.
- Claims up to 5 rows (D1a), honours the switch, daily max, pause fields and the Gemini cap.
- One Gemini call per row: diagram image(s) + prompt (§3.4), square picture.
- Saves to D6 with the immutable cache header, then **becomes ready** (D1a 4).
- Failure: `max_attempts` (3) is the number of Gemini calls a picture gets in total: retry after 2 min, then 4 min, and after the 3rd failed call it is `failed` with a plain reason (same rule as the car pictures).
- Time guard: a run never starts a picture unless at least 60 s of its 90 s budget are left (one call can take up to 50 s); rows it did not start go back to `queued` without using an attempt. Budget block or key refusal → requeue without using an attempt (D1a 6).

### 3.4 The prompt (built in code from the template)
> Look at the parts diagram in the attached image. Find the part labelled **{label}** — **{part name}**.
> Create one realistic, top-down photograph of **only that part**, on a plain light-grey studio surface, looking like a real part photographed with a real camera — not line art.
> Use these materials only where they belong to this part: {materials line from the group's template}
> Show the part on its own, exactly as it is sold: no housing, case, cover, clips, hoses or any other part that is not part of it.
> Soft, even overhead lighting with a natural contact shadow. The whole part in view, centred, sharp focus.
> No words, numbers, labels, logos or brand names anywhere in the picture. Do not include the diagram.

No label → the first line is "Find the part named {part name}".

Starting templates (owner edits them in S3):

| Group | Materials line |
|---|---|
| Filters | Molded black polypropylene housings, pleated white/off-white filter media with orange/amber rubber gasket trim, stamped steel clips. |
| Engine | Cast aluminium and cast-iron parts with machined faces, black molded plastic covers, rubber seals and gaskets, zinc-plated bolts. |
| Brakes | Machined cast-iron rotors with a cross-hatched friction surface, cast aluminium or iron calipers, ceramic/semi-metallic pads on steel backing plates, braided steel or rubber hoses with brass/steel fittings, zinc-plated pins and rubber dust boots. |
| Suspension & steering | Satin-black stamped steel or forged aluminium arms, painted shock absorbers with polished chrome rods, powder-coated coil springs, black rubber or polyurethane bushings, ball joints with black rubber boots, zinc-plated nuts and bolts. |
| Battery & electrical | PVC-insulated copper wiring in black split-loom, molded nylon connectors with seals, black plastic relays and fuse blocks, brass/tin-plated terminals, metal sensor bodies with O-rings. |
| Exhaust & emissions | Stainless or aluminised steel pipes and shells with heat discolouration, ceramic sensor tips, steel flanges and gaskets. |
| Lighting & visibility | Clear polycarbonate lenses, chrome reflectors, glass bulbs with metal bases, black plastic housings, rubber wiper blades on steel or plastic frames. |
| HVAC | Black and grey molded plastic housings, pleated cabin-filter media, aluminium fins and tubes, rubber seals. |
| Belts & hoses | Black EPDM rubber ribbed belts and hoses, steel worm-gear clamps. |
| Transmission | Cast aluminium cases, machined steel gears and shafts, rubber seals, black plastic filters. |
| Hybrid & electric | Orange high-voltage cables and connectors, aluminium inverter and battery housings, black plastic covers. |
| Fluids | (off) |
| Tires & wheels | (off) |

### 3.5 Dominion routes (platform-catalog)
| Route | Who |
|---|---|
| `GET part-pictures` (filters: catalogue group, status, saved page; 24 a page) | staff |
| `POST part-pictures/:id/remake` · `/hide` · `/show` | staff |
| `GET part-picture-templates` · `PUT part-picture-templates/:catalogGroupId` | read staff, write **owner** |
| `GET part-picture-templates/:catalogGroupId/remake-older` (count, cost, days) · `POST` same (re-queue) | read staff, write **owner** |
| `GET/PUT part-pictures/settings` | read staff, write **owner** |

- Every picture comes back as `picture: { status, waitingReason, url, urlDetail }` (card and detail sizes through the existing `pictureUrlFromKey` / `publicMediaUrl` helpers).
- `waitingReason`: `off` · `budget` · `key_refused` · `paused`, from the same settings and pause fields the car page reads.
- Remake with no diagram (past 30 days) answers "Upload the page again as a single file to remake this picture."

### 3.6 Fleet (`fleet_parts_lookup.ts`, fleet-core)
Each answer gets `picture: { url, urlDetail } | null` for its interchange group when the picture is `ready` (never `hidden`). Other compatible numbers in the same answer get no picture of their own.

---

## 4. Screens (round 1 settled)

**House button rule (all screens):** primary = dark fill; secondary = white with a `#c5c6d0` border; destructive = white with a red border and red text. Every action is a real button at least 44 px; no outside-link icons; confirmations are in-app dialogs; no browser pop-ups. Dominion shows only its own data: no fleet name, plate, driver, count or "used by".

### S1 — Saved-page result (`SavedPageOverlay`, result step)
| Item | Must show |
|---|---|
| Counts | The four existing pills, unchanged. Under them: "Pictures: 1 being made · 2 already have one · 3 with no diagram" (only the non-zero parts). |
| Each result row | As today, plus a 40 px thumbnail and one word: Making / Made / Failed / No diagram. `Already on file` rows too. |
| Button | **See pictures** (secondary): opens S3 filtered to this upload. |
| `.html` upload | Notice under the counts: "Pictures need the diagram. Next time, save the page in Chrome as **Webpage, Single File** and upload that." No button. |
| AI part pictures off | No pictures line, no thumbnails, no button. |
| Picture step failed | The pictures line reads "Pictures couldn't be queued — try again in a minute." Parts stay saved. |
| Loading / error | Unchanged. |
| Size limit | Stop card reads "Saved pages up to 8 MB can be read." |
| Upload step | The "How to save the page" step 3 reads "Save it as **Webpage, Single File**. That also brings the drawing, so Roam can make a picture of each part." The info line adds "Each Roam part also gets a picture a minute or two later." |
| While open | Rows that are Making refresh by themselves every 10 s, and stop when none is Making. |

### S2 — Part card in the job panel (`RoamFoundCard`, Added cards)
| Item | Must show |
|---|---|
| Picture box | Square, 96–120 px, to the left of the number (Stitch layout). |
| none | Outline icon + "No picture yet". |
| queued / making | Soft pulse + "Making the picture". |
| waiting | Pause icon + "AI pictures are off" / "Today's budget is used up" / "The picture service refused the key" / "Paused until 14:30". |
| ready | Picture + "Made by AI from the maker's diagram · 26 Nov". |
| failed | Outline icon + the plain reason. |
| hidden | Greyed picture + "Hidden from Roam Fleet". |
| no diagram (past 30 days) | "Upload the page again as a single file to remake this". |
| Buttons | **Remake** (secondary; ready or failed; disabled with the reason when there is no diagram) opens an in-app confirmation "Make this picture again? About US$0.04." with **Cancel** / **Remake**; **Hide from Fleet** (destructive; ready) and **Show in Fleet** (secondary; hidden) act at once, no confirmation. |
| Picture tap | In-app overlay, full picture, **Close**. |

### S3 — Part pictures page (new, page id `part-pictures`)
| Item | Must show |
|---|---|
| Where it lives | Child in the sidebar's Vehicles list (`VEHICLE_DATABASE_CHILDREN`), a tile on the Vehicles home (`VehiclesHomePage`), a branch in `AdminPortal`, and an entry in the `activeWhen` list. |
| Top bar | **AI part pictures** switch (owner); "Made today: 3 of 50"; "This month: US$0.12 on part pictures · US$14.80 of the US$80 Gemini budget". |
| Banners | Same four as the car page, same words: key refused, paused (reason + time), AI off, 80% of budget. |
| Counts | Ready / Being made / Waiting / Failed / Hidden — each is a filter. |
| Tab **Pictures** | 24 cards a page (**Newer** / **Older**): picture, number, name, catalogue group, state word, made date; **Remake** / **Hide from Fleet** / **Show in Fleet**. Filters: catalogue group, state, this upload (from S1). |
| Tab **Templates** | One card per part group: materials box, **On/Off** switch, version, "last edited by … on …", **Save** (owner), **Remake pictures made with an older version** (owner). |
| Bulk remake | Line "12 pictures · about US$0.48 · about 1 day at 50 a day", then an in-app confirmation with **Remake** and **Cancel**. Pictures with no diagram left are counted separately ("3 need the page uploaded again"). |
| Staff (not owner) | Same page; switch, Save and bulk remake disabled with "Only the owner can change this". |
| Loading | Two grey placeholder rows. |
| Error | One plain line + **Try again**. |
| Empty | "No part pictures yet. Upload a saved page as a single file to make the first ones." |

### F1 — Roam Fleet, Find parts answer
| Item | Must show |
|---|---|
| Where | One shared `PartPictureTile` in **all four** answer layouts (pads, calipers, cables, shoes). It is the only place a part picture appears in Fleet. |
| With a picture | The picture fills the tile; tap → in-app overlay with **Close**. Caption under it: "Picture made by AI from the maker's diagram — the real part may look different." |
| No picture | Today's drawn art stays (never an empty box); no caption. |
| Photo loading or broken | The drawn art shows until the photo loads; if it fails to load, the drawing stays (never a broken-image icon). |
| Other compatible parts | No picture of their own. |
| Not shown | Prices, suppliers, stock, quotes, carts. |

---

## 4b. Review round 2 — Stitch screens vs plan (Keep / Drop / Add)

**Roam Fleet — checked 26 Nov.** Screens in [stitch/part-pictures/fleet/](./stitch/part-pictures/fleet/). 6 of the 7 asked for arrived; the handbrake cables screen (prompt Screen 4) did not.

**Rule for every Fleet screen (from F1):** the build changes only the picture tile, its caption and the large view. Everything else on the answer card stays exactly as it is live today (frame, title row, number box, Other numbers, Also fits with real maker logos, Use in a service log). So anything Stitch redrew outside the tile is dropped, not built.

| Screen | Keep | Drop | Add |
|---|---|---|---|
| 1 Front brake pads (light) | Picture tile as the left column, large, with the photo filling it; caption under the tile in muted 14px; "Both front wheels" box under the caption; right column unchanged. | Maker initials in circles (T D S Sz M P) → today's real maker logos; the "© 2025 Roam Fleet" footer band. | The tile is a button (tap → large view). "See every car" and "Use in a service log" keep their visible border (today's buttons). |
| 2 Large view | Dimmed answer behind; one big square photo in a white rounded overlay. | The blurred "Verified Fit" chip (invented); the overlay running off the bottom. | The overlay fits the window (680px wide, photo 600px). Under the photo: part name, number in mono, the caption, and a primary **Close**. Escape closes. |
| 3 Front brake calipers | Two cards side by side, each with its own photo tile on top + caption, "Verified", the number box and **Copy number**; the info line "Your Roomy has two — one for each front wheel." | "POSITION ON VEHICLE" label and "(Passenger side)" / "(Driver side)" (invented, and wrong for right-hand-drive Jamaica); the "Ordering as a pair?" card and "Brake System: Akebono Type" (invented advice and facts); upper-case "GIVE THE STORE THIS NUMBER"; the missing page title and tab pill. | Today's tiny car drawing with "Right front" / "Left front"; today's frame and sentence-case labels. |
| 4 Handbrake cables | — (not drawn) | — | No new design needed: same card as the calipers, three across. Cable 1 shows its photo + caption; cables 2 and 3 show the drawing with no caption. |
| 5 Rear brake shoes | Verified card with the photo tile + caption and "Both rear wheels"; lighter older-number card with the **drawing** in a small tile, the amber "Check before buying" pill, "An older number some stores still use.", no caption. | The spec box (Component type, Drum inner diameter 180 mm, Fitting position, OEM Supplier Akebono); "Updated today from official EPC"; the "Fitment Guarantee Notice" with its 2021 claim; "set for rear drum brakes" and "Drum brake assembly (axle pair)". All invented. | Today's frame (title, tab pill). |
| 6 Front brake pads (dark) | Dark picture tile (#3a3a3d fill) and muted caption; card layout as Screen 1. | The redrawn black top bar (truck logo, "Vehicle Operations" in a blue pill); "Matched to your vehicle record"; "INSTALLATION POSITION" label; maker initials; the light footer band with Privacy / Terms / Support links. | Today's dark frame. Note: Stitch's sample photo prints "TRW" on the pads, which is exactly what PP-05 forbids. The worker's prompt keeps the "no words, logos or brand names" line, and **Hide from Fleet** is there for the ones that slip through. |
| 7 Phone (390px) | Order: photo full width on top, caption, "Both front wheels", title + Verified, number box with full-width **Copy number**, Other numbers, Also fits with full-width **See every car**, **Use in a service log**. | The tall narrow photo strip → a square photo full width; "Replaced as an axle set of 4 pads" (a maintenance tip, owner rule: parts only); the "3 makes" chip; the redrawn phone header with menu icon and the bottom tab bar (Fleet / Service / Logs / Parts). | Today's phone frame; "Use in a service log" with its visible border. |

**Dominion — checked 26 Nov.** All 14 screens in [stitch/part-pictures/dominion/](./stitch/part-pictures/dominion/). Several pictures show as broken-image text in the export; that is Stitch's export, not the design (its sample photos sit in the same folder).

**Rule for every Dominion screen:** today's Dominion frame stays exactly as it is live (sidebar groups and items, top bar, user "Deeki T · Owner"). Screens 11–14 redrew the frame (serif font, "Route Optimization", "Dispatch Board", "Operations Dispatch", "Mesh Connected", "v2.4"): all dropped. Version chips Stitch added to page titles ("SYNC ENGINE: GEMINI VISION v2.4", "AI Rendering Engine v4.2", "SYNTH-IMG v4", "v2 Gemini AI", "MESH ASSETS") are dropped everywhere.

| Screen | Keep | Drop | Add |
|---|---|---|---|
| 1 Upload, single file chosen | Overlay layout; how-to panel with step 3 as written; file row "4.9 MB · saved web page · single file"; link field with check and "Found in the file"; info line; "Saved pages up to 8 MB can be read."; Read page primary. | Pink filled Cancel. | **Cancel** in the house danger style (white, red border, red text). |
| 2 Result, already on file, Making | All of it: slate tick, title, four pills, "Pictures: 1 being made", the row with thumbnail + blue "Making" pill, collapsed "Not a Roam part type", **See pictures** + **Done**. | — | — |
| 3 Result, saved + Made | Pills, "Pictures: 4 made · 2 being made", rows with thumbnail + "Made" pill + Confirmed. | The "(4 items)" mono count; the cut-off bottom. | Built like Screen 2 with all six rows, the collapsed row and the footer (no new design needed). |
| 4 Result, `.html` | The blue notice "Pictures need the drawing." + line; the row with grey outline "No diagram" pill. | Upper-case "ALREADY ON FILE" label → the same group heading as Screen 2; the invented car-page background ("Chassis & Powertrain", "Sync Amayama", "Verified Dataset"). | **Done** footer (cut off). |
| 5 Job panel, air filter | Card layout: picture tile on the **left** of the number (not above), "Made" pill, "Made by AI from the maker's diagram", number + Added, Fits box, site chip + "Read on 26 Nov 2026". | "OEM Matched"; "Synthesized 26 Nov 2026" (mono); "Engine model: 1KR-FE 996cc naturally aspirated"; "Direct view ↗"; the "STATUS · Ready for Dispatch" footer and **"Confirm & Proceed"** button (invented actions); the invented page behind ("BATCH #882-TK", "Fleet Component Pipeline", "Export Manifest"). | Today's "You checked it on the car maker's catalogue." line; the **Remake** + **Hide from Fleet** buttons (shown in Screen 6, missing here). |
| 6 Job panel, four states | All four states exactly as drawn (Made with Remake + Hide from Fleet; Making; Waiting "Today's budget is used up"; Hidden from Fleet with its line). | "4 match results"; the invented table behind ("Pending Master Entities", "REF", "OEM IDENTIFICATION"). | **Show in Fleet** on the hidden card (cut off). |
| 7 Large view | Big square picture, name + number, "Made" pill, made line with versions, Remake / Hide from Fleet / **Close**. | "MEDIA PREVIEW" label; "1024 × 1024 px · High Fidelity" chip; the number in blue (→ dark mono, like everywhere else); the invented page behind. | Visible borders on Remake (secondary) and Hide from Fleet (danger). |
| 8 Pictures tab | Header, settings card (switch, "Made today 3 of 50" bar, both spend lines), tabs, five count tiles, search + two dropdowns, 4-across cards, state pill on the picture, group chip, made date, Newer / Older. | "8 part items rendered"; "SYNTHESIZING…" (→ "Making the picture" as in the Making card's own line); the car icon in empty frames (→ the part type's icon); blue part numbers (→ dark mono). | Cards keep the short **Hide** label (space); its full meaning shows in S2 and the large view as **Hide from Fleet**. |
| 9 Templates tab | Info line; one card per group with icon, On/Off switch, text box, version line, **Save** (disabled + "No changes" when unchanged), remake button + its count/cost/days line. | The invented group subtitles ("Air, cabin, oil, and transmission filtering elements" …); "MATERIAL TEXTURE & RENDER PARAMETERS" (→ "Materials"); the "4" badge on the tab; the "Deactivated" chip (the Off switch already says it). | — |
| 10 Bulk remake dialog | All of it: icon, title, body, three-line box, the two muted lines, **Cancel** (danger) + **Remake 3 pictures**. | Row labels "Estimated processing fee" / "Projected run schedule" (→ "Cost" / "Time"); the invented page behind ("Vehicle Drawing Templates", "Vector Canvas Library", "New Template"). | Behind it: the Templates tab. |
| 11 Off, staff view | Amber banner with its two lines; switch disabled with "Only the owner can change this"; staff still see Remake / Hide / Show on cards. | The redrawn frame (see rule); tile sub-labels ("93.1%", "idle", "queued", "needs review", "suppressed"); "Queue Inactive" chip; "Diagram received"; Remake/Hide buttons on the **Waiting** card (waiting cards have no buttons, as in Screen 6 and 8). | User shown as "Staff" in today's top bar. |
| 12 Loading | Grey placeholders for tiles, filters and cards; no spinner. | "Syncing OEM CAD schematic partitions via Dominion Neural Engine…" bar and "Cluster 04-B". | — |
| 13 Couldn't load | The centred card: icon, "Couldn't load the pictures", line, **Try again**. | "Pipeline: Unreachable"; the "Mesh Cluster Edge 03 · ERR_CONNECTION_TIMED_OUT · HTTP 504" box; "Still having issues? Contact Dominion Fleet Operations Dispatch." | — |
| 14 No pictures yet | Settings card at 0; five tiles at 0; the centred card with its line. | Tile sub-labels ("verified", "active gen", "in queue", "retries", "archived"); the "Awaiting Source Data · HTML, PDF or EPC exploded parts schematics · Ready" box (wrong: only a single-file page gives pictures). | — |

Two more things the screens show: Stitch's sample brake-pad photo prints "TEXTAR" on the pads (as "TRW" in the Fleet set), so the no-brand line in §3.4 stays and Hide is the backstop; and the S2 picture sits beside the number, not above it (Stitch owns the look; §4 S2 updated).

**Round 2 closed 26 Nov** (Fleet + Dominion).

---

## 5. Problems found (one fix each)

| # | Problem | Fix |
|---|---|---|
| PP-01 | A normal `.html` save keeps the diagram in a separate `_files` folder the upload never receives. | Pictures come only from `.mhtml` (Chrome "Webpage, Single File"). `.html` uploads still save numbers and show the S1 notice. |
| PP-02 | The 5 MB limit is too small for a single-file page (sample ≈ 4.9 MB). 15 MB would strain the edge function's memory and CPU. | 8 MB, changed in all three places (server, overlay, stop-card sentence). |
| PP-03 | A saved page holds many pictures (logo, icons, cart). | §3.1 rule: the image whose map names the part, else the largest ≥ 300 px each way, at most 3, no site names. |
| PP-04 | The diagram must outlive the first picture, or Remake can never work. | Keep it 30 days in the private bucket (D3), deleted with the old versions. |
| PP-05 | AI pictures can carry brand names ("TOYOTA" on the owner's example) and misspelled text. | The prompt forbids words, numbers, logos and brands; the screen shows number and name. |
| PP-06 | The same physical part has several numbers or makers (Toyota + Daihatsu pad in one group). | One picture per interchange group (D1). |
| PP-07 | `part_master.image_url` / `photo_verified` exist; "verified photo" would be wrong for an AI picture. | Leave both untouched; D7 checks they stay empty. |
| PP-08 | Most parts on a page are already on file (47 numbers confirmed live), and only `saved` rows were queued. | Queue for every proven Roam-type row, `saved` or `already` (§3.2). Re-reading a page with **Read again** therefore pictures parts already on file. |
| PP-09 | An AI picture can get a shape wrong. | Show at once with the AI caption; **Hide from Fleet** and **Remake** one click in S2 and S3. |
| PP-10 | Fluids and tyres give little value (a bottle, a tyre). | Their templates start off; the owner can switch them on. |
| PP-11 | Cost must stay small. | Off by default, 50 a day, shared Gemini cap ($15/day, $80/month), ~US$0.04 a picture; S3 shows both spend lines. |
| PP-12 | Drawing during the upload would push it toward the 150-second limit. | The upload only queues; the worker draws. |
| PP-13 | Nothing has proven that `gemini-3.1-flash-image` takes a diagram as input and returns a good square picture. | A real probe (§7 step 2) is a gate after the data step and before any screen work. |
| PP-14 | A template edit should be repeatable on old pictures. | Pictures store their template version; S3 bulk remake shows count, cost and days, then confirms. |
| PP-15 | The diagram belongs to the car maker / the site. | Sent only to Gemini (paid tier, not used for training), never shown, kept 30 days privately, then deleted. Roam stores only its own new picture. |
| PP-16 | Some pages print no callout number. | Label from the group line when present (§3.1), otherwise the prompt names the part. |
| PP-17 | Dominion shows only its own data. | S2/S3 show picture, number, name, group, dates and cost only; a text-scan test checks it. |
| PP-18 | The single-file reader throws the pictures away (whole file decoded as text). | Byte-level reader with `Content-ID` and image-map linking (§3.1), tested on the real file. |
| PP-19 | The worker needs safe claiming and one "becomes ready" step, or two runs can pay for one picture twice. | D1a functions, each checked in D7 and in CI. |
| PP-20 | A bare cron call is refused (401) on production. | Cron → invoke function → relay with `verify_jwt = false` (§3.3). |
| PP-21 | The edge runtime cannot make WebP. | Store the format the model returns (D6). |
| PP-22 | A full-size picture in every small box and stale pictures after a remake. | Card/detail URLs through the existing helpers; new version = new key with the immutable cache header. |
| PP-23 | A queue that cannot move would show "Making the picture" forever. | `waiting` state with its reason in S2/S3 and the four banners. |
| PP-24 | A staff member could switch the feature off for everyone. | Switch, template Save and bulk remake are owner-only (§3.5). |
| PP-25 | A picture-side error could make a saved upload look failed. | Picture step is best effort (§3.2 step 5). |
| PP-26 | Fleet has one picture tile, on one layout, always drawing a brake pad. | Shared `PartPictureTile` in all four layouts (F1). |
| PP-27 | The upload's how-to says "Save it as Webpage. Either kind works.", which would lead the owner to the kind with no drawing. | Step 3 names Webpage, Single File and says why (S1 Upload step). |
| PP-28 | One Remake press spends money with no warning. | In-app confirmation with the cost (S2 Buttons). |
| PP-29 | A slow or broken photo link in Fleet would show an empty or broken tile. | Drawn art until loaded, and kept on failure (F1). |
| PP-30 | A group's materials line names things that sit around a part (Filters: "housings", "clips"), and the AI draws them in (probe try 1: filter inside a case). | Two fixed prompt lines (§3.4): materials "only where they belong to this part", and "on its own, exactly as it is sold". Proven by probe try 2. |
| PP-31 | Undoing an import or an added part deletes its interchange group, so its picture row goes with it (ON DELETE CASCADE) and its R2 file is left with no row. | Accepted as built: undo is a rare owner action and a picture is under 1 MB; blocking undo would break two existing features. |
| PP-32 | A fresh replay has only 11 of the 13 part groups: `Exhaust & emissions` and `Hybrid & electric` reached production by paste and are in no migration. | The template seed and checks cover "every part group that exists", so they pass in both places. Making the replay match production is a separate follow-up (outside this plan). |

---

## 6. Done-tests (written before building)

1. With AI part pictures on, upload the air-cleaner page as a single file → it says **Already on file** for 17801-21060, and within 5 minutes the row and S2 show a picture of a flat panel filter with no words on it.
2. Upload the same page as `.html` → the number shows, S1 has the single-file notice, nothing is queued.
3. A 6–8 MB single-file page is accepted; the app does not refuse it first.
4. The reader takes the diagram and the part's rectangle out of the real single-file page; a single-file page with no images gives "no diagram".
5. A page with no callout label still makes a picture (prompt uses the part name).
6. Upload a page whose part already has a picture → "already have one", no Gemini call, no cost.
7. The Daihatsu row of `04465-B1190` shows the same picture as the Toyota row.
8. **Remake** on one picture → version 2 appears, old file kept 30 days. After 30 days **Remake** says "Upload the page again as a single file".
9. Edit the Filters template → S3 shows count, cost and days → confirm → each gets the new version.
10. **Hide from Fleet** → within a minute Fleet's Find parts shows the drawn art, no caption. **Show in Fleet** brings the picture back.
11. Switch off / budget used up / key refused → S2 and S3 show `waiting` with the right reason and banner; nothing is spent.
12. Reach the daily max → rows wait, the uploader sees no error, they are made the next day.
13. With R2 unset (private copy), an upload still saves its parts and S1 says pictures couldn't be queued.
14. After a picture is made, `part_master.image_url` and `photo_verified` are still empty.
15. A word scan of S2 and S3 finds no fleet name, plate, count or "used by".
16. A staff login sees S3 with the switch, Save and bulk remake disabled.
17. Fleet shows the caption under every part picture, in all four answer layouts.
18. A Fluids part shows no picture while its template is off.
19. Playwright clicks every new button: See pictures, Remake, Hide from Fleet, Show in Fleet, Save, bulk remake + Cancel + Remake, both tabs, Newer/Older, Try again, overlay Close.

---

## 7. Build order (after the plan closes)
0. **Owner, now:** open the air-cleaner page in Chrome → Ctrl+S → "Webpage, Single File" → save to `Downloads`.
1. Data: D1–D7 + functions + checks, on the private copy.
2. **Gate — real probe:** the single-file page → byte reader → diagram → one real Gemini call → picture saved. Owner looks at the picture. No screen work until it passes.
3. Server: reader (3.1), queue (3.2), worker + cron relay (3.3), prompt (3.4), Dominion routes (3.5), Fleet lookup (3.6), each with tests.
4. Screens from Stitch: S1, S2, S3, F1, each with its test.
5. Private-copy run with the real page and the real Gemini key.
6. Go live: owner pastes the data, functions and cron SQL (each with its logbook line), settings row added, **platform-catalog** and **fleet-core** deployed, Dominion + Fleet shipped; switch on for everyone; one real upload.

## 8. Review log
- **Rev 1 (26 Nov):** first draft.
- **Rev 2 (26 Nov):** round 1 by DSH ([review-round-1.md](./part-pictures-build/review-round-1.md)), 22 findings, all taken. Claude re-checked the four High ones on code and live data (air filter already Confirmed; Toyota + Daihatsu pad rows in one group; 18 system rows; the single-file reader drops pictures; `fleet-picture-cron` relay exists; the Fleet tile always draws a pad). Changes: queue for `saved` and `already` rows (PR1-01); diagram kept 30 days (PR1-02); byte-level reader (PR1-03); real probe as a gate (PR1-04); 8 MB in three places (PR1-05); SQL functions (PR1-06); cron relay (PR1-07); stored format from the model (PR1-08); storage purposes dropped for literal keys (PR1-09); one picture per interchange group, `catalog_group_id` (PR1-10); card/detail URLs + immutable cache (PR1-11); S1 per-row state + See pictures (PR1-12); waiting state + banners (PR1-13); S3 loading/error/paging/owner-only (PR1-14); four navigation spots (PR1-15); bulk-remake money line (PR1-16); §1 facts fixed (PR1-17); three more checks (PR1-18); best-effort picture step (PR1-19); label source (PR1-20); button rule (PR1-21); picture tile in all four Fleet layouts (PR1-22). Next: Stitch prompt, then round 2.
- **Rev 2.1 (26 Nov):** Stitch prompts written (Dominion 14 screens, Fleet 7). Writing them surfaced PP-27 (how-to wording), PP-28 (Remake confirmation with cost), PP-29 (Fleet photo fallback), plus S1 rows refreshing while open; all added to §4–§5.
- **Rev 2.2 (26 Nov):** round 2 for Roam Fleet (§4b): 6 of 7 screens; rule that only the picture tile, caption and large view change; invented content dropped (spec box, EPC line, fitment notice, passenger/driver side, pair advice, vehicle-record line, redrawn frames). Dominion screens still to come.
- **Rev 3 (26 Nov):** round 2 for Dominion (§4b): all 14 screens; frame and version chips kept as live; invented actions dropped ("Confirm & Proceed", "Ready for Dispatch", "Direct view"), invented facts and system text dropped; S2 picture beside the number. **Plan CLOSED.** Next: build step 0 (owner's single-file save).
