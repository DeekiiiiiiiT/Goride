# Give Cursor this — Round C4: reset script + pre-production run + real document check

The plan is `docs/vehicle-pictures-and-add-vehicle-audit.md` (Rev 8). Read **§0, §3.5, §8, §10 and §11**. Every earlier round is done:
- server rounds C1–C3d
- Claude's screen rounds UI1–UI3, already compared with Stitch on the test copy

**Don't change any screen file** (`apps/fleet/src/components/vehicles/**`, `apps/admin/src/components/admin/vehicle-catalog/vehicle-pictures/**`). If a screen looks wrong, write it in your report.

**Before you start, the owner has done the §10 setup:**
- created the `roam-scratch` R2 bucket and its own token
- turned on Image Transformations
- added the `X-Robots-Tag` rule
- put the scratch token values and `GEMINI_API_KEY` into `.env.local` themselves (no OpenAI key: the reader moves to Gemini in Part 0)

Never ask for any of these in chat, never print them, never write them into another file in git.

**Settings store:** every vehicle-picture setting named below lives in one KV row: `kv_store_37f42386.key = 'vehicle_pictures:settings'` (a JSON object). It is never in `platform:settings:*`. Missing keys use the defaults in the audit.

**Local stack notes (from Claude's screen check, 16 Nov):**
- `pnpm testcopy` waits for `http://127.0.0.1:54321/rest/v1/`. That times out if the local `anon` role still has `statement_timeout = 3s`. Claude set it to 15s on the local copy only. If it's back at 3s after a `db reset`, run this on the **local** database only, never production:
  ```sql
  alter role anon set statement_timeout = '15s';
  ```
  Then restart the `supabase_rest_Goride` container.
- The test-copy functions get only test secrets (`.testcopy/functions.env`). For this round, serve `fleet-core` yourself with a separate, git-ignored env file built from `.env.local`. Name the keys you used in `preprod-run.md`, never the values.
- `parse-document` is served by **fleet-core** (`/fleet-core/parse-document`). The picture worker and fill routes are also in fleet-core.

## Part 0 — Switch the picture call from Imagen to Gemini image (do this first)
Claude checked the owner's `GEMINI_API_KEY` on 16 Nov: `GET /v1beta/models/imagen-4.0-generate-001` returns **404**. Imagen is no longer offered on this key. The model list does include `gemini-3.1-flash-image`, which is the new picture model.

1. In `supabase/functions/_fleet-server/vehicle_picture_imagen.ts`, change `createProductionImagenCaller` to call:
   - `POST https://generativelanguage.googleapis.com/v1beta/models/<model>:generateContent`
   - send the key in the `x-goog-api-key` header, **not** in the URL
   - body: `contents: [{ parts: [{ text: prompt }] }]`, `generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "4:3" } }`
   - read the picture from the first `candidates[0].content.parts[*].inlineData.data` (base64). Keep it only if the bytes start with the PNG signature. Otherwise throw `Imagen returned no image`, so the worker's existing "content" handling applies.
   - keep the error text shape `Imagen HTTP <status>: …`, so the worker's key/outage sorting and its tests keep working
   - keep the exported names (`ImagenCaller`, `stubImagen*`, `IMAGEN_TIMEOUT_MS`) as they are
2. Change the default `vehicle_picture_model` in `vehicle_pictures_settings.ts` to `gemini-3.1-flash-image`, and in the test harness too.
3. In `api_pricing.ts`, add `"gemini-3.1-flash-image": 0.04` to `GEMINI_IMAGE_PER_IMG`. After the Part 2 run, write the real per-picture cost from Google's billing page in `preprod-run.md`.
4. Add one Deno test with a stubbed `fetch` for the new request and reply: it checks the URL, the header key, the body shape, the PNG read, and the "no image" case. Then run the existing vehicle-picture Deno tests and report pass/fail.
5. **The certificate reader moves to Gemini too (owner, 16 Nov: one key, no OpenAI).** In `vehicle_document_read_runtime.ts`, `callReader` ignores `input.provider` and always calls OpenAI. Make it pick by provider:
   - `gemini`: `POST …/v1beta/models/<model>:generateContent`, key in the `x-goog-api-key` header from `GEMINI_API_KEY`
     - body: `contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType, data: base64 } }] }]`, `generationConfig: { responseMimeType: "application/json" }`
     - parse `candidates[0].content.parts[0].text` as JSON
     - same 45 s abort and `trackedProviderCall` (provider `gemini`, service `vision`)
   - `openai`: keep the current code as is
   - Pass a Gemini key getter into `buildProductionDocumentReadDeps` from where fleet-core builds it.
   - Change the defaults to `reader_provider = "gemini"` and `reader_model = "gemini-3.8-flash"` in `vehicle_pictures_settings.ts`, `vehicle_document_read.ts` (`DEFAULT_READER_*`) and `vehicle_save_rules.ts` (the `|| "openai"` / `|| "gpt-4o"` fallbacks).
   - Add one Deno test with a stubbed `fetch` for the Gemini reader request and reply.
   - The 18-key whitelist and `processReaderRaw` stay exactly as they are. They already drop anything else the reader returns.

## Part 1 — Reset script `scripts/vehicle-pictures-reset.mjs`
- Default mode is `--dry-run`. `--apply` is required to change anything.
- Reads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from the environment.
- **Run it only against the local test copy in this round.**

Steps:
1. List every object in Storage bucket `make-37f42386-vehicles`, plus the certificate files linked from each vehicle's `payload_json` (`fitnessCertificateUrl`, `registrationCertificateUrl`). Turn each signed URL into its bucket path. Download each file to `./.vehicle-pictures-backup/<date>/`, add that folder to `.gitignore`, and print the list.
2. With `--apply`:
   - delete exactly those objects
   - remove `image`, `fitnessCertificateUrl` and `registrationCertificateUrl` from every vehicle's `payload_json`
3. Set `color_standard = mapVehicleColor(color)` on every vehicle where it's null. Print the ones that stay null; Fleet asks their owners to pick a colour.
4. Print any vehicle whose id starts with `UNKNOWN-` (expected: none).
5. Call the fill run once, so matched vehicles that have a colour get their pictures.
6. It only touches rows still in the old shape. A second `--apply` changes nothing and says so.

**Test T22**, on the local test copy, with seeded rows that copy the live shape:
- **Seed data:** 2 vehicles, 4 vehicle PNGs (2 of them unused), and 4 linked certificate files.
- **Dry run:** lists 4 + 4 and changes nothing.
- **Apply:** empties the bucket, cleans `payload_json`, sets White / Grey, and queues 2 pictures.
- **Second apply:** changes nothing.

## Part 2 — Pre-production run (audit §11), on the local test copy
1. Write `docs/vehicle-pictures-build/preprod-run.md` with the exact wiring you used:
   - which `.env.local` keys (names only, never values)
   - `R2_BUCKET_PUBLIC` and `R2_BUCKET_PRIVATE` **both** = `roam-scratch`
   - the local `functions serve` URL that the `private.invoke_*` functions point at
   - the two cron jobs
   - `vehicle_picture_retention_days = 0` and `ai_vehicle_pictures = true` in the settings row
2. Start the local stack: local Supabase plus your own `supabase functions serve fleet-core --env-file <your git-ignored file>`.
3. Insert one test vehicle, a white Toyota Roomy matched to its catalogue row, and let the lookup queue its picture.
4. Check each of these and write the result in `preprod-run.md`:
   - **a.** The cron kick runs the worker and **one real Gemini picture call** (`gemini-3.1-flash-image`) is made. The file lands in `roam-scratch` as `catalogue/images/<id>/v1.png`.
   - **b.** Open the file and compare it with the owner's two reference pictures: white background, facing right, right-hand drive, no reflection. Say what matches and what doesn't. The references are:
     - `C:\Users\deeki\Downloads\fleet vechile adding\stitch_roam_fleet_onboarding_flow\clean_studio_photography_of_a_modern_2019_white_toyota_roomy_compact_hatchback\screen.png`
     - `C:\Users\deeki\Downloads\fleet vechile adding\stitch_roam_fleet_onboarding_flow\clean_studio_automotive_commercial_photography_of_a_modern_2018_metallic_grey\screen.png`
   - **c.** Shorten the lease for the test. Kill the serve process while a row is `generating`. The next run's sweep requeues it.
   - **d.** Do one regenerate: v2 becomes ready, the next run's cleanup deletes v1 (retention 0), and `file_deleted_at` is set.
   - **e.** Upload one test file to `roam-public` at `_test/preprod.png` with the scratch flow's server put. Load `https://media.roamfleet.co/cdn-cgi/image/width=480,format=auto/_test/preprod.png` and check that a WebP comes back. Delete `_test/preprod.png` afterwards.
5. Set `vehicle_picture_retention_days` back to 30 and `ai_vehicle_pictures` back to `false`.

## Part 3 — Real Jamaican document check (audit §3.5), on the local test copy
The owner puts one real Certificate of Fitness and one real Motor Vehicle Registration into **`C:\Roam\Goride\.vehicle-docs-test\`**. Add that folder to `.gitignore` **before** anything else in this part.

These files hold the owner's name, address and TRN:
- never copy them anywhere else
- never print their text
- never commit them
- delete the folder at the end of this part

1. Send each file once through the local `POST /fleet-core/parse-document` with the real `GEMINI_API_KEY` (reader = `gemini-3.8-flash`): `type=fitness_certificate`, then `type=vehicle_registration`. Use the local test fleet owner `mm-f01-fleet@local.test`.
2. Check each reply and write pass/fail per line in `preprod-run.md`. Write field **names**, never the owner's personal values. The plate, chassis, make, model, colour and dates may be written.
   - Fitness dates come back as `YYYY-MM-DD`, read correctly from the document's `YYYY / MM / DD`.
   - Registration issue date is right. Registration expiry (year + month only on the document) comes back as the **last day of that month**.
   - The colour on each document maps to one of the 16 standard colours, or comes back `null` so Fleet asks for one.
   - A temporary fitness plate (`TMP…`) is never used as the vehicle plate. The registration plate is.
   - The chassis numbers on the two documents match (`compareDocuments` gives no chassis flag).
   - **No owner name, address or TRN** anywhere in the reply. Only the 18 whitelisted keys come back.
   - **No file kept:** no new object in any Storage bucket or R2 bucket, and `fleet.vehicle_document_read_log` has rows with only the hash and counts, no file and no text.
3. Delete `C:\Roam\Goride\.vehicle-docs-test\` and confirm it's gone.

## Rules
- The production database, production Storage buckets and `roam-public` are **untouched**, except the one `_test/preprod.png` file in Part 2 step 4e, which you delete again.
- Never print or commit secret values or the owner's personal details. `.env.local` stays out of git.
- Don't create, switch or commit git branches. Don't push. Leave other uncommitted work alone.
- If you run Playwright, run it once only, then report pass/fail with the error and stop. Use `node C:\Roam\Goride\node_modules\@playwright\test\cli.js test --config <file> --reporter=list --max-failures=1 --retries=0` from PowerShell; `npx playwright` fails in this repo.
- Never save screenshots into a folder that's in git.
- In your report, give clickable links to the files you changed and the results of what you ran, including the picture file path from Part 2 step 4a. Don't paste file contents; Claude will read the files.
- Before you finish, stop any app, dev server, `functions serve` or test server you started (check ports 3000, 3001, 4173, 5173, 5180–5183, 54321). Run `pnpm testcopy:stop` if the test copy was started.
