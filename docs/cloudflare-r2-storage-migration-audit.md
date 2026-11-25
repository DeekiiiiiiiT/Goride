# Cloudflare R2 storage takeover — plan

**Rev 3 · 24 Nov 2026** — status checked on production; evidence slice built. (Rev 2, 16 Nov, replaced the Rev 1 team-review draft.)
**Decision:** Cloudflare R2 stores and serves **every** file. Supabase keeps the database, logins and server functions only. No files stay on Supabase Storage.
**Related:** [storage-audit.md](./storage-audit.md) — upload security rules that carry over unchanged.

---

## 0. START HERE (24 Nov 2026)

**Where we are:** M1 and M2 done. **M3 is COMPLETE in code (11 slices, 24 Nov).** maker logos (live), vehicle pictures + certificates (live, own audit), **evidence uploads (LIVE + switched on 25 Nov ~00:21 UTC)**, parts request photos (`430edd55`), parts imports (`ec84a5dd`), merchant assets (`96ab5c95`), in-house receipts (`b6c73a59`), customer avatars + issue photos (`cd145a63`), freight docs (`93f43499`), courier docs + driver docs + merchant KYC (`91f2673c` — **inert until `MALWARE_SCAN_API_KEY` is set**), and **slice 8: courier photos, driver photos, explorer photos, refinery sources (built 24 Nov, not pushed — these four go live on deploy because they use the shared switch)**. No public or private upload path writes to Supabase Storage any more; see the slice 8 note for the full audit and the two remaining Supabase writes (a local test-copy seeder and manual reset scripts). M4–M7 not started. **App releases still owed:** `dash-courier` and `haul` must be rebuilt/released before their new upload paths take effect — until then those two apps keep uploading the old way.

**Production check (24 Nov):** 427 files still in Supabase Storage (~180 MB): `ephemeral-evidence` 313 (50 MB, **12 new in the last 7 days**, the only bucket still growing), `make-37f42386-docs` 61 (125 MB), `merchant-assets` 23, `parts-imports` 17, `enterprise-freight-docs` 5, `courier-documents` 4, `merchant-documents` 3, `in-house-receipts` 1. `make-37f42386-vehicles` is empty (vehicle pictures audit).

**Evidence slice (built 24 Nov, on `parts-auto-match`, not pushed):**
- The Fleet / Driver / Dominion `/upload` route keeps its answer: one address per file. The apps don't change.
- When switched on, the file goes to `roam-private` (`evidence/<org>/<type>/<uuid>.<ext>`, or `fleet-docs/<org>/driver-docs/<uuid>.<ext>` for permanent docs). The address is a **signed link** to the new `file-link` function (`verify_jwt = false`, because receipts show in plain `<img>` tags). It checks the signature and the 1-year expiry, then redirects to a 10-minute R2 link, so the bytes never pass through Supabase. Same trust model as the 1-year Supabase signed URLs it replaces.
- **Switch:** the Supabase secret `FILE_LINK_SECRET` (plus the R2 keys, already set). Without it, uploads keep going to Supabase exactly as before, so deploying is safe.
- `evidence_files.bucket_id = 'r2:private'` for these rows. The 14-day purge, record delete and both bulk deletes now delete from R2 too (`removeStoredFiles`).
- Code: `_shared/objectStorage/fileLink.ts`, `supabase/functions/file-link/`, `_fleet-server/evidence_storage.ts`, `evidence_routes.ts`, the `/upload` route in `register_residual_monolith_routes.tsx`. Added to config.toml, the edge deploy list and the CI R2 test step.
- **Proof:** 37 Deno tests pass (6 new link tests, 5 new evidence tests). Against the real R2: put → signed link → `file-link` run locally → 302 to R2 → same bytes; tampered link 404, expired 410, unsigned R2 request 400; test files removed.

**Slice 1 — parts request photos (built 24 Nov, on `parts-auto-match`, not pushed):**
- Fleet → Find parts → "add part info" photo (`POST /make-server-37f42386/parts/request-photo`) keeps its answer: `{ photo_url }`, one address per file. The app does not change.
- When switched on, the photo goes to `roam-private/parts-requests/<org>/<uuid>.<ext>` and the answer is a signed `file-link` address (1 year, same trust model as evidence). The file never passes through Supabase.
- **Limits are the ones the old bucket had**: 8 MB, JPEG/PNG/WebP. The R2 branch checks the magic bytes before it writes, so a renamed non-image is refused (415).
- **Old rows stay readable:** rows written before the switch keep the bare Supabase path inside `parts-request-photos`. `parsePartsPhotoAddress` reads both (a `file-link` address or an old path/URL); `removePartsRequestPhotos` sends each one to R2 or Supabase, and refuses an address belonging to another org. No delete path exists for these photos yet, so nothing had to be rewired — the helper is there for the first cleanup job.
- **Switch:** the same as evidence — `FILE_LINK_SECRET` plus the R2 keys (already set). Without it, `/parts/request-photo` runs the old Supabase upload exactly as before.
- Code: `_fleet-server/parts_request_photo_storage.ts`, `fleet_find_parts_routes.ts` (one route). The delete helper moved to `_shared/objectStorage/storedFiles.ts` so every later slice shares it (evidence imports it unchanged).
- **Proof:** 8 new Deno tests (key scope, old path shape, both stored addresses, delete routing, another org refused, limits) and the existing 5 evidence R2 tests still pass. Bundle check on `fleet-core/src/main.ts` clean (1.83 MB), `lint-edge-kernel` and `edge-route-manifest --all --check` green.
- **How to check it live:** after deploy + `FILE_LINK_SECRET`, send one add-part-info request with a photo in Fleet → Find parts. Then confirm `parts_sourcing_requests.photo_url` for that row starts with `https://<project>.supabase.co/functions/v1/file-link?b=private&k=parts-requests/`, the link opens the photo, and no new row appeared in `storage.objects` for `parts-request-photos`.
- **Note:** the Fleet Find-parts screen does not attach a photo yet (`uploadPartRequestPhoto` in `apps/fleet/src/services/api.ts` has no caller), so this route is ready and correct but no screen uses it until photo attach ships. Dominion already receives the stored address as `photos[].url` from `pending_parts_catalog_routes.ts`; that value is now directly openable.

