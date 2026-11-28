# Part pictures — review round 1

**Verdict: Changes needed.** 4 High, 14 Medium, 4 Low. The plan is the right shape, but four things in it cannot work on today's code and live data, and they are the things the whole feature stands on: when a picture is queued, how it is remade, how the diagram is read out of a saved single-file page, and whether the model takes an image at all.

Reviewed: [the plan](../part-pictures-audit.md) (Rev 1), plus the code and live data it builds on. Read-only: no code, migration or database change was made.

---

## What I checked

| What | Result |
|---|---|
| The owner's real page, run through the repo's own parser (`saved_page_text.ts`) | 59,619 bytes → **90 lines**, 3 ms. Title carries `M900A-AGBVE`. Diagram row: `17801 - ELEMENT SUB-ASSY, AIR CLEANER FILTER`, then `Genuine Toyota 17801-21060 …`. |
| The diagram itself (`179509A.png`) | Real line drawing, 547×801. It **does** print the callouts: 17705, 12229A, 17875C, 17881, 17881A, 17801, 17751. So §3.3's "find the part labelled {label}" has something to find. |
| How the diagram is wired in the page | `<img src="…_files/179509A.png" usemap="#map1_179509A">` plus a `<map>` whose `<area title="ELEMENT SUB-ASSY, AIR CLEANER FILTER" data-key="1_179509A-17801">` also carries the exact rectangle of each part. |
| Is there a `.mhtml` of this page anywhere? | **No.** No `.mhtml` / `.mht` on the machine, and the repo's tests build a fake one. The only sample is the `.html` + `_files` folder. |
| Live `part_master` | 64 rows, 63 numbers, `manufacturer` present (Toyota 55), `image_url` and `photo_verified` both 0. Matches §1. |
| Live groups | Exactly the 13 names in §1, by name. (Count of system rows is 18, not 13 — see PR1-17.) |
| Live `part_listing` | 485 Confirmed listings, **47 distinct numbers**, 51 cars. |
| Is the sample filter already on file? | **Yes.** `17801-21060` is a **Confirmed** listing on Toyota Roomy M900A, all years. This breaks done-test 1 (PR1-01). |
| Live `vehicle_picture` | 3 rows, all `ready`, `cost_usd` 0.0400, key `catalogue/images/<id>/v1.jpg`, model `gemini-3.1-flash-image`. Matches §1. |
| Live budgets and settings | `api_budget:gemini` = $15/day, $80/month, hardStop. `vehicle_pictures:settings` = AI on, model `gemini-3.1-flash-image`, daily max 50, retention 30, attempts 3. No `part_pictures:settings` row yet (expected). |
| Live saved-page uploads | 3 rows: 2 `stopped` / `ai_failed`, 1 `done` (136 lines, 8 saved, 1 held, 23 not a Roam part type) — all the shock page, none the air-cleaner page. |

Files read in full: [research_saved_page_routes.ts](../../supabase/functions/_fleet-server/research_saved_page_routes.ts), [saved_page_text.ts](../../supabase/functions/_fleet-server/saved_page_text.ts), [vehicle_picture_worker.ts](../../supabase/functions/_fleet-server/vehicle_picture_worker.ts), [vehicle_picture_imagen.ts](../../supabase/functions/_fleet-server/vehicle_picture_imagen.ts), [vehicle_picture_admin_routes.ts](../../supabase/functions/_fleet-server/vehicle_picture_admin_routes.ts), [vehicle_picture_db.ts](../../supabase/functions/_fleet-server/vehicle_picture_db.ts), [purposes.ts](../../supabase/functions/_shared/objectStorage/purposes.ts), [fleet_parts_lookup.ts](../../supabase/functions/_fleet-server/fleet_parts_lookup.ts), [fleet_find_parts_routes.ts](../../supabase/functions/_fleet-server/fleet_find_parts_routes.ts), [SavedPageOverlay.tsx](../../apps/admin/src/components/admin/research-engine/SavedPageOverlay.tsx), [ResearchJobDrawer.tsx](../../apps/admin/src/components/admin/research-engine/ResearchJobDrawer.tsx), [StitchAnswerCard.tsx](../../apps/fleet/src/components/vehicles/find-parts/everyday/StitchAnswerCard.tsx), [EverydayFindPartsFlow.tsx](../../apps/fleet/src/components/vehicles/find-parts/everyday/EverydayFindPartsFlow.tsx), [api_pricing.ts](../../supabase/functions/_fleet-server/api_pricing.ts), [adminNavConfig.ts](../../apps/admin/src/components/admin/adminNavConfig.ts), [VehiclesHomePage.tsx](../../apps/admin/src/components/parts-database/VehiclesHomePage.tsx), the vehicle-pictures migration, and the live functions and tables above.

---

## Findings

