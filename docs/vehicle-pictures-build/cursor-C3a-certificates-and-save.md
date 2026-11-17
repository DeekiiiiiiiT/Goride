# Give Cursor this — Round C3a: Certificate reading + vehicle save rules

The plan is `docs/vehicle-pictures-and-add-vehicle-audit.md` (Rev 6). Read **VP-07, VP-14, VP-15, §3.5, §5.1 "Rollout", §6 (parse-document and vehicle save rows) and §12 "Code deleted"**. Rounds C1 and C2 are done: use their helpers from `supabase/functions/_shared/vehiclePictures/`. Do only what this round asks. The picture lookup comes in C3b; leave a clearly named no-op hook for it.

**Settings store:** every vehicle-picture setting named below lives in the one KV row `kv_store_37f42386.key = 'vehicle_pictures:settings'` (a JSON object), never in `platform:settings:*`. Missing keys use the defaults in the audit.

## Where things are today
- `POST /make-server-37f42386/parse-document` and `POST /make-server-37f42386/generate-vehicle-image` are in `supabase/functions/_fleet-server/register_residual_monolith_routes.tsx` (around lines 4920 and 5068).
- The vehicle save route `POST /make-server-37f42386/vehicles` is in the same file (around line 1890).
- The Fleet add modal is `apps/fleet/src/components/vehicles/AddVehicleModal.tsx`; its API calls are in `apps/fleet/src/services/api.ts` (`parseDocument`, `uploadFile`, `generateVehicleImage`, `saveVehicle`).

Put the new logic in **new small modules** with injected dependencies, so it can be tested without the monolith. The monolith routes only call them:
- `supabase/functions/_fleet-server/vehicle_document_read.ts`
- `supabase/functions/_fleet-server/vehicle_save_rules.ts`

## 1. `parse-document` (server)
Before calling the reader:
- size ≤ 8 MB, else 413 `FILE_TOO_LARGE`
- magic bytes JPEG / PNG / WebP / HEIC (use `_shared/fileMagic.ts`); **PDFs and everything else** → 415 `FILE_TYPE_NOT_ALLOWED`
- rate limit with `_shared/rateLimit.ts`: 20 per user per hour → 429 `READ_LIMIT_USER`; 200 per organisation per Jamaica day → 429 `READ_LIMIT_ORG`

Reading:
- the reader provider and model come from settings `reader_provider` / `reader_model` (the `vehicle_pictures:settings` row; default `openai` / `gpt-4o`)
- call it through the existing `trackedProviderCall`, with a 45 s timeout → 504 `READ_TIMEOUT`
- the reader prompt follows §3.5 "The reader prompt says" (Rev 7) exactly:
  - read each date **by the labels printed on the document** (fitness = year / month / day; registration issue = year-month-day; registration expiry = year + month only)
  - return the raw printed date text; the server turns it into `YYYY-MM-DD` with C2's `normalizeDocumentDate`, so a month-only expiry becomes the last day of that month
  - read the colour from **both** documents
  - return **only** the whitelisted fields, never the owner's name, address, TRN, fee, receipt or transaction numbers

Reply:
- `{ fields: whitelistDocumentFields(...), colorStandard: mapVehicleColor(fields.colorAsWritten), flags: [...date flags], fileSha256 }`
- `fileSha256` = SHA-256 of the received file bytes
- the file is never stored

Logging: **never** `console.log` / `console.error` the body, the file, the fields or the reader's reply. Errors log only a code and the timing.

## 2. Vehicle save (server)
- **Plate required**, else 400 `PLATE_REQUIRED`. The vehicle id stays the plate (uppercase, trimmed); `UNKNOWN-…` ids are never created.
- **The real guard is the insert** (§6): insert; on a primary-key conflict, re-read the row.
  - same `organization_id` → update it
  - another organisation → 409 `PLATE_IN_OTHER_FLEET`
  - a pre-check before the insert is fine as a fast path, but the conflict handling is required
- New body field `documentChecks: [{ docType: "fitness" | "registration", fileSha256, fields }]`:
  - for each, insert a `fleet.vehicle_document_check` row with `fields_json = whitelistDocumentFields(fields)`, `issue_date` / `expiry_date` from the fields, `read_by` = the user, and `reader_provider` / `reader_model` from settings
- **The plate is the registration plate.** The fitness plate is stored only inside its document check (it can be a temporary plate like `TMP4862`) and never blocks a save.
- If both documents are sent and C2's `compareDocuments` reports `chassisMismatch` → 409 `CHASSIS_MISMATCH` ("These documents are for different vehicles"), nothing saved.
- **Update mode** (new body field `updateDocumentsOnly: true`): only the document dates and checks change.
  - A **registration** whose plate differs from the vehicle's plate → 409 `PLATE_MISMATCH`, nothing changes (T30).
  - A **fitness** update is matched by **chassis** instead: a chassis different from the vehicle's last registration check → 409 `CHASSIS_MISMATCH`.