**Slice 2 — parts imports (built 24 Nov, on `parts-auto-match`, not pushed):**
- Dominion → Parts database → Import sends the CSV to the server (`POST …/admin/parts-import/batches/:id/source`), so **no app change**. With R2 on the bytes go to `roam-private/parts-imports/platform/<batch>/source.csv`, and `part_import_batch.storage_path` stores that key.
- Both readers handle either storage, so **old batches keep working**: the check job (`runImportCheck`) and the staff **download route** `GET …/batches/:id/source.csv` call `readPartsImportSource`, which reads R2 for a `parts-imports/…` key and the old `parts-imports` bucket for a `<batch>/source.csv` path. A missing file still answers "Upload the CSV first" / "Download failed", not a crash.
- Re-uploading a batch that still has its Supabase copy removes that copy after the R2 write, so the old `upsert` behaviour (one file per batch) is kept.
- **Same checks as today:** the route still rejects binary/XLSX/PDF (422 with the hex prefix) and anything over 5 MB; the purpose row caps at 5 MB too. Content is stored as `text/csv; charset=utf-8`.
- **Switch:** the same as evidence — R2 keys + `FILE_LINK_SECRET` + `SUPABASE_URL`. (This slice hands out no private link; the secret is only part of the same flip.) Without it, both routes run the old Supabase code exactly as before.
- Code: `_fleet-server/parts_import_storage.ts`, `parts_import_routes.ts` (batch create, source upload, check read, download read).
- **Proof:** 9 new Deno tests (key shape, 5 MB cap, old path, both stored addresses, R2-vs-Supabase read routing, missing file → null, write types/cache, delete routing, failed delete reported). Bundle check on `fleet-core/src/main.ts` clean (1.83 MB), `lint-edge-kernel` and `edge-route-manifest --all --check` green.
- **How to check it live:** after deploy, run one parts import in Dominion. Then confirm `part_import_batch.storage_path` for the new batch is `parts-imports/platform/<batch>/source.csv`, the object is in `roam-private` under that key, the check completes and shows rows, **Export raw** downloads the same CSV, and no new row appeared in `storage.objects` for `parts-imports`. Re-open an older batch and export it — that one must still download from Supabase.

**Slice 3 — merchant assets (built 24 Nov, on `parts-auto-match`, not pushed):**
- `POST <delivery>/merchant-assets/upload` (Partner app: logo / cover / menu photos; Dominion in-house desk: menu-item photos) already receives the file and answers `{ path, publicUrl }`, so **no app change**. With R2 on the image goes to `roam-public/merchant/<merchant>/<folder>/<content-hash>.<ext>`, and `publicUrl` is the `media.roamfleet.co` address. Cache header `public, max-age=31536000, immutable`.
- **Changed image → new address:** the key carries the first 16 hex of the SHA-256 of the bytes, so replacing a logo gives a different key and a different address (and the same picture uploaded twice reuses one object). Nothing has to be purged from the cache.
- **Scope:** the merchant the caller acts for (`resolveMerchantAccess` — owner or approved team member). Platform staff (the in-house desk, which also calls this route) and anyone who does not resolve keep their own per-user folder, exactly like the `user.id` folder the old keys used. A failed lookup never blocks an upload that worked before.
- **Old addresses keep showing:** every app stores the full `publicUrl` string returned at upload time and delivery routes hand stored values straight back, so rows holding a Supabase `…/storage/v1/object/public/merchant-assets/…` URL still render. `parseMerchantAssetAddress` reads a media address, an old Supabase URL and a bare old path; `removeMerchantAssets` sends media keys to `roam-public` and old ones to the old bucket. No delete path exists for merchant assets yet, so nothing had to be rewired.
- **Limits unchanged:** 5 MB, JPEG/PNG/WebP, same magic-byte check, same 401/400/413/500 answers.
- **Switch:** the evidence switch (R2 keys + `FILE_LINK_SECRET` + `SUPABASE_URL`) **plus `R2_PUBLIC_BASE_URL`**, because a public file is useless without its media address. Without them the route runs the old Supabase upload exactly as before.
- Code: `delivery/merchant_asset_storage.ts`, `delivery/merchantAssetsUpload.ts`. `_shared/objectStorage/storedFiles.ts` now also routes `r2:public` deletes (evidence and parts slices unaffected).
- **Proof:** 9 new Deno tests (switch incl. missing base URL, limits, merchant/user scope, content-hash key, media address, immutable write, both old and new addresses parse, delete routing, skipped/failed deletes). Delivery and fleet-core bundles compile clean (1.075 MB / 1.832 MB, 0 warnings), `lint-edge-kernel` and `edge-route-manifest --all --check` green.
- **How to check it live:** after deploy, change a logo in Partner → the saved `logo_url` starts with `https://media.roamfleet.co/merchant/`, opens, and the second load is a Cloudflare cache **HIT** with `cache-control: public, max-age=31536000, immutable`. Open a store that still has an old Supabase logo — it must still show. Then check `storage.objects` for `merchant-assets` got no new row.

**Slice 4 — in-house receipts (built 24 Nov, on `parts-auto-match`, not pushed):**
- `POST <delivery>/admin/in-house/tasks/:id/receipt` (Dominion → In-House desk) already receives the receipt as base64 and answers `{ path, scan }`, so **no app change**. With R2 on the file goes to `roam-private/in-house-receipts/<merchant>/<task>-<uuid>.<ext>`, and `procurement_tasks.receipt_path` stores a **signed `file-link` address** (one year) so staff can open the receipt later — the same shape evidence uses.
- **Order of work:** upload → save the row. A replaced receipt is **kept**, as before R2 (owner check 25 Nov: it backs real card spend). If the row save loses the race ("Someone else took this order"), the just-uploaded copy is removed, so nothing is orphaned.
- **Old receipts keep opening:** rows written before the switch keep the bare `<task>/<uuid>.<ext>` path in the old bucket. `parseInHouseReceiptAddress` reads a file-link address, an old Supabase URL and a bare path; `removeInHouseReceipts` sends R2 keys to `roam-private` and old paths to `in-house-receipts`.
- **Unchanged:** 5 MB cap, photo/PDF magic-byte check, the virus scan and its "scanner not configured" tolerance, the role/claim checks and the 404/403/400/409 answers.
- **Switch:** the same as evidence — R2 keys + `FILE_LINK_SECRET` + `SUPABASE_URL`. Without them the route runs the old Supabase upload exactly as before.
- Code: `delivery/inHouse/receipt_storage.ts`, `delivery/inHouse/routes.ts` (one route).
- **Proof:** 7 new Deno tests (limits, merchant/task key scope, signed address resolves to the key and refuses an unsafe key, old bare path and old Supabase URL parse, private write, delete routing, failed delete reported). Delivery and fleet-core bundles compile clean (1.078 MB / 1.832 MB, 0 warnings), `lint-edge-kernel` and `edge-route-manifest --all --check` green.
- **How to check it live:** after deploy, attach a receipt to one In-House order. Then confirm `procurement_tasks.receipt_path` starts with `https://<project>.supabase.co/functions/v1/file-link?b=private&k=in-house-receipts/`, the link opens the photo/PDF, replacing the receipt swaps the address and keeps the previous object, and no new row appeared in `storage.objects` for `in-house-receipts`. Open an older order's receipt path — the old object must still be there.

