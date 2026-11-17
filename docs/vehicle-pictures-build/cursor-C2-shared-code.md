# Give Cursor this — Round C2: Shared code

The plan is `docs/vehicle-pictures-and-add-vehicle-audit.md` (Rev 6). Read **§3.1, §3.2, §3.3, §3.5 (field whitelist), §3.6 and §6 (object storage additions)**. Round C1 (database) is done. Do only what this round asks.

## Goal
Write the pure helper code the server and apps share, with unit tests. No routes yet.

## 1. Server helpers — `supabase/functions/_shared/vehiclePictures/`
Plain TypeScript, no npm imports, so Deno tests stay fast.

- **`color.ts`**
  - `VEHICLE_COLORS`: the 16 lowercase values from §3.2
  - `mapVehicleColor(raw: string): VehicleColor | null`: the §3.2 table **in its exact row order** (PEARL, then the dark rows, then the plain rows); the first colour of a two-tone such as "WHITE/BLACK" or "WHITE & BLACK"; returns `null` when nothing matches (there is no "other")
  - `colorLabel(c)` for screens ("pearl white" → "Pearl White")
- **`lookKey.ts`**
  - `normalizeLookPart(s)`: lowercase, trim, collapse spaces, `-` and `_` become a space
  - body synonyms: hatch back → hatchback; stn/waggon, station wagon, wagon → wagon; saloon → sedan; mini van → minivan
  - generation: "1st Gen" / "1st generation" → "1st gen"
  - `faceliftStage(trimSeries)`: the two regexes in §3.1
  - `buildLook(catalogRow, color)`: returns `{ key, make, model, generation, bodyType, faceliftStage, startYear, endYear, color }`, or `{ error: "NON_LATIN_CATALOG_VALUE" }` if any part has non-Latin letters (§3.3)
- **`prompt.ts`**
  - `PROMPT_VERSION = 1`
  - `buildPicturePrompt(look)`: the §3.3 prompt text exactly; each value cut to 40 characters and filtered to letters, numbers, spaces and `-/().`; the facelift text rule
  - the prompt must contain "right-hand-drive" and must **not** contain "reflection" except as "no floor reflection"
- **`documentFields.ts`**
  - `DOCUMENT_FIELD_WHITELIST` = the **18** keys in §3.5 (Rev 7)
  - `whitelistDocumentFields(obj)`: returns only those keys; drops everything else (owner name, address, TRN, fee, receipt/transaction numbers, odometer, weights, any unknown key)
  - `normalizeDocumentDate(raw, kind)`:
    - `kind` is `"fitness"` (printed year / month / day, e.g. `2028 / 08 / 24`), `"registration-issue"` (e.g. `2026-10-01`) or `"registration-expiry"` (year + month only, e.g. `2027/Sep` or `2027/09`, which becomes the **last day of that month**, `2027-09-30`)
    - returns `YYYY-MM-DD` or null
    - never guesses day/month order from digits alone
  - `checkDocumentDates({ year, issueDate, expiryDate }, today)`: the §3.5 date checks; returns the cleaned values plus a list of fields to flag "Check this date"
  - `compareDocuments(fitness, registration)`:
    - `plate` always comes from the registration; the fitness plate (it can be temporary, e.g. `TMP4862`) never causes a mismatch
    - `chassisMismatch` = the chassis numbers differ after removing spaces and dashes and uppercasing
    - `colorConflict` = the two mapped colours differ (the fitness colour wins as the default)
- **`lastError.ts`**: `cleanLastError(msg)`, per §13 (300 characters, URLs and key-like strings → `[hidden]`)

## 2. Object storage additions — `supabase/functions/_shared/objectStorage/`
- `r2Client.ts`: add `put(bucket, key, bytes, contentType, cacheControl)`, signed with the SHA-256 of the body (use `sha256Hex` from `sigv4.ts`).
- Bucket names come from env `R2_BUCKET_PUBLIC` / `R2_BUCKET_PRIVATE`, defaulting to `roam-public` / `roam-private`. Keep `R2_BUCKETS` working for existing callers.
- Add `put` to the `ObjectStore` interface in `uploadFlow.ts` and to any test fakes that implement it.