### PR1-01 The sample page queues no picture at all — High
**Where:** [§3.1 step 2](../part-pictures-audit.md#L73) ("each row in the **saved** group"), [PP-08](../part-pictures-audit.md#L161), done-test 1 ([§6](../part-pictures-audit.md#L176)), and the live save path in [research_saved_page_routes.ts:609-625](../../supabase/functions/_fleet-server/research_saved_page_routes.ts#L609-L625).

**Problem:** a row is only queued for a picture when it ends up in the `saved` group. But `17801-21060`, the part on the owner's own sample page, is **already a Confirmed listing** on the Roomy — I queried it. So the upload will report it as **Already on file**, `counts.saved` stays 0, and **no picture is queued**. Done-test 1 cannot pass.

**Why it matters:** 485 listings and 47 numbers are already Confirmed live. Every page the owner re-reads will say "Already on file" for most of its numbers, so the feature produces almost no pictures — and the 8 parts saved from the shock page on 25–26 Nov can never get one. PP-08's fix ("no picture until a single-file page with that number is read") is impossible, because reading that page is exactly what marks the part `already`.

**Fix:** queue a picture for **every proven row whose part type is an active Roam part type**, whether it ended `saved` or `already on file`. A picture belongs to the part, not to the car. The upload result's counts become `queued`, `alreadyHave`, `noDiagram`.

---

### PR1-02 Remake can never work — the diagram is deleted first — High
**Where:** [D3](../part-pictures-audit.md#L49-L51) ("Deleted as soon as its picture is `ready` or `failed`"), [§3.4](../part-pictures-audit.md#L116) ("Remake needs a diagram on file"), [S2](../part-pictures-audit.md#L134) (Remake on ready), [S3](../part-pictures-audit.md#L139) ("Remake pictures made with an older version"), [PP-04](../part-pictures-audit.md#L157), [PP-14](../part-pictures-audit.md#L167).

**Problem:** every picture that is `ready` has already had its diagram deleted. So **every** Remake press — single or bulk — finds no diagram and answers "Upload the page again as a single file". The owner's main safety net for a wrong picture (PP-09) is a button that can only ever fail.

**Why it matters:** the plan sells Remake as the answer to "AI can get a shape wrong". Both screens offer it prominently. As written it is dead on arrival, and the only way back is the upload — which, per PR1-01, queues nothing.

**Fix:** keep the diagram for the same 30 days as the old picture versions, and delete it in the same cleanup pass. Remake works for those 30 days; after that the screens say "Upload the page again as a single file". Update PP-04 and PP-15 to 30 days.

---

### PR1-03 The diagram cannot be taken out of a `.mhtml` with today's parser — High
**Where:** [saved_page_text.ts:520-539](../../supabase/functions/_fleet-server/saved_page_text.ts#L520-L539) (the whole file is decoded as UTF-8 text and only the `text/html` part is used), [mimeParts:499-517](../../supabase/functions/_fleet-server/saved_page_text.ts#L499-L517), [§3.1 step 1](../part-pictures-audit.md#L72), [PP-03](../part-pictures-audit.md#L156).

**Problem:** `mhtmlToSavedPage` does `new TextDecoder("utf-8").decode(bytes)` on the **entire** file, splits that string, and returns only the HTML part. There is no path in the code that ever hands back an image. Chrome's MHTML writer puts each resource in its own part with a `Content-ID`, and the saved HTML refers to them by `cid:`; the bytes are base64 or raw binary depending on the writer's encoding policy ([Blink's MHTML writer, `GenerateMHTMLPart`](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/third_party/blink/renderer/platform/mhtml/mhtml_archive.cc)). Where the part is binary, decoding the whole file as UTF-8 replaces invalid bytes with `�` and the image is gone for good. The parser also keeps no `Content-ID` and no `<map>`, so nothing links an `<img usemap>` to its part. PP-03's rule ("pictures wired to clickable labels first") needs a three-way join the code never performs.

**Why it matters:** the whole feature depends on getting one good PNG out of a file the parser currently throws away. The plan treats this as a one-line step. Built as written, `noDiagram` is always the answer.

**Fix:** add a byte-level MIME walker beside the existing parser that keeps every part's raw bytes and `Content-ID`, and maps `<img usemap>` → `<map name>` → part; unit-test it with a real Chrome "Webpage, Single File" page, not a hand-made one like [research_saved_page_routes.test.ts:113](../../supabase/functions/_fleet-server/research_saved_page_routes.test.ts#L113).

---

### PR1-04 There is no single-file sample, and PP-13 claims a proof that has not happened — High
**Where:** [§0](../part-pictures-audit.md#L14) (the sample is the `.html` + `_files` folder), [PP-13](../part-pictures-audit.md#L166) ("Proven in the private-copy run"), [§7 item 4](../part-pictures-audit.md#L193), done-test 1.

**Problem:** PP-13 states as fact that sending the diagram as an image input to `gemini-3.1-flash-image` is **proven**. It is not. The only image call in the repo is text-in only ([vehicle_picture_imagen.ts:84-90](../../supabase/functions/_fleet-server/vehicle_picture_imagen.ts#L84-L90)), and no `.mhtml` of the owner's page exists to try it with. The plan's only proving run is build-order step 4 — after the data, server and all four screens are built.

**Why it matters:** if the model will not take an image, or will not return a square picture, the prompt, the input shape and the screens are all built on a guess. Finding that out after the screens are built is the most expensive possible time.

**Fix:** the owner saves the air-cleaner page as **Webpage, Single File** now, and one scripted probe (that file → diagram → one real Gemini call → save the result) becomes a **gate** after the data step and before any screen work. PP-13 says "to be proven by that probe", not "Proven".

---

### PR1-05 15 MB is more than the job needs, and the 5 MB number lives in three places — Medium
**Where:** [PP-02](../part-pictures-audit.md#L155), [research_saved_page_routes.ts:44](../../supabase/functions/_fleet-server/research_saved_page_routes.ts#L44), [SavedPageOverlay.tsx:17](../../apps/admin/src/components/admin/research-engine/SavedPageOverlay.tsx#L17) and [:100](../../apps/admin/src/components/admin/research-engine/SavedPageOverlay.tsx#L100).

**Problem:** the real single-file page is about 4.9 MB (3.66 MB of CSS/JS plus the 20 KB diagram, base64-inflated) — I measured the `_files` folder. 15 MB is arbitrary. Edge functions get 256 MB of memory and **2 s of CPU** ([Supabase limits](https://supabase.com/docs/guides/functions/limits)); the parser decodes the whole file to a JS string and then lowercases it ([:252](../../supabase/functions/_fleet-server/saved_page_text.ts#L252)), so a 15 MB upload holds ~45–60 MB of strings before any image work. The app also refuses files over 5 MB before they reach the server.

**Why it matters:** tripling the cap buys nothing and moves a working upload closer to an out-of-memory or CPU-limit failure that shows as a bare 504.

**Fix:** raise the limit to **8 MB** in all three places — server `MAX_FILE_BYTES`, the overlay's `MAX_BYTES`, and the stop card's "Saved pages up to 8 MB can be read." line.

---

### PR1-06 The Data section has no SQL functions, so the worker cannot be a copy — Medium
**Where:** [§2 D1–D7](../part-pictures-audit.md#L35-L65), [§3.2](../part-pictures-audit.md#L77-L81); compare [vehicle_picture_db.ts:322-427](../../supabase/functions/_fleet-server/vehicle_picture_db.ts#L322-L427).

**Problem:** D1–D7 are tables, one settings row and one purposes row. The worker the plan says to copy needs seven functions that do not exist for parts: worker lease acquire/release, atomic claim, increment attempts, "becomes ready" (insert version + retire old + set ready in one transaction), sweep stuck, requeue giving back an attempt, and cleanup candidates. The car audit's own lesson (line 120) is that becomes-ready must be **one** function that every path uses.

**Why it matters:** done as plain table updates, two worker runs can claim the same row and pay for the same Gemini call twice; and a crash between "insert version" and "set ready" leaves a version with no parent.

**Fix:** add a "D1a. Functions" list to §2 that mirrors the car system's seven, add each to `part_pictures_checks.sql`, and put that file in the CI replay loop (`.github/workflows/verify-migrations-replay.yml`), as the saved-page audit did.

---

### PR1-07 The cron path is unnamed, and a bare pg_cron call gets a 401 — Medium
**Where:** [§3.2](../part-pictures-audit.md#L78) ("Runs every 2 minutes from `pg_cron`"), [vehicle_pictures migration:402-421](../../supabase/migrations/20261116175911_vehicle_pictures.sql#L402-L421), [:198-206](../../supabase/migrations/20261116175911_vehicle_pictures.sql#L198-L206), [cron relay fix](../../supabase/migrations/20261117050423_vehicle_picture_cron_relay.sql#L1-L5).

**Problem:** the house pattern is `pg_cron` → `private.invoke_*()` → `net.http_post` to the function route with `X-Fleet-Cron-Secret`. The car system needed a dedicated `fleet-picture-cron` function with `verify_jwt = false` because "on production every call was refused with 401". The plan says only "runs every 2 minutes from pg_cron".

**Why it matters:** built literally, the job 401s every two minutes and no picture is ever made — the exact failure the car system already had and fixed.

**Fix:** name the path in §3.2 (cron → `private.invoke_part_picture_worker()` → `net.http_post` to the platform-catalog worker route guarded by `X-Fleet-Cron-Secret`, with a `verify_jwt = false` relay if the platform-catalog function requires a JWT), and list it as its own migration the owner pastes.

---

### PR1-08 The picture is not a `.webp` — Medium
**Where:** [§3.2](../part-pictures-audit.md#L80) ("`catalogue/parts/<id>/v<n>.webp`"), [vehicle_picture_imagen.ts:103-113](../../supabase/functions/_fleet-server/vehicle_picture_imagen.ts#L103-L113), live `vehicle_picture.r2_key`.

**Problem:** the image model returns PNG or JPEG; the code detects which and stores that. There is no WebP encoder in the edge runtime, and the car worker stores `.jpg` in practice — all three live keys end `.jpg`. §3.2 promises a format nothing in the stack can produce.

**Why it matters:** a builder following the plan either ships unconverted JPEG bytes under a `.webp` name (broken `Content-Type`, broken Cloudflare resize) or adds a dependency nobody approved.

**Fix:** store `v<n>.<ext>` from the bytes the model returns, exactly as [vehicle_picture_worker.ts:196-198](../../supabase/functions/_fleet-server/vehicle_picture_worker.ts#L196-L198) does.

---

### PR1-09 The two new storage purposes are never used and contradict the key in §3.2 — Medium
**Where:** [D6](../part-pictures-audit.md#L60-L62), [§3.2](../part-pictures-audit.md#L80), [purposes.ts:29-33](../../supabase/functions/_shared/objectStorage/purposes.ts#L29-L33) and [:78-80](../../supabase/functions/_shared/objectStorage/purposes.ts#L78-L80).

**Problem:** a purpose's key is always `<folder>/<scopeId>/<uuid>.<ext>`, so `part-pictures` would be `catalogue/parts/platform/<uuid>`, while §3.2 writes `catalogue/parts/<id>/v<n>`. They cannot both be right. And nothing would call either purpose: purposes exist for the app-facing presign → finish upload flow, while both of these files are written by the server, like the car pictures ([vehicle_picture_worker.ts:197](../../supabase/functions/_fleet-server/vehicle_picture_worker.ts#L197)).

**Why it matters:** a purpose that no route uses is dead configuration that the next reader will mistake for a live rule, and the two keys in the plan disagree about where every picture lives.

**Fix:** drop D6. Write the two literal layouts the server uses — public `catalogue/parts/<pictureId>/v<n>.<ext>`, private `part-diagrams/<pictureId>/<uuid>.<ext>` — and add both folders to the folder table in [the storage audit](../cloudflare-r2-storage-migration-audit.md).

---

### PR1-10 The picture should be one per physical part, not per maker + number — Medium
**Where:** [D1](../part-pictures-audit.md#L38-40) (`maker_norm, number_norm` unique), [PP-06](../part-pictures-audit.md#L159), [D4](../part-pictures-audit.md#L54) (a second column also called `group_id`).

**Problem:** the database's unit for "one physical part" is `part_interchange_group`, and the live data shows why. `04465-B1190` has **two** `part_master` rows — Toyota and Daihatsu — in **one** interchange group. Under the plan they get two pictures of the same pad, and the Daihatsu row in Fleet shows none of them. Meanwhile the frame/date split (48510-B9285 vs B9115) is two groups, so the identical shock gets two different pictures. Separately, D1 and D4 both call a column `group_id` but mean two different things (the Brakes/Engine catalogue group, and the part's group).

**Why it matters:** the Fleet answer is a **group** card — one name, one primary number, "other compatible parts". A number-keyed picture cannot fill it, and it makes the same part look different on different rows.

**Fix:** key `part_picture` on `interchange_group_id` (keep maker and number as display columns), and rename D4's column to `catalog_group_id` so the two "group" words stop colliding.

---

### PR1-11 §3.5 returns a bare URL; the house pattern is a card/detail address with a permanent cache — Medium
**Where:** [§3.5](../part-pictures-audit.md#L119), [vehicle_picture_admin_routes.ts:136-139](../../supabase/functions/_fleet-server/vehicle_picture_admin_routes.ts#L136-L139), [vehicle_picture_worker.ts:198](../../supabase/functions/_fleet-server/vehicle_picture_worker.ts#L198).

**Problem:** the plan says "adds `pictureUrl`" and nothing more. The car code returns `pictureUrlFromKey(key, "card" | "detail")` built from `publicMediaUrl` + `vehiclePictureSrc`, and writes the object with `public, max-age=31536000, immutable`. Without that, S2/S3/F1 load a full-size image in a 200 px box and Cloudflare may serve a stale one.

**Why it matters:** a grid of 24 cards would download 24 full-size files instead of 24 small ones, and a remade picture would keep showing the old version from the Cloudflare cache.

**Fix:** §3.5 and §3.4 return `picture: { status, url, urlDetail }` through the same two helpers, and the worker writes with the immutable cache header.

---

### PR1-12 S1 shows a count but not which part, so the owner cannot fix a bad picture from the upload — Medium
**Where:** [S1](../part-pictures-audit.md#L126-L130), [SavedPageOverlay.tsx:585-680](../../apps/admin/src/components/admin/research-engine/SavedPageOverlay.tsx#L585-L680).

**Problem:** S1 adds one line — "Pictures: 1 being made · 2 already have one" — to a result screen that already lists each part with its number and dates. The owner sees that pictures exist but not which picture belongs to which part, and has no Remake or Hide there.

**Why it matters:** the upload result is exactly where the owner looks right after saving. A wrong picture is discovered in that list; sending them to a separate page to fix it is the step they will skip.

**Fix:** put the picture state on each S1 result row (small thumbnail + one word: Making / Made / Failed / No diagram) and add one secondary button, **See pictures**, that opens S3 filtered to this upload.

---

### PR1-13 S2 and S3 have no "waiting" state for a stalled queue — Medium
**Where:** [S2 states](../part-pictures-audit.md#L133), [S3](../part-pictures-audit.md#L136-L140), [VehiclePicturesPage.tsx:894-909](../../apps/admin/src/components/admin/vehicle-catalog/vehicle-pictures/VehiclePicturesPage.tsx#L894-L909).

**Problem:** S2 lists being made / ready / failed / hidden / none. Nothing covers a `queued` row that cannot move: switch off, Gemini budget blocked, or key rejected. The car page has four banners for exactly these — key rejected, paused, AI off, 80% of budget.

**Why it matters:** a queued row that never moves will show "Making the picture" forever, with no explanation and no way for the owner to know it is a switch or the budget, not a bug.

**Fix:** add one `waiting` state to S2 and S3 ("Waiting — AI pictures are off" / "Waiting — today's budget is used up" / "Waiting — the picture service refused the key"), driven by the same settings and pause fields the car page reads, and put the same banners at the top of S3.

---

### PR1-14 S3 is missing loading, error, paging, and who may press what — Medium
**Where:** [S3](../part-pictures-audit.md#L136-L140), [VehiclePicturesPage.tsx:879-1010](../../apps/admin/src/components/admin/vehicle-catalog/vehicle-pictures/VehiclePicturesPage.tsx#L879-L1010), [vehicle_picture_admin_routes.ts:170-176](../../supabase/functions/_fleet-server/vehicle_picture_admin_routes.ts#L170-L176).

**Problem:** S3 lists a top bar, two tabs, cards, filters, an empty state and buttons. It has **no** loading state, **no** error state, **no** page size (the car page shows 24 a page; with 50 pictures a day this list reaches thousands in a month), and it does not say which actions are owner-only. Live, the switch, the template save and the bulk remake are owner-only writes on the car page (`ownerDenied`); per-picture Remake/Hide are staff writes.

**Why it matters:** the first slow load shows a blank grid, the first failed request shows nothing at all, and a staff member could turn the feature off for everyone.

**Fix:** add to S3: two grey placeholder rows while loading; one plain error line with a Try again button; 24 cards a page with Older/Newer; and this split — switch, template Save, and "Remake pictures made with an older version" are owner-only (hidden or disabled with a reason for staff), Remake/Hide/Show on one picture are staff.

---

### PR1-15 S3's home is unstated, and there are two Vehicles homes — Medium
**Where:** [S3](../part-pictures-audit.md#L136) ("under Vehicles, next to Vehicle pictures"), [adminNavConfig.ts:92-100](../../apps/admin/src/components/admin/adminNavConfig.ts#L92-L100), [:283](../../apps/admin/src/components/admin/adminNavConfig.ts#L283), [VehiclesHomePage.tsx:30-39](../../apps/admin/src/components/parts-database/VehiclesHomePage.tsx#L30-L39), [AdminPortal.tsx:306](../../apps/admin/src/components/admin/AdminPortal.tsx#L306).

**Problem:** "Vehicle pictures" appears in three places — the sidebar's Vehicles children, the Vehicles home tiles, and the `AdminPortal` page switch (plus the `activeWhen` list). The plan names none of them.

**Why it matters:** built into one place only, the page is reachable from one route and missing from the other, and the sidebar highlights the wrong item.

**Fix:** name the page id `part-pictures` and list the four edits in S3: the child in `VEHICLE_DATABASE_CHILDREN`, the tile in `VehiclesHomePage`, the branch in `AdminPortal`, and the entry in the `activeWhen` list.

---

### PR1-16 The bulk remake has no money line — Medium
**Where:** [S3 templates tab](../part-pictures-audit.md#L139), [PP-11](../part-pictures-audit.md#L164), [VehiclePicturesPage.tsx:287-293](../../apps/admin/src/components/admin/vehicle-catalog/vehicle-pictures/VehiclePicturesPage.tsx#L287-L293), [:931](../../apps/admin/src/components/admin/vehicle-catalog/vehicle-pictures/VehiclePicturesPage.tsx#L931).

**Problem:** "Remake pictures made with an older version (shows how many)" is one click that re-queues every picture made with an older template, at $0.04 each, against a daily max of 50. It shows a count, not a cost, and not how long it will take. The car page shows the count, the money left, and how many will go this month.

**Why it matters:** a template edit on a large catalogue is a spend decision. With 50 a day, re-queuing 1,000 pictures takes 20 days; the owner should learn that before pressing, not from the queue.

**Fix:** S3 shows "N pictures · about US$X · about D days at 50 a day", the same sentence the car page uses, and the button opens an in-app confirmation with that line and a Cancel.

---

### PR1-17 Two §1 facts are wrong — Low
**Where:** [§1 groups row](../part-pictures-audit.md#L28), [§2 D1](../part-pictures-audit.md#L38).

**Problem:** "(The 13 'no group' rows are the groups themselves.)" — live has **18** `kind='system'` rows: the 13 part groups, plus Shop fees, Vehicle OE numbers, Part cross-references, Shared platform links and Car specs. And `part_master`'s maker column is `manufacturer` (what the Fleet lookup calls `brand`); the plan says "maker" throughout without naming it.

**Why it matters:** a builder filtering "top-level rows" gets 18 and the group list comes out wrong; and the picture key's first half has no defined column.

**Fix:** correct both sentences, and in D1 write `manufacturer` (normalised) for the maker half of the key.

---

### PR1-18 The checks and the read routes do not follow the house rules — Low
**Where:** [D7](../part-pictures-audit.md#L64-L65), [§3.4](../part-pictures-audit.md#L112-L116), [PP-07](../part-pictures-audit.md#L160).

**Problem:** D7 checks RLS, the unique key, a ready-with-a-file rule and stale diagrams. It does not check: that the admin routes use explicit column lists (the house rule the saved-page routes follow — see [research_saved_page_routes.ts:977-979](../../supabase/functions/_fleet-server/research_saved_page_routes.ts#L977-L979)); that `part_master.image_url` and `photo_verified` stay untouched (PP-07 has no test at all); or that adding `pictures` to `research_saved_page.result` does not break the three existing rows that have no such key.

**Why it matters:** the explicit-column rule exists because a `select *` on a server-only table leaks whatever is added later; and PP-07's whole promise is "leave both columns alone", which nothing proves.

**Fix:** add three checks to D7 — no `select("*")` on `part_picture*` from any route, `image_url`/`photo_verified` still 0 after a picture is made, and an old `result` without `pictures` still renders.

---

### PR1-19 A failed picture step must never fail the upload — Medium
**Where:** [§3.1](../part-pictures-audit.md#L71-L75), [vehicle_picture_admin_routes.ts:203-208](../../supabase/functions/_fleet-server/vehicle_picture_admin_routes.ts#L203-L208).

**Problem:** the plan puts the queue and the diagram upload inside the saved-page upload, after the parts are saved, but never says what happens when R2 is down, unconfigured (local tests), or the insert fails. The car admin routes wrap R2 setup in `try/catch` and carry on with `r2 = null`; the saved-page route has no such guard.

**Why it matters:** the parts are already saved when the picture step runs. If a picture-side error throws, the owner gets "The page couldn't be read" and believes nothing saved — while the listings are in the database.

**Fix:** the picture step is best-effort: catch every error, log it, and return the upload as done with `pictures.queued` = 0 and a plain note the S1 line shows ("Pictures couldn't be queued — try again in a minute").

---

### PR1-20 `label` has no source — Low
**Where:** [D1](../part-pictures-audit.md#L40), [§3.3](../part-pictures-audit.md#L86), [PP-16](../part-pictures-audit.md#L169).

**Problem:** D1 stores `label` — "the diagram's callout, e.g. 17801" — and §3.3's prompt starts "Find the part labelled {label}". Nothing in §3.1 says where the number comes from. On the real page it is in the group row: `17801 - ELEMENT SUB-ASSY, AIR CLEANER FILTER`, and the diagram prints the same `17801`.

**Why it matters:** a builder has to guess, and a guessed label makes the prompt point at nothing — the exact failure PP-16 is meant to prevent.

**Fix:** take the label from the proven row's group line, the leading token before " - " when it is 3–5 digits and letters; if there is no such token, store null and use §3.3's second line ("Find the part named {part name}").

---

### PR1-21 Buttons are listed but their style is not — Low
**Where:** [S2](../part-pictures-audit.md#L134), [S3](../part-pictures-audit.md#L138-L139).

**Problem:** S2 and S3 name buttons (Remake, Hide from Fleet, Show in Fleet, Save, Remake pictures made with an older version) but say nothing about how they look. The saved-page audit already had to fix this (its SP-31): secondary buttons had no border and Cancel was a fill.

**Why it matters:** the Stitch prompt is written next from this plan, and "buttons that do not look like buttons" was a real finding two screens ago.

**Fix:** state the house rule in S3: primary = dark fill; secondary = white with a #c5c6d0 border; destructive = white with a red border and red text; every action a real `<button>`, at least 44 px; no outside-link icons; confirmations are in-app dialogs.

---

## What each screen must show (round 1, settled)

This is what I would sign off, with the finding that adds each item in brackets. Numbers in the counts below come from the live upload result shape.

### S1 — Saved-page result ([SavedPageOverlay.tsx](../../apps/admin/src/components/admin/research-engine/SavedPageOverlay.tsx), result step)

| Item | Must show |
|---|---|
| Counts line | The four existing pills, unchanged. Under them, one line: **"Pictures: 1 being made · 2 already have one · 3 with no diagram"** — only the non-zero parts. [PR1-01] |
| Each result row | Part-type icon, name · place, number, dates (as today) **plus** a 40 px picture thumbnail and one word: Making / Made / Failed / No diagram. [PR1-12] |
| Row with `already on file` | Same picture state — because a picture now queues for it too. [PR1-01] |
| Button | **Pictures** (secondary), opens S3 filtered to this upload. [PR1-12] |
| `.html` upload | One notice under the counts: "Pictures need the diagram. Next time, save the page in Chrome as **Webpage, Single File** and upload that." No button. [PP-01] |
| AI pictures off | No pictures line and no Pictures button. |
| Queue step failed | The pictures line is replaced by "Pictures couldn't be queued — try again in a minute." Parts stay saved. [PR1-19] |
| Loading / error | Unchanged from today (the overlay already has both). |

### S2 — Part card in the research job panel ([RoamFoundCard](../../apps/admin/src/components/admin/research-engine/ResearchJobDrawer.tsx#L404))

| Item | Must show |
|---|---|
| Picture box | One square box above the number, 96 px, 8 px grid. |
| `none` | Outline icon + "No picture yet". |
| `queued` | Soft pulse + "Making the picture". |
| `waiting` | Pause icon + the reason in five words or fewer: "AI pictures are off" / "Today's budget is used up" / "The picture service refused the key". [PR1-13] |
| `ready` | The picture + "Made by AI from the maker's diagram · 26 Nov". |
| `failed` | Outline icon + the server's plain reason. |
| `hidden` | The picture greyed + "Hidden from Roam Fleet". |
| `no diagram` | Outline icon + "Upload the page again as a single file to remake this". |
| Buttons | **Remake** (ready, failed, no diagram — disabled with the reason when there is no diagram); **Hide from Fleet** (ready); **Show in Fleet** (hidden). All secondary or destructive per the house rule. [PR1-21] |
| Picture tap | In-app overlay, full picture, Close. No browser pop-up. |
| Not shown | Any fleet name, plate, count or "used by". |

### S3 — Part pictures page (new, page id `part-pictures`)

| Item | Must show |
|---|---|
| Home | A child of Vehicles in the sidebar, a tile on the Vehicles home, a branch in `AdminPortal`. [PR1-15] |
| Top bar | **AI part pictures** switch; "Made today: 3 of 50"; "This month: US$0.12 of part pictures · US$14.80 of the US$80 Gemini budget". [PR1-11 note: the cap is shared, so both numbers] |
| Banners | The car page's four, same words: key rejected, paused with reason and time, AI off, 80% of budget. [PR1-13] |
| Counts | Ready / Being made / Waiting / Failed / Hidden, each a filter. [PR1-13] |
| Tab Pictures | Cards at 24 a page: picture, number, name, catalogue group, state word, made date; Remake / Hide / Show. [PR1-14] |
| Loading | Two grey placeholder rows. [PR1-14] |
| Error | One plain line + **Try again**. [PR1-14] |
| Empty | "No part pictures yet. Upload a saved page as a single file to make the first ones." |
| Tab Templates | One card per catalogue group: materials box, **On/Off** switch, version and "last edited by … on …", **Save**, **Remake pictures made with an older version**. |
| Bulk remake | Shows "N pictures · about US$X · about D days at 50 a day", then an in-app confirmation with Cancel. [PR1-16] |
| Owner-only | Switch, template Save, bulk remake. Staff still see the page. [PR1-14] |
| Not shown | Any fleet name, plate, driver, vehicle count or "used by". |

### F1 — Find parts answer ([EverydayFindPartsFlow.tsx](../../apps/fleet/src/components/vehicles/find-parts/everyday/EverydayFindPartsFlow.tsx), [StitchAnswerCard.tsx](../../apps/fleet/src/components/vehicles/find-parts/everyday/StitchAnswerCard.tsx))

| Item | Must show |
|---|---|
| Where | The answer's existing picture tile, in **all four answer layouts** (pads, calipers, cables, shoes) — today only the pads card has a tile, and it always draws a brake pad whatever the part is. [PR1-22 below] |
| With a picture | The real picture fills the tile, tap → in-app overlay with Close. |
| Caption | Under the picture: "Picture made by AI from the maker's diagram — the real part may look different." |
| No picture | The existing drawn art stays (never an empty box), and no caption. |
| Other numbers | No picture on the "Other compatible parts" rows — one picture per answer. [PR1-10] |
| Not shown | Prices, suppliers, stock, quotes, carts — unchanged. |

**PR1-22 (Medium) — F1 covers one of the four answer layouts.**
**Where:** [S1/F1](../part-pictures-audit.md#L143-L146), [StitchAnswerCard.tsx:229-231](../../apps/fleet/src/components/vehicles/find-parts/everyday/StitchAnswerCard.tsx#L229-L231), [EverydayFindPartsFlow.tsx:767-781](../../apps/fleet/src/components/vehicles/find-parts/everyday/EverydayFindPartsFlow.tsx#L767-L781) and [:1043-1046](../../apps/fleet/src/components/vehicles/find-parts/everyday/EverydayFindPartsFlow.tsx#L1043-L1046).
**Problem:** F1 says "a picture next to the number", but only the pads card has a picture tile — and that tile hard-codes a brake-pad drawing for every part. The calipers, cables and shoes answers have no picture slot, and no other part type has an answer screen at all yet.
**Why it matters:** the goal is that anyone looking up a part in Find parts can see what it looks like. As written, only front brake pads get a picture.
**Fix:** add one shared `PartPictureTile` (status word, picture or drawn fallback, tap-to-open overlay) to all four answer layouts, and say in F1 that it is the only place a part picture appears.

---

## Existing findings: Agree / Change / Wrong

| # | Verdict | Say what / why |
|---|---|---|
| PP-01 | **Agree** | Right call. It also needs PR1-04's single-file sample, and the notice must not imply `.html` uploads are broken. |
| PP-02 | **Change** | 8 MB, not 15, and the number lives in three places (server, overlay, stop-card text). [PR1-05] |
| PP-03 | **Change** | The rule is right but unreachable today (PR1-03), and "at most 3" caps by size where it should cap by relevance: take the diagram(s) whose image map names this part, then the largest at least 300 px each way. |
| PP-04 | **Wrong** | Deleting the diagram on `ready` makes every Remake fail before it starts. Keep it 30 days. [PR1-02] |
| PP-05 | **Agree** | The prompt already forbids words, numbers, logos and brands; the screen shows the number and name. |
| PP-06 | **Change** | Key on the interchange group, not maker + number: live has one group holding both a Toyota and a Daihatsu row for the same pad. [PR1-10] |
| PP-07 | **Agree** | Leaving `image_url` and `photo_verified` alone is right; add the test. [PR1-18] |
| PP-08 | **Wrong** | Its fix cannot be reached: reading the page marks the part "already on file", which queues nothing. [PR1-01] |
| PP-09 | **Agree** | Show at once, caption it, one-click Hide and Remake — once Remake works (PR1-02). |
| PP-10 | **Agree** | Fluids (3 active parts) and Tires & wheels (2) start off. Matches live. |
| PP-11 | **Agree** | 50 a day, off by default, shared $15/day and $80/month cap. The S3 money line must say what it counts. |
| PP-12 | **Agree** | Queue only during the upload; the worker draws. Correct, and the 150 s limit is real. |
| PP-13 | **Wrong** | It says "Proven" for something that has never been run, and the only proving run is after the screens. [PR1-04] |
| PP-14 | **Agree** | Right rule — it only works once the diagram is kept (PR1-02). |
| PP-15 | **Change** | "Deleted after use" contradicts a working Remake. Say: sent only to Gemini, never shown, kept 30 days in the private bucket, deleted with the old version. [PR1-02] |
| PP-16 | **Agree** | Use the label when the page has one; the real page does. It needs a defined source. [PR1-20] |
| PP-17 | **Agree** | Right rule; add the text-scan test the vehicle pictures page has. [Done-tests, below] |

No PP-xx contains "options", "decide later" or "owner to approve" — that check passes, except PP-13's proof claim, marked Wrong above.

---

## Done-tests: what is missing

The ten tests are the right kind — plain words, real uploads. These gaps mean a fix could ship unproven:

1. **Test 1 is false today.** It says the filter "is saved"; live it is already on file. Reword to: the upload says **Already on file** and, within 5 minutes, the picture appears. [PR1-01]
2. **No test for the size change:** a 6–8 MB single-file page is accepted, and the app does not refuse it first. [PR1-05]
3. **No test for the diagram reader:** a real Chrome single-file page yields the diagram and the map's rectangles; a `.mhtml` with no images yields `noDiagram`. [PR1-03]
4. **No test for a single Remake** (test 5 only covers the bulk button), and none for Remake after 30 days, which must give the "upload the page again" message. [PR1-02]
5. **No test for PP-07:** `part_master.image_url` and `photo_verified` are still empty after a picture is made. [PR1-18]
6. **No test for PP-17:** a word scan of S2 and S3 finds no fleet name, plate, count or "used by" — the same test the vehicle pictures page has. [PR1-18]
7. **No test for the stalled queue:** switch off / budget blocked / key rejected shows `waiting` with the right reason on S2 and S3. [PR1-13]
8. **No test for two maker rows in one group:** the Daihatsu pad shows the Toyota picture. [PR1-10]
9. **No test for the upload surviving a picture failure:** with R2 unset, the parts still save and S1 says pictures were not queued. [PR1-19]
10. **No test for a page with no diagram** (`noDiagram` in the counts) and **none for a page with no callout label** (the prompt falls back to the part name). [PR1-20]
11. **No test that a hidden picture is gone from Find parts** and comes back on Show — test 4 covers the change but not the Find parts side.
12. **No Playwright test that clicks every new button** (Pictures, Remake, Hide, Show, Save, bulk remake + its confirmation, both tabs, the overlay Close), as the saved-page audit's test 18 does.

Also: §7's build order should put the real-file probe (PR1-04) before screens, and add the owner's steps — paste the data + functions + cron SQL, set the settings row, deploy **both** `platform-catalog` and `fleet-core`, then switch on.

---

## Problems the plan misses entirely

These have no PP number at all; each is covered by a finding above.

- Nothing ever queues a picture for a part that is already on file — the whole live catalogue. [PR1-01]
- The diagram has to survive long enough to be used twice. [PR1-02]
- Nobody named the SQL the worker needs, or how cron invokes it. [PR1-06, PR1-07]
- Nobody said what the picture key actually is in the database. [PR1-10]
- Nobody said which of the four Find parts answer layouts gets the picture. [PR1-22]
- Nobody said who may flip the switch. [PR1-14]
- Nobody said the upload must survive a picture-side failure. [PR1-19]

---

## Checked and fine

- **§1's numbers are right:** 64 rows / 63 numbers, `image_url` and `photo_verified` at 0, 13 groups by name, 3 car pictures all `ready`, $0.0400 each, model `gemini-3.1-flash-image`, `api_budget:gemini` $15/day $80/month hardStop, `catalogue-images` purpose at 5 MB.
- **The diagram prints its callouts**, so §3.3's "find the part labelled {label}" is the right instruction — and the owner's sample page's group line carries the same `17801` as the drawing.
- **The parser is fast and correct on the sample today:** 90 lines in 3 ms, right title, right link (with the query string that R3 already strips).
- **The 150-second limit is real and already handled:** the saved-page route runs both AI reads at once with a 100 s timeout ([research_saved_page_routes.ts:214](../../supabase/functions/_fleet-server/research_saved_page_routes.ts#L214)).
- **Quote-only reminders:** the Gemini cap is enforced before every call, so part pictures automatically share it ([api_usage_logger.ts:122-160](../../supabase/functions/_fleet-server/api_usage_logger.ts#L122-L160)); the Fleet lookup already returns the maker (`brand` = `part_master.manufacturer`) and the `groupId`, so PR1-10's key needs no new query.
- **The saved-page routes run with the service client**, so a deny-all table is readable from both functions the plan needs.
- **`hidden` pictures keep a live public URL.** That is acceptable: the URL is not linked, not indexed (`X-Robots-Tag: noindex` is live), and not guessable. No action.
- **No money is at risk from a double press.** Hide/Show are idempotent; only Remake spends, and the queue's unique key stops a second row for the same part.

---

## Needs checking (could not confirm here)

- **The model's image input and square output.** This is the whole of PP-13 and only a real call proves it. That is why PR1-04 makes it a gate.
- **Chrome's exact `.mhtml` for this site** (whether the map survives and the `cid:` form it uses). Downloading one single-file save settles it in minutes.
- **Cloudflare resizing and the no-index rule** — taken from the vehicle-pictures audit as live; I did not re-check Cloudflare.

---

## Fix list for the builder

| # | Where | Fix |
|---|---|---|
| PR1-01 | §3.1, PP-08, done-test 1 | Queue for every proven Roam-type row (saved or already), keyed to the part. |
| PR1-02 | D3, PP-04, PP-15, §3.4 | Keep the diagram 30 days with the versions; delete in the same cleanup. |
| PR1-03 | §3.1, PP-03 | Byte-level MIME reader with Content-ID and map linking; test with a real single-file page. |
| PR1-04 | §0, PP-13, §7 | Owner saves the page as Single File now; one real probe is a gate before screens. |
| PR1-05 | PP-02, server, overlay | 8 MB in three places. |
| PR1-06 | §2 | Add the seven SQL functions and their checks to CI. |
| PR1-07 | §3.2 | Name the pg_cron → invoke → net.http_post path and its migration. |
| PR1-08 | §3.2 | Store the returned extension, not `.webp`. |
| PR1-09 | D6, §3.2 | Drop the two purposes; write the two literal keys. |
| PR1-10 | D1, D4, PP-06 | Key on `interchange_group_id`; rename D4's column. |
| PR1-11 | §3.4, §3.5 | card/detail URLs through the existing helpers; immutable cache. |
| PR1-12 | S1 | Picture state on each result row + a Pictures button. |
| PR1-13 | S2, S3 | Add the `waiting` state and the four banners. |
| PR1-14 | S3 | Loading, error, 24 a page, owner-only split. |
| PR1-15 | S3 | Page id `part-pictures` in all four navigation spots. |
| PR1-16 | S3 | Count, cost and days before a bulk remake, with a confirmation. |
| PR1-17 | §1, D1 | Correct the 18 rows; name `manufacturer`. |
| PR1-18 | D7 | Three more checks. |
| PR1-19 | §3.1 | Best-effort picture step; S1 note on failure. |
| PR1-20 | D1, §3.3 | Define the label source. |
| PR1-21 | S2, S3 | State the house button rule. |
| PR1-22 | F1 | One picture tile in all four answer layouts. |

---

## Review log

- **Round 1 (26 Nov 2026):** 22 findings — 4 High (PR1-01 to PR1-04), 14 Medium, 4 Low (counting PR1-22). Three PPs marked **Wrong** (PP-04, PP-08, PP-13) and five marked **Change** with the change named. Not ready for the Stitch prompt until PR1-01, PR1-02 and PR1-04 are settled, because they change what each screen has to say.