- `color_standard`: save `mapVehicleColor(color)`, or the `colorStandard` the client sends if it's one of the 16. **When `color_standard` or `vehicle_catalog_id` changes, set `picture_id = null` in the same write** (§3.4 "unlink first").
- After a successful save, call `runPictureLookup(vehicle)`. It's an exported no-op for now that returns `{ status: "none" }`; C3b fills it in. The save reply includes `picture: { status, url: null }`.
- Stop writing `fitnessCertificateUrl`, `registrationCertificateUrl` and `image` into `payload_json`.

## 3. Delete (§12)
- the `generate-vehicle-image` route in the monolith
- the image route in `apps/fleet/src/supabase/functions/ai-services/index.ts`
- `api.generateVehicleImage` in `apps/fleet/src/services/api.ts`
- `fleet-core/routes.generated.json` is regenerated by the bundler; don't hand-edit it

## 4. Old Fleet modal — logic only, no visual redesign (the new screens are Claude's round UI1)
In `AddVehicleModal.tsx`:
- Turn **every** PDF into an image with the existing `convertPdfToImage` **before** calling `parseDocument` (not only as a fallback).
- Remove the certificate `api.uploadFile` calls and the `generateVehicleImage` call.
- Save stays disabled until a plate is filled in. Remove the `UNKNOWN-${Date.now()}` id.
- Keep the `fileSha256` + fields from each parse and send them as `documentChecks` on save.
- Show the new error codes as plain toasts:
  - `PLATE_IN_OTHER_FLEET`: "This plate is registered to another fleet on Roam — contact Roam support."
  - `READ_LIMIT_USER`: "You've scanned a lot of documents — try again in an hour, or type the details."
  - `READ_LIMIT_ORG`: "Your fleet has scanned a lot of documents today — try again tomorrow, or type the details."
  - `FILE_TYPE_NOT_ALLOWED` / `FILE_TOO_LARGE` / `READ_TIMEOUT`: "We couldn't read this file" + a reason
  - toasts only, no browser pop-ups

## 5. Tests (write them first)
Deno, in `supabase/functions/_fleet-server/`:
- `vehicle_document_read.test.ts`:
  - **T13**: 9 MB → 413 before any reader call; `.exe` bytes named `.jpg` → 415; a PDF → 415; the 21st read in an hour → 429 `READ_LIMIT_USER`; the reader returning fitness expiry `2028 / 08 / 24` → `2028-08-24`, registration expiry `2027/Sep` → `2027-09-30`, registration issue `2026-10-01` → `2026-10-01`; expiry before issue → empty + flagged
  - **T27**: the reader reply with owner name, address and TRN → the route reply has only whitelist keys
  - **T14**: spy on `console.*` during a full parse and a full save; nothing logged contains a field value or the base64 file
  - the reader is a stub passed in; no real HTTP
- `vehicle_save_rules.test.ts`:
  - **T17**: no plate → 400; same plate saved twice by the same org → one vehicle
  - **T17a**: two orgs saving the same new plate at once (two parallel calls against a fake store that throws a PK conflict for the second) → one vehicle; the other gets 409
  - **T30**: registration update with another plate → 409 `PLATE_MISMATCH`, no change
  - **T36**: fitness plate `TMP4862` + registration plate `5179KZ`, same chassis → saved as `5179KZ`, no warning, the fitness check keeps `TMP4862`; different chassis → 409 `CHASSIS_MISMATCH`; a fitness update with the same chassis but plate `TMP4862` → accepted
  - document check rows written with whitelisted fields
  - a colour change sets `picture_id` to null in the same write

Fleet vitest for the modal logic (from PowerShell in `C:\Roam\Goride\apps\fleet`):
- the PDF path calls `convertPdfToImage` before `parseDocument`
- no `uploadFile` call on save
- Save is disabled without a plate

## 6. Run
- `deno test --no-check --allow-env --allow-read` on the two new test files, plus `supabase/functions/_shared/vehiclePictures/`. All pass.
- Fleet vitest from PowerShell: the new test file passes.
- `pnpm --filter @roam/fleet typecheck`: no new errors in the files you touched (report the before/after count).
- Add the two Deno test files to a new CI step "Deno test vehicle pictures" in `.github/workflows/ci.yml`.
- At the end, run `pnpm install` at the repo root (Deno tests can disturb the local app install).

## Rules
- Don't create, switch or commit git branches. Don't push. Never touch the production database. Leave other uncommitted work alone.
- In your report, give clickable links to the files you changed and the results of what you ran. Don't paste file contents — I'll read the files.
- Before you finish, stop any app, dev server or test server you started (check ports 3000, 3001, 4173, 5173, 5180–5183).