**Slice 5 — customer avatars + issue photos (built 24 Nov, on `parts-auto-match`, not pushed):**
- Two routes in `<delivery>/customerAccountRoutes.ts`, both already receiving the file, so **no app change**:
  - `POST /customer/avatar` → `roam-public/avatars/<user>/<content-hash>.<ext>`, answered as the `media.roamfleet.co` address in `customers.avatar_url` (cache `public, max-age=31536000, immutable`). Response unchanged: `{ profile }` with `avatarUrl` / `avatarPath`.
  - `POST /customer/issue-photo` → `roam-private/customer-issues/<user>/<content-hash>.<ext>`, answered as a **signed `file-link` address in both `path` and `signedUrl`** (one year). The customer app stores that `path` in `customer_order_issues.photo_url`, so the value support staff see (merchant support case payload, Dominion finance/issue views) is directly openable — it was a bare path before.
- **Old values keep showing:** old avatars are full Supabase public URLs and old issue photos are bare `customer-issue-photos` paths; both still render as before. `parseAvatarAddress` / `parseIssuePhotoAddress` read the new address, the old URL and the bare path; `removeAvatars` / `removeIssuePhotos` route R2 keys to the right bucket and old paths to the old one.
- **Replace rule:** the avatar route already deleted the previous avatar, so it still does — now *after* the row points at the new file, and never the file just written. If the `customers` row save fails, the new object is removed. Issue photos are never deleted (there was no delete before).
- **Scope:** one folder per signed-in user; a delete refuses another customer's address (`isOwnAvatar` / `isOwnIssuePhoto`).
- **Unchanged:** 2 MB cap, JPEG/PNG/WebP magic-byte check, auth requirement, the 400/413/500 answers and both response shapes.
- **Switch:** avatars need the evidence switch **plus `R2_PUBLIC_BASE_URL`** (a public file needs its media address); issue photos need the evidence switch (they hand out a private link). Without them each route keeps its old Supabase upload exactly as before.
- Code: `delivery/customer_media_storage.ts`, `delivery/customerAccountRoutes.ts` (two routes).
- **Proof:** 9 new Deno tests (2 MB limits, per-user key scope and escaping, media address vs signed link, old avatar URL / old issue path parse, another customer's file refused, public+immutable vs private writes, both delete routings, failures reported). Delivery and fleet-core bundles clean (1.082 MB / 1.832 MB, 0 warnings), `lint-edge-kernel` and `edge-route-manifest --all --check` green.
- **How to check it live:** after deploy, change the avatar in the customer app → `customers.avatar_url` starts with `https://media.roamfleet.co/avatars/`, it shows in the app header and reloads with a cache HIT. Report an order issue with a photo → `customer_order_issues.photo_url` is a `/functions/v1/file-link?b=private&k=customer-issues/` address that opens; open an older issue's photo value — it must still be there. No new rows in `storage.objects` for `customer-avatars` or `customer-issue-photos`.

**Slice 6 — freight docs (built 24 Nov, on `parts-auto-match`, not pushed):**
- Every freight document is written through one function, `freight/orgFiles.ts uploadOrgFile` (Files library upload, package + warehouse invoice, retail-order invoice, shipment-document dual-write, public POD capture). With R2 on the bytes go to `roam-private/freight-docs/<org>/<kind>/<uuid>.<ext>` and the row is `freight.org_files.bucket_id = 'r2:private'`. Old rows keep `enterprise-freight-docs` + `<org>/<kind>/<uuid>.<ext>`. No app change: the routes still receive the file and answer `{ file }`.
- **Read (the only place a stored freight value becomes a URL):** `signedOrgFileUrl` → `GET /files/:id/url` returns a **1-hour R2 link** for new rows (bytes never pass through the function) and the old Supabase signed URL for old rows. Same lifetime as before.
- **Delete:** `deleteOrgFile` soft-deletes the row first, then removes the bytes through `removeFreightDoc` (R2 or old bucket); the `delivery_batch_stops.pod_photo_path` pointers are cleared against the same value, so they match a key as well as an old path.
- **Every other reader checked and left alone** (they only test presence, copy the value, or print it — no signing, no `startsWith` bucket checks): `freight/courierOsRoutes.ts` (`classify` invoice tabs, `/packages/:id/invoice` write, `/packages/:id/verify-invoice` copy), `freight/manifestReadiness.ts` (missing-invoice blocker), `freight/pipeline.ts` (invoice readiness + manifest CSV `invoice_storage_path` column and `invoicePaths` list), `freight/retailOrdersRoutes.ts` (write + `.is("invoice_storage_path", null)`), `freight/podService.ts` (`pod_photo_path` write only), `freight/index.ts` (`/files`, `/files/upload`, `/files/:id/url`, `DELETE /files/:id`, `/shipments/:id/documents`), and the Enterprise app (`freightService.orgFileUrl`, `fileDisplayName` label fallback, `invoicePaths` display, `hasCustomerInvoice` bools — no URL is built in the app). `registerOrgFile` now marks a row `r2:private` when the key it is handed already lives in `freight-docs/`.
- **Unchanged:** 20 MB cap, PDF/JPEG/PNG/WebP/HEIC magic-byte check, the malware scan tolerance, the `/files` permission checks and every response shape.
- **Switch:** the same as evidence — R2 keys + `FILE_LINK_SECRET` + `SUPABASE_URL`. Without it uploads keep writing to `enterprise-freight-docs` exactly as before, and rows already in R2 still sign.
- Code: `freight/freight_docs_storage.ts`, `freight/orgFiles.ts` (upload, register, sign, delete).
- **Proof:** 8 new Deno tests (switch, 20 MB limits, org/kind key scope and escaping, old path unchanged, new-vs-old row detection, private write, read-link lifetime, delete routing, failed delete reported). Freight, delivery and fleet-core bundles compile clean (0.189 / 1.082 / 1.832 MB, 0 warnings), `lint-edge-kernel` and `edge-route-manifest --all --check` green.
- **How to check it live:** after deploy, upload a file in Enterprise → Freight → Files. Then confirm `freight.org_files.bucket_id = 'r2:private'` and `storage_path` starts with `freight-docs/`, the library opens it (link starts with `https://<account>.r2.cloudflarestorage.com/roam-private/`), deleting it removes the object from `roam-private`, and an older file still opens through its Supabase signed URL. Then attach a package invoice: the package row carries the `freight-docs/…` key, the invoice audit tabs still classify it, verify still works, and no new row appeared in `storage.objects` for `enterprise-freight-docs`.

**Slice 7 — courier docs, driver docs, merchant KYC (built 24 Nov, on `parts-auto-match`, not pushed; INERT until the scan key exists):**
- **These three do NOT use the shared switch alone.** Production has no `MALWARE_SCAN_API_KEY` and the shared switch (`isR2PrivateLinksEnabled`) is already on, so the three `scan: true` purposes get their own switch: **shared switch AND `MALWARE_SCAN_API_KEY`** (`_shared/objectStorage/scannedPurposes.ts isScannedR2Enabled`). `MALWARE_SCAN_FAIL_OPEN=1` deliberately does not count.
- **With no scan key (today):** courier docs and driver docs upload straight from the apps to `courier-documents` / `driver-documents` exactly as before (the new server routes answer `{ enabled: false }`, the apps keep the old upload), and merchant KYC keeps its old path. Nothing changes for couriers, drivers or merchants until the key is added.
- **With the scan key:** courier + driver documents upload through the new `POST /scanned-documents/start` + `/finish` routes (`delivery` function). Finish scans the file and **deletes it and refuses (422)** when the scan fails or the scanner is unavailable — fail-closed. The stored value is a **signed `file-link` address** (`courier-docs/<user>/…`, `driver-docs/<user>/…`), so the apps' existing readers (which already accept an `http` address) keep working. Merchant KYC (`POST /merchant/documents`) writes to `roam-private/merchant-kyc/<merchant>/<docType>-<uuid>.<ext>` and `merchant_documents.file_path` stores the **key**; the Dominion documents list signs it with a 1-hour R2 link, old rows keep the Supabase signed URL.
- **Known today:** with no scan key, merchant KYC uploads are already refused with 422 ("scanner not configured") by the pre-existing scan check — adding the key is what makes merchant KYC uploads work at all, and it also switches all three purposes to R2. Courier proof/avatar/issue photos share the `courier-docs` purpose, so they are scanned too once the key is on.
- **App side included only where these purposes need it:** `apps/dash-courier/src/lib/courierFileUpload.ts` (tries the server flow first, falls back to the old direct upload; `normalizeStoragePath.ts` and `resolveCourierFileUrl` need no change because an address is already accepted) and `apps/haul/src/utils/saveHaulerDocuments.ts` (driver documents). The other two haul utils (`updateHaulerProfile.ts`, `saveHaulerOnboarding.ts` — driver photos) stay for slice 8.
- **Readers of the stored values, all checked:** courier — `courierDocumentService.ts` (writes `courier_documents.file_url`), `DocumentsPage.tsx` + `accountReviewStatus.ts` (presence only), `courierFileUpload.resolveCourierFileUrl` (signs only non-`http` values, so addresses pass straight through), `delivery/courierConsumerRoutes.ts` `/orders/:id/courier-proof` + delivery attempts (presence only), `delivery/admin/courierRoutes.ts` (courier detail selects documents **without** `file_url`; delete removes DB rows only, never storage), dash-customer/rush proof photo display (raw value in `<img>`). driver — no reader anywhere in code (`driver-documents` files were only ever found by the `${userId}/${slot}.${ext}` convention; nothing signs or lists them). merchant KYC — `extendAdminMerchantDetail` (signs, **now R2-aware**), `GET /merchant/documents` (returns the row, merchant app shows status only), `delivery/admin/merchantRoutes.ts` (status update only).
- **Replaced files are kept:** courier documents replace the DB row (old object is not deleted, as before), merchant KYC `upsert` never deleted the old object either, and no delete path exists for driver docs. So nothing new is deleted, and nothing needed a row-first-then-delete order.
- **Unchanged:** 10 MB cap, JPEG/PNG/WebP/PDF magic-byte check, every 400/401/413/422/500 answer and every response shape; R2 failures return the same `{ error }` shape the Supabase failures gave (no uncaught throws).
- Code: `_shared/objectStorage/scannedPurposes.ts`, `delivery/scannedDocumentRoutes.ts` (+ mount in `delivery/index.ts`), `delivery/merchant_application_routes.ts` (upload + staff signer), `apps/dash-courier/src/lib/courierFileUpload.ts`, `apps/haul/src/utils/saveHaulerDocuments.ts`.
- **Proof:** 10 new purpose tests (the production guard: shared switch on + no scan key → off; scan key alone is not enough; key scope/escaping; new-vs-old detection; file-link address; private write; delete routing; failures reported) + 6 route tests (start says `{ enabled: false }` with today's secrets, fail-open flag does not count, real start hands out a `roam-private/pending/` link when the key exists, merchant KYC not offered to apps, finish refused with 409 while the key is missing, 401 without a session). Delivery bundle 1.090 MB, fleet-core 1.832 MB, both 0 warnings; both changed app files bundle clean; `lint-edge-kernel` and `edge-route-manifest --all --check` green.
- **How to check it live (before the key):** open the courier app and upload a document — it must land as `<user>/docs/<uuid>.<ext>` in `courier-documents` exactly as today, and a hauler document must land in `driver-documents`. Nothing in `roam-private` should appear. **After adding `MALWARE_SCAN_API_KEY`:** a courier document lands at `roam-private/courier-docs/<user>/<uuid>.<ext>` and the row holds a `/functions/v1/file-link?...` address that opens; a merchant KYC document lands at `roam-private/merchant-kyc/<merchant>/…`, `merchant_documents.file_path` holds the key and Dominion's document list shows a working `signedUrl`; a file the scanner rejects must be refused and leave no object behind.

**Virus-scan fix (24 Nov, built with slice 7):** `scanForMalware` no longer uploads the file to VirusTotal. It hashes the bytes locally (SHA-256) and calls `GET /api/v3/files/<sha256>` — **the file never leaves our server, and no ID document is shared with VirusTotal's partners**. 200 with `malicious`/`suspicious` > 0 → refused with "This file failed a security scan and was not uploaded."; 404 (never seen is normal) → clean; 429 → wait ~15 s, retry once, then "Security check is busy — please try again in a minute."; other status / 10 s timeout / network error → refused; no key → refused. `MALWARE_SCAN_FAIL_OPEN=1` still bypasses for local dev, but never a known-bad file. Callers unchanged: merchant KYC, in-house receipts (still tolerates "scanner not configured"), `uploadFlow.finishUpload`, freight files. **Switching slice 7 on and unblocking merchant KYC now only needs a free VirusTotal API key saved as the Supabase secret `MALWARE_SCAN_API_KEY`.**

**Slice 8 — the last M3 upload paths (built 24 Nov, on `parts-auto-match`, not pushed; these go LIVE on deploy):**
- **a) Hauler driver photos** (`apps/haul/src/utils/saveHaulerOnboarding.ts`, `updateHaulerProfile.ts` → new `haulerPhotoUpload.ts`): the app asks `POST /app-uploads/start` with purpose `driver-photos`; when the server says enabled the photo goes to **`roam-public/driver-photos/<user>/<uuid>.<ext>`** and the saved value is the **`media.roamfleet.co` address** (cache `public, max-age=31536000, immutable`). A profile photo is stored once and shown indefinitely, so it must never be a link that expires — this is the same treatment customer avatars got in slice 5, and the old bucket was already public. Otherwise the old `driver-photos` upload runs unchanged (`<user>/avatar.<ext>`, `getPublicUrl`). The previous photo is kept (old code overwrote one fixed path; the new key is per upload, so nothing is deleted). Readers checked: `rides/assignedDriverSummary.ts` + `apps/rides-passenger` (LiveRideDriverCard / CashSettlementRiderView / ActivityTripDetailsSheet render `profile_photo_url` in `<img>`), the hauler app (`HaulerContext`, `ensureHaulerSurface`), the driver app (`DriverContext`, `ensureDriverSurface`), `dash-courier`'s own `profile_photo_url` readers (different upload path, address-tolerant), and the auth user metadata `avatar_url` — all render a plain URL, and a media address is permanent.
- **b) Courier photos** (`apps/dash-courier/src/lib/courierFileUpload.ts`): folder `docs` keeps the scanned `courier-docs` purpose, `proofs` / `issues` use the **new unscanned private purpose `courier-photos`**, and `avatars` / `vehicles` use the **new public purpose `courier-profile`** (`purposes.ts`: private vs public, user scope, JPEG/PNG/WebP, 10 MB, `scan: false`). Same start/finish pattern via `POST /app-uploads/start|finish`: proofs/issues on the shared switch (a delivery proof never waits on the virus scan), profile/vehicle photos also need `R2_PUBLIC_BASE_URL` because their saved value must be the **permanent `media.roamfleet.co` address** (`roam-public/courier-profile/<user>/<uuid>.<ext>`, immutable cache) — an avatar saved once must not expire. `resolveCourierFileUrl` already passes an `http` value straight through, and `normalizeStoragePath` is unchanged. Readers checked: `courierDocumentService.ts` (writes `courier_documents.file_url`), `DocumentsPage.tsx` + `accountReviewStatus.ts` (presence only), `delivery/courierConsumerRoutes.ts` `/courier-proof` + delivery attempts (presence only), Dominion `admin/courierRoutes.ts` (never selects `file_url`), dash-customer / rush proof display (raw value in `<img>`), and Dominion FinancePage's `attempt.photo_url` link.
- **c) Explorer photos** (`supabase/functions/explorer/index.ts` + new `explorer_photo_storage.ts`): the server already receives the bytes; with R2 on the photo goes to `roam-private/explorer/<user>/<uuid>.jpg` and the key is stored in `place_evidence.photo_path` / `proposal.payload.photoPath`. The Dominion review queue (`GET /admin/places`) signs it with a 10-minute R2 link; older `<place>/<uuid>.jpg` rows still get the Supabase signed URL. Reader checked: `explorer/index.ts /admin/places` → `packages/platform-ops-ui` PlacesReview (renders `payload.photoUrl`).
- **d) Refinery price sources** (`petrojam-prices/index.ts` + new `refinery_source_storage.ts`): the document goes to `roam-private/refinery-sources/platform/<slug>/<date>/<name>` and that key is stored where the old bucket path went. Same name + date overwrites the same object, exactly like the old `upsert: true`. Reader checked: only written into `writeRefinerySnapshot`'s `source_url`; no code signs or links it (the history table shows `source` = "manual"/"scrape", not the path), so a key is equivalent to the old path.
- **e) Dead copies deleted:** `apps/fleet/src/supabase/functions/admin-operations/` and `ai-services/` — confirmed nothing imports them (only two markdown notes in `apps/fleet/src/docs/` mention them). Neither is deployed.
- **Switch:** `courier-photos`, `explorer`, `refinery-sources` use the shared switch (`isR2PrivateLinksEnabled`); the two **public** purposes (`courier-profile`, `driver-photos`) use the shared switch **plus `R2_PUBLIC_BASE_URL`** so their saved value is a permanent media address. All are already on in production, so they move on the next deploy; off → every one of them keeps its old Supabase path. R2 failures return the old answer shape (`{ error }`/null), never an uncaught throw.
- Code: `supabase/functions/delivery/scannedDocumentRoutes.ts` (now also serves `/app-uploads/*` with a per-purpose gate and returns a media address for public purposes), `_shared/objectStorage/purposes.ts` (`courier-photos`, `courier-profile`, `driver-photos` public), `_shared/objectStorage/index.ts` (`isR2PublicAssetsEnabled`), `apps/dash-courier/src/lib/courierFileUpload.ts`, `apps/haul/src/utils/haulerPhotoUpload.ts` + the two onboarding utils, `explorer/index.ts` + `explorer_photo_storage.ts`, `petrojam-prices/index.ts` + `refinery_source_storage.ts`.
- **Proof:** 5 new/updated route tests (proofs use the shared switch, profile photos additionally need the media base, proofs stay private, profile photos are public, non-app purposes refused) + 2 upload-flow tests (profile photos land in roam-public with the immutable cache and a **media address with no query string / no expiry**; courier proofs stay private with no public address) + 7 explorer + 6 refinery. dash-courier `vitest` 29/29 and haul `vitest` 3/3 pass; every changed edge function bundles clean (delivery 1.090 MB, explorer 0.088 MB, petrojam-prices 0.027 MB).
- **How to check it live:** deploy, then (courier/haul app releases) upload a delivery proof → `roam-private/courier-photos/<user>/…`; change an avatar or vehicle photo → `roam-public/courier-profile/<user>/…` and the saved value is a `media.roamfleet.co` address with **no expiry**; change the hauler photo → `driver_profiles.profile_photo_url` becomes a permanent `media.roamfleet.co/driver-photos/…` address that a passenger screen renders; add a Plug pin photo → `roam-private/explorer/…`; save a refinery price with a document → `refinery-sources/platform/…`. No new rows in `storage.objects` for those buckets.