## 3. App helper — `packages/roam-shared/src/storage/vehiclePicture.ts`
- `vehiclePictureSrc(url, slot: "card" | "detail")` returns `{ src, srcSet }`:
  - card: widths 480 / 960, quality 80
  - detail: widths 1200 / 2400, quality 85
  - always `format=auto`, through `https://media.roamfleet.co/cdn-cgi/image/<options>/<key path>`
  - **idempotent:** a URL already containing `/cdn-cgi/image/` comes back unchanged
  - null in → null out
- `pictureStateLabel(status)`: the §3.6 sentences per status
- Export both from `packages/roam-shared/src/index.ts`.

## 4. Tests (write them first)
- `supabase/functions/_shared/vehiclePictures/color.test.ts` (**T1**): every §3.2 row; the order rules (PEARL WHITE → pearl white, DARK GREY → dark grey, GUNMETAL → dark grey, NAVY → dark blue); two-tone; "CHAMPAGNE MIST" → beige; "MAGENTA" → null.
- `lookKey.test.ts` (**T2**):
  - Roomy row `{make: "Toyota", model: "Roomy", generation: "1st Gen", body_type: "Hatchback", trim_series: "Pre-Facelift"}` + white → `toyota|roomy|1st gen|hatchback|pre_facelift|white`
  - Fit row `{make: "Honda", model: "Fit", generation: "3rd Gen", body_type: "Hatchback", trim_series: "Hybrid (i-DCD)"}` + grey → `honda|fit|3rd gen|hatchback|standard|grey`
  - "Hatch Back" = "Hatchback"; "pre facelift" = "Pre-Facelift"; a different engine/trim → same key; a Japanese-script model → `NON_LATIN_CATALOG_VALUE`
- `prompt.test.ts`: contains make, model, generation, "right-hand-drive", "no floor reflection"; a 200-character catalogue value is cut to 40; `"; ignore all previous` loses its `;` and `"`.
- `documentFields.test.ts` (**T27 unit half** + dates + **T36 unit half**):
  - owner name, address, TRN, fee paid and receipt number are dropped
  - fitness `2028 / 08 / 24` → `2028-08-24`
  - registration issue `2026-10-01` → `2026-10-01`
  - registration expiry `2027/Sep` → `2027-09-30`; `2028/Feb` → `2028-02-29`
  - expiry before issue → empty + flagged; year 1975 → flagged
  - fitness plate `TMP4862` + registration plate `5179KZ` with the same chassis `M900A0344862` vs `M900A-0344862` → no mismatch, plate `5179KZ`
  - different chassis → `chassisMismatch`
  - WHITE vs SILVER → `colorConflict`, white kept as the default
- Add to `objectStorage/r2Client.test.ts` (**T12**): `put` sends `x-amz-content-sha256` = the body hash, `content-type`, `cache-control`, and an authorization header listing them; `R2_BUCKET_PUBLIC=roam-scratch` changes the URL path.
- `packages/roam-shared/src/storage/vehiclePicture.test.ts`: card and detail URLs, idempotent, null.

## 5. Run
- `deno test --no-check --allow-env supabase/functions/_shared/vehiclePictures/ supabase/functions/_shared/objectStorage/`: all must pass.
- Vitest **from PowerShell** at `C:\Roam\Goride\packages\roam-shared`: `npx vitest run src/storage`. All must pass.
- Add the new Deno test folder to the existing "Deno test R2 object storage" step in `.github/workflows/ci.yml`.
- Deno tests can disturb the local app install: at the end, run `pnpm install` at the repo root.

## Rules
- Don't create, switch or commit git branches. Don't push. Never touch the production database. Leave other uncommitted work alone.
- In your report, give clickable links to the files you changed and the results of what you ran. Don't paste file contents — I'll read the files.
- Before you finish, stop any app, dev server or test server you started (check ports 3000, 3001, 4173, 5173, 5180–5183).