**M3 completeness audit (24 Nov):** every Supabase Storage write left in the repo is one of these two kinds — nothing else writes a new file there.
1. **The "switch off" branch of a migrated route** (kept on purpose so a deploy is safe and old behaviour is available): `delivery/inHouse/routes.ts` receipts, `delivery/customerAccountRoutes.ts` avatar + issue photo, `delivery/merchantAssetsUpload.ts`, `delivery/merchant_application_routes.ts` merchant KYC, `_fleet-server/fleet_find_parts_routes.ts`, `_fleet-server/parts_import_routes.ts`, `_fleet-server/register_residual_monolith_routes.tsx` (`/upload`), `freight/orgFiles.ts`, `explorer/index.ts`, `petrojam-prices/index.ts`, `apps/dash-courier/src/lib/courierFileUpload.ts`, `apps/haul/src/utils/saveHaulerDocuments.ts`, `apps/haul/src/utils/haulerPhotoUpload.ts`.
2. **Tools that are not upload paths**: `scripts/vehicle-pictures-reset-t22.mjs` (seeds a **local test copy** only) and `scripts/vehicle-pictures-reset*.mjs` (manual reset of old vehicle pictures; vehicle pictures already upload to R2 through the admin route). They never run in production.

Every other `storage.from(...)` call in the codebase is a read (`download`, `createSignedUrl`, `getPublicUrl`, `list`) or a delete (`remove`) — both handle old and new values as described in each slice.

**Go-live done (25 Nov):** pushed `2f45698a` to main (cherry-picked onto main, without this branch's unrelated "y" commit). Deploy Edge run 45516878276 green: `file-link` + `fleet-core` deployed, smoke passed. `FILE_LINK_SECRET` set through the Supabase Management API (the `npx supabase` CLI crashes on this machine), confirmed present; `file-link` now answers 404 to a fake link (it answered 503 before the secret). Snapshot at 00:21 UTC: 374 files in `ephemeral-evidence` + `make-37f42386-docs`, 0 `r2:private` rows.
**Left: the first real upload.** Receipt photos come from the **Driver app** (DriverExpenses, fuel log, offline queue); in the Fleet app only Add driver uploads (licence photos), and the fuel screens upload nothing. Check after the next driver receipt: a new `evidence_files` row with `bucket_id = 'r2:private'`, no new `storage.objects` row, and the photo opens in Fleet.

**Go-live steps that were followed:**
1. Push (deploys fleet-core + `file-link`; the config.toml change redeploys all functions). Nothing changes yet.
2. Set the Supabase secret `FILE_LINK_SECRET` (64 random hex characters). From then on, new receipts go to R2.
3. Real check: log one fuel receipt in Fleet. It shows on screen; `evidence_files` has a row with `bucket_id = 'r2:private'`; no new row in `storage.objects` for `ephemeral-evidence`.

**M3 slices, in this order:** ~~parts request photos (`fleet_find_parts_routes.ts`)~~ (slice 1) → ~~parts imports (`parts_import_routes.ts`)~~ (slice 2) → ~~merchant assets (`delivery/merchantAssetsUpload.ts`)~~ (slice 3) → ~~in-house receipts (`delivery/inHouse/routes.ts`)~~ (slice 4) → ~~customer avatars + issue photos (`delivery/customerAccountRoutes.ts`)~~ (slice 5) → ~~freight docs (`freight/orgFiles.ts`)~~ (slice 6) → ~~courier docs, driver docs, merchant KYC~~ (slice 7 — inert until `MALWARE_SCAN_API_KEY`) → ~~courier photos, hauler driver photos, explorer photos, refinery sources~~ (slice 8) — **all built.** Next: M4 (copy the 427 old files), M5 (rewrite stored addresses, including old evidence links), M6, M7.

**Scan callers (25 Nov, Claude):** `scanForMalware` answers `unavailable: true` when it could not check (no key, busy, error, timeout). In-house receipts and freight files only refuse a real detection (they accepted unscanned files before, and an in-house order cannot be placed without its receipt). Merchant KYC and the slice-7 ID documents stay strict.
**Order of go-live:** push the new scanner first, THEN add `MALWARE_SCAN_API_KEY`. The scanner still live today uploads the whole file to VirusTotal, so a key added before the push would send ID documents there.

---

## 1. Why

- Downloads (egress) from Supabase Storage are billed per GB once past the 250 GB monthly allowance. This plan assumes we are well past it.
- Downloads from R2 are **free**, however many there are. You pay only for GB stored and for requests.
- Catalogue photos, AI images, logos, menus and evidence viewers make Roam read-heavy. That is exactly the shape where R2 wins.

| Example month: 500 GB stored, 5 TB downloaded | Supabase Storage | Cloudflare R2 |
|---|---|---|
| Storage | ~$10 | ~$7.50 ($0.015/GB) |
| Downloads | ~$430 | **$0** |
| Requests | included | ~$2–5 ($4.50 per million uploads, $0.36 per million reads) |
| **Total** | **~$440** | **~$10–15** |

Public files served from the Cloudflare cache don't count as R2 reads at all, so the request line shrinks further as traffic grows.

---

## 2. What we have today (live, 16 Nov)

18 buckets, **413 files, ~181 MB**. Moving the existing files is small. The work is in the code.

| Supabase bucket | Files | Size | Today | New home |
|---|---|---|---|---|
| `make-37f42386-docs` | 61 | 125 MB | private | `roam-private/fleet-docs/` |
| `ephemeral-evidence` | 295 | 47 MB | private | `roam-private/evidence/` |
| `make-37f42386-vehicles` | 4 | 4 MB | private | `roam-private/fleet-vehicles/` |
| `courier-documents` | 4 | 2 MB | private | `roam-private/courier-docs/` (ID docs) + `roam-private/courier-photos/` (proofs, issues) + `roam-public/courier-profile/` (avatars, vehicle photos) |
| `merchant-assets` | 23 | 2 MB | public | `roam-public/merchant/` |
| `enterprise-freight-docs` | 5 | 0.5 MB | private | `roam-private/freight-docs/` |
| `merchant-documents` | 3 | 0.2 MB | private | `roam-private/merchant-kyc/` |
| `in-house-receipts` | 1 | — | private | `roam-private/in-house-receipts/` |
| `parts-imports` | 17 | — | private | `roam-private/parts-imports/` |
| `catalog-maker-logos` | 0 | — | public | `roam-public/catalogue/logos/` |
| `customer-avatars` | 0 | — | public | `roam-public/avatars/` |
| `customer-issue-photos` | 0 | — | private | `roam-private/customer-issues/` |
| `explorer-photos` | 0 | — | private | `roam-private/explorer/` |
| `parts-request-photos` | 0 | — | private | `roam-private/parts-requests/` |
| `refinery-price-sources` | 0 | — | private | `roam-private/refinery-sources/` |
| `inventory-docs` | 0 | — | private | `roam-private/inventory-docs/` |
| `driver-photos` | 0 | — | public | `roam-public/driver-photos/` (permanent media address — profile photos never expire) |
| `driver-documents` | 0 | — | private | `roam-private/driver-docs/` |
| *(new)* AI catalogue images | — | — | — | `roam-public/catalogue/images/` |

---

## 3. The setup

### 3.1 Two buckets

- **`roam-public`** — anything anyone may see: catalogue images, maker logos, merchant menus and profile pictures, customer avatars.
- **`roam-private`** — everything else.

Each old bucket becomes a folder. Every private file name starts with the owner it belongs to, so the "who can see this" check is a simple prefix match:

```
roam-private/evidence/<org_id>/<file_id>.webp
roam-private/merchant-kyc/<merchant_id>/<file_id>.pdf
roam-public/catalogue/images/<make>/<model>/<content_hash>.webp
```

### 3.2 Public files: `media.roamfleet.co`

- Connect `roam-public` to the custom domain **`media.roamfleet.co`**. This needs the roamfleet.co DNS zone on Cloudflare (website hosting stays on Vercel; only the DNS moves).
- No cache rule needed: Cloudflare caches image file types on a custom domain by default, and every public file is saved with `Cache-Control: public, max-age=31536000, immutable`, so it is kept for a year.
- Public file names include a content hash. A changed image gets a new name, so nothing ever needs clearing from the cache.
- The `r2.dev` test address is **off**.

### 3.3 Private files: 10-minute links

1. The app asks a server function for a file.
2. The function checks the signed-in user against the same rules used today (org, merchant, courier, staff role).
3. It returns a **presigned GET link valid for 10 minutes**, pointing straight at R2.
4. The phone or browser downloads from R2, so the download is free.

**Rule:** server functions hand out links and never pass file bytes through. Bytes sent from a Supabase function count as Supabase egress.

Private files never go through `media.roamfleet.co`, so they can never be cached.

### 3.4 Uploads go straight to R2

1. The app sends the server function the file type, size and purpose (e.g. "fuel receipt, image/jpeg, 1.2 MB").
2. The function checks the user, the allowed type and the size limit (the same per-bucket limits as today: 2 MB for logos, avatars and issue photos, 5 MB for evidence, merchant assets, receipts and parts imports, 8 MB for parts request photos, 10 MB for documents, 20 MB for freight and inventory docs). It returns a **presigned PUT link valid for 5 minutes** for one exact file name.
3. The app uploads directly to R2.
4. The app calls the function's "finish" step. The function reads the first bytes of the file (a range read) and runs the magic-byte check from [storage-audit.md](./storage-audit.md). If the check fails, it deletes the object. If it passes, it writes the database row.
5. Unfinished uploads sit in `roam-private/pending/` and are removed automatically after 1 day (§3.6).

**Shrink photos before upload:** every app resizes photos to a 1600 px longest side and WebP format before step 1. Phone photos drop from 3–5 MB to about 300 KB. PDFs and CSVs upload as they are.

### 3.5 Keys and safety

- One R2 API token, **Object Read & Write, scoped to `roam-public` and `roam-private` only**. Stored only as Supabase function secrets: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_BASE_URL`. Never in any app build.
- Bucket CORS allows only our app origins (roamfleet.co, roamdriver.co, the Rush apps, admin), with methods GET and PUT only.
- KYC, courier and driver documents: the virus scan in `malwareScan.ts` runs in the "finish" step. It is a **private fingerprint lookup**: the file never leaves our server — we hash the bytes (SHA-256) and ask VirusTotal `GET /api/v3/files/<sha256>` whether it already knows that file. 200 with `malicious`/`suspicious` > 0 refuses it with "This file failed a security scan and was not uploaded."; 404 (never seen before — the normal case for a phone photo or a scanned PDF) is clean; 429 waits ~15 s and retries once, then refuses with "Security check is busy — please try again in a minute."; any other status, the 10 s timeout or a network error refuses. It is fail-closed: a missing `MALWARE_SCAN_API_KEY` blocks the upload, and `MALWARE_SCAN_FAIL_OPEN=1` is a local-dev-only bypass that still refuses a file VirusTotal knows is bad. **Switching the three scanned purposes on (and unblocking merchant KYC uploads, which are refused without a scanner today) now only needs a free VirusTotal API key saved as the Supabase secret `MALWARE_SCAN_API_KEY`** — no code change.
- Database columns store the **file name (key) only**, never a full web address. Public addresses are built at read time from `R2_PUBLIC_BASE_URL`.

### 3.6 Automatic clean-up (R2 lifecycle rules)

| Folder | Deleted after |
|---|---|
| `roam-private/pending/` | 1 day |
| `roam-private/evidence/` | follows the existing `evidence_files` purge job, which now calls R2 delete |

Everything else is kept until the app deletes it.

### 3.7 One shared storage module (built — M2)

All server code uses [supabase/functions/_shared/objectStorage/](../supabase/functions/_shared/objectStorage/index.ts). It is the only code that talks to R2. It uses its own S3 signing (WebCrypto, no npm package), checked against Amazon's published test signatures.

| File | Job |
|---|---|
| [sigv4.ts](../supabase/functions/_shared/objectStorage/sigv4.ts) | Signs R2 requests and links |
| [r2Client.ts](../supabase/functions/_shared/objectStorage/r2Client.ts) | `presignUpload`, `presignDownload`, `publicUrl`, `head`, `readStart`, `read`, `copy`, `remove` |
| [purposes.ts](../supabase/functions/_shared/objectStorage/purposes.ts) | One row per kind of file: bucket, folder, scope (org / merchant / user / platform), allowed types, size limit, virus scan |
| [contentCheck.ts](../supabase/functions/_shared/objectStorage/contentCheck.ts) | Magic bytes, CSV/text, XLSX, safe-SVG checks |
| [uploadFlow.ts](../supabase/functions/_shared/objectStorage/uploadFlow.ts) | `startUpload` → `finishUpload` → `downloadLink` / `deleteStoredFile` |

**Upload ticket:** `startUpload` returns a signed ticket (HMAC, 15 minutes, tied to the user). It names the pending key and the final key. `finishUpload` trusts only the ticket, so an app can't change the folder or the file type after the upload link is issued.

**Routes:** each server function adds its own start, finish and download routes in M3. The route proves the user may act for the org, merchant or user (`scopeId`), then calls these functions.

**App side:** [packages/roam-shared/src/storage/uploadToStorage.ts](../packages/roam-shared/src/storage/uploadToStorage.ts) (`@roam/roam-shared/storage`). It shrinks photos (1600 px, WebP, with a JPEG fallback), calls start, PUTs to R2, then calls finish.

**Tests:** 24 Deno tests (`deno test --allow-env supabase/functions/_shared/objectStorage/`, in CI) + 5 vitest tests.

No code anywhere else calls `supabase.storage` after cutover. A CI check fails the build if `storage.from(` appears in app or function code.

---

## 4. Code that changes

**Server functions:**
- [supabase/functions/_fleet-server/evidence_storage.ts](../supabase/functions/_fleet-server/evidence_storage.ts), [evidence_routes.ts](../supabase/functions/_fleet-server/evidence_routes.ts) — evidence and fleet docs
- [supabase/functions/_fleet-server/fleet_admin_storage_routes.ts](../supabase/functions/_fleet-server/fleet_admin_storage_routes.ts) — vehicle files
- [supabase/functions/_fleet-server/register_residual_monolith_routes.tsx](../supabase/functions/_fleet-server/register_residual_monolith_routes.tsx) — 3 calls (vehicles, docs)
- [supabase/functions/_fleet-server/catalog_routes.ts](../supabase/functions/_fleet-server/catalog_routes.ts) — maker logos
- [supabase/functions/_fleet-server/fleet_find_parts_routes.ts](../supabase/functions/_fleet-server/fleet_find_parts_routes.ts) — logos + parts request photos
- [supabase/functions/_fleet-server/parts_import_routes.ts](../supabase/functions/_fleet-server/parts_import_routes.ts) — parts import files
- [supabase/functions/delivery/merchantAssetsUpload.ts](../supabase/functions/delivery/merchantAssetsUpload.ts) — merchant assets
- [supabase/functions/delivery/customerAccountRoutes.ts](../supabase/functions/delivery/customerAccountRoutes.ts) — avatars + issue photos
- [supabase/functions/delivery/inHouse/routes.ts](../supabase/functions/delivery/inHouse/routes.ts) — in-house receipts
- [supabase/functions/freight/orgFiles.ts](../supabase/functions/freight/orgFiles.ts) — freight docs
- [supabase/functions/explorer/index.ts](../supabase/functions/explorer/index.ts) — explorer photos
- [supabase/functions/petrojam-prices/index.ts](../supabase/functions/petrojam-prices/index.ts) — refinery sources
- ~~`apps/fleet/src/supabase/functions/ai-services/index.ts`, `admin-operations/index.ts` — old copies~~: **deleted 24 Nov (slice 8)**; neither was deployed and nothing imported them.

**Apps that upload or read directly today (move to the server flow in §3.3–3.4):**
- [apps/admin/src/components/admin/vehicle-catalog/MakerLogo.tsx](../apps/admin/src/components/admin/vehicle-catalog/MakerLogo.tsx)
- [apps/dash-courier/src/lib/courierFileUpload.ts](../apps/dash-courier/src/lib/courierFileUpload.ts), [normalizeStoragePath.ts](../apps/dash-courier/src/lib/normalizeStoragePath.ts)
- [apps/haul/src/utils/updateHaulerProfile.ts](../apps/haul/src/utils/updateHaulerProfile.ts), [saveHaulerOnboarding.ts](../apps/haul/src/utils/saveHaulerOnboarding.ts), [saveHaulerDocuments.ts](../apps/haul/src/utils/saveHaulerDocuments.ts)

---

## 5. Move order

| Step | What | Done when |
|---|---|---|
| **M1** | Create `roam-public` and `roam-private`, the API token, CORS, lifecycle rules, and `media.roamfleet.co` with its cache rule. Add the 4 secrets. | A test file uploads with a presigned link and opens from `media.roamfleet.co` with a cache HIT on the second load. |
| | *16 Nov status:* **done** — both buckets (Eastern North America, Standard); `roam-server` account token (Object Read & Write, both buckets only); `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` in Supabase; roamfleet.co added to Cloudflare (Free), apex + www kept **DNS only** (Vercel), GoDaddy nameservers → `finley` / `sharon.ns.cloudflare.com`. **Done since:** zone Active, `media.roamfleet.co` connected (Active, answers from Cloudflare), CORS on both buckets, `pending/` 1-day rule. **Done 17 Nov:** `R2_PUBLIC_BASE_URL` set (vehicle pictures go-live). No rule on `parts-imports/`: Parts import still lets staff download a batch's source file at any time (`parts_import_routes.ts` download route), and the files are tiny. | |
| **M2** | Build `objectStorage.ts` and the upload / finish / download routes. Add photo shrinking to every app upload. | Unit tests pass for presign, magic-byte rejection, prefix scoping and fail-closed virus scan. |
| | *16 Nov status:* **code done** (§3.7). 24 Deno + 5 vitest tests pass. Not yet run against live R2: the first real upload is the first M3 route. | |
| **M3** | Switch **all new uploads** to R2, bucket by bucket, in the §4 order. Reads check R2 first, then Supabase. | No new objects appear in `storage.objects` for 48 hours. |
| | *24 Nov status:* **code complete — all 11 slices built** (§0 lists them and the completeness audit). Live today: logos, vehicle pictures + certificates, evidence. The rest deploy with this branch; slice 7 stays inert until `MALWARE_SCAN_API_KEY` exists, and the dash-courier/haul app changes need their next release. **M3 is done when 48 hours pass with no new `storage.objects` rows.** *16 Nov note — slice 1, maker logos:* Dominion "Edit maker" logo upload now uses `POST …/admin/catalog/makers/:make/logo/start` + `/finish` ([catalog_routes.ts](../supabase/functions/_fleet-server/catalog_routes.ts)), browser PUTs straight to R2, key saved in `catalog_maker.logo_storage_path` (`catalogue/logos/platform/<id>.<ext>`), the previous logo is deleted. The old multipart route that wrote to Supabase is removed. Reads: Dominion [MakerLogo.tsx](../apps/admin/src/components/admin/vehicle-catalog/MakerLogo.tsx) and Fleet `GET …/parts/catalog-makers` build `media.roamfleet.co` addresses. No fallback is needed: 0 of 56 makers had a logo. Tests: [catalog_maker_logo_routes.test.ts](../supabase/functions/_fleet-server/catalog_maker_logo_routes.test.ts) (in CI), admin typecheck 0 errors. **Live proof after deploy:** upload one logo in Dominion → it shows in Dominion and in Fleet Find parts, and the file is in `roam-public/catalogue/logos/platform/`. | |
| **M4** | Copy the 413 existing files to their new keys with a one-off script (list → download → upload → compare size and count). | The R2 count matches 413 and every size matches. |
| **M5** | One migration rewrites every database column that holds a Supabase storage path or URL to the new key. Find them by searching all text columns for `/storage/v1/object/` and the bucket names. | A search for `/storage/v1/object/` across all tables returns 0 rows. |
| | *⚠ Recorded 24 Nov, not built yet — must be done before M5/M6 ship:* **Private signed links stored in rows expire after 1 year (`FILE_LINK_SECONDS`).** Long-lived private records — in-house receipts, customer issue photos, courier proofs and courier/merchant/driver ID documents, driver docs, parts request photos — will stop opening in **Nov 2027** unless something re-signs them. Before that: either add a re-sign-at-read path (resolve the stored key at read time and hand back a fresh link) or migrate those columns from a stored address to a stored key. Profile photos are already permanent `media.roamfleet.co` addresses and are not affected. |
| **M6** | Remove the Supabase fallback read. Add the CI check that blocks `storage.from(`. | Every screen with images or documents loads correctly on live with the fallback removed. |
| **M7** | After 30 days with zero Supabase Storage reads in the logs, empty and delete all 18 Supabase buckets. | `storage.buckets` is empty. |

---

## 6. Security checks before M6

- [ ] No R2 key in any app build (search the built bundles for `R2_`).
- [ ] Every upload goes through presign → finish. The magic-byte check and the size limits match [storage-audit.md](./storage-audit.md).
- [ ] A user from org A cannot get a link for an org B file (test per folder).
- [ ] Private links expire after 10 minutes. `roam-private` is never reachable through `media.roamfleet.co`.
- [ ] The virus scan blocks KYC and driver-document uploads when the scan key is missing.
- [ ] The evidence purge job deletes the R2 object as well as the row.
- [ ] Bucket listing is denied to everyone except the API token.

---

## References

- [Cloudflare R2](https://developers.cloudflare.com/r2/) · [Presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/) · [Custom domains](https://developers.cloudflare.com/r2/buckets/public-buckets/) · [Lifecycle rules](https://developers.cloudflare.com/r2/buckets/object-lifecycles/) · [CORS](https://developers.cloudflare.com/r2/buckets/cors/)
- [storage-audit.md](./storage-audit.md)
