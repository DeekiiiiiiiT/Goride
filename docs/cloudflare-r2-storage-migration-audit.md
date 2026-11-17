# Cloudflare R2 storage takeover — plan

**Rev 2 · 16 Nov 2026** — replaces the Rev 1 team-review draft.
**Decision:** Cloudflare R2 stores and serves **every** file. Supabase keeps the database, logins and server functions only. No files stay on Supabase Storage.
**Related:** [storage-audit.md](./storage-audit.md) — upload security rules that carry over unchanged.

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
| `courier-documents` | 4 | 2 MB | private | `roam-private/courier-docs/` |
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
| `driver-photos` | 0 | — | private | `roam-private/driver-photos/` |
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
- KYC, courier and driver documents: the virus scan in `malwareScan.ts` runs in the "finish" step. It is already fail-closed: a missing `MALWARE_SCAN_API_KEY` blocks the upload. **`MALWARE_SCAN_API_KEY` must be set before those three purposes go live in M3.**
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
- [apps/fleet/src/supabase/functions/ai-services/index.ts](../apps/fleet/src/supabase/functions/ai-services/index.ts), [admin-operations/index.ts](../apps/fleet/src/supabase/functions/admin-operations/index.ts) — old copies; switch if still deployed, delete if not

**Apps that upload or read directly today (move to the server flow in §3.3–3.4):**
- [apps/admin/src/components/admin/vehicle-catalog/MakerLogo.tsx](../apps/admin/src/components/admin/vehicle-catalog/MakerLogo.tsx)
- [apps/dash-courier/src/lib/courierFileUpload.ts](../apps/dash-courier/src/lib/courierFileUpload.ts), [normalizeStoragePath.ts](../apps/dash-courier/src/lib/normalizeStoragePath.ts)
- [apps/haul/src/utils/updateHaulerProfile.ts](../apps/haul/src/utils/updateHaulerProfile.ts), [saveHaulerOnboarding.ts](../apps/haul/src/utils/saveHaulerOnboarding.ts), [saveHaulerDocuments.ts](../apps/haul/src/utils/saveHaulerDocuments.ts)

---

## 5. Move order

| Step | What | Done when |
|---|---|---|
| **M1** | Create `roam-public` and `roam-private`, the API token, CORS, lifecycle rules, and `media.roamfleet.co` with its cache rule. Add the 4 secrets. | A test file uploads with a presigned link and opens from `media.roamfleet.co` with a cache HIT on the second load. |
| | *16 Nov status:* **done** — both buckets (Eastern North America, Standard); `roam-server` account token (Object Read & Write, both buckets only); `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` in Supabase; roamfleet.co added to Cloudflare (Free), apex + www kept **DNS only** (Vercel), GoDaddy nameservers → `finley` / `sharon.ns.cloudflare.com`. **Done since:** zone Active, `media.roamfleet.co` connected (Active, answers from Cloudflare), CORS on both buckets, `pending/` 1-day rule. **Left:** `R2_PUBLIC_BASE_URL` secret. No rule on `parts-imports/`: Parts import still lets staff download a batch's source file at any time (`parts_import_routes.ts` download route), and the files are tiny. | |
| **M2** | Build `objectStorage.ts` and the upload / finish / download routes. Add photo shrinking to every app upload. | Unit tests pass for presign, magic-byte rejection, prefix scoping and fail-closed virus scan. |
| | *16 Nov status:* **code done** (§3.7). 24 Deno + 5 vitest tests pass. Not yet run against live R2: the first real upload is the first M3 route. | |
| **M3** | Switch **all new uploads** to R2, bucket by bucket, in the §4 order. Reads check R2 first, then Supabase. | No new objects appear in `storage.objects` for 48 hours. |
| | *16 Nov status — slice 1, maker logos:* **code done, not deployed.** Dominion "Edit maker" logo upload now uses `POST …/admin/catalog/makers/:make/logo/start` + `/finish` ([catalog_routes.ts](../supabase/functions/_fleet-server/catalog_routes.ts)), browser PUTs straight to R2, key saved in `catalog_maker.logo_storage_path` (`catalogue/logos/platform/<id>.<ext>`), the previous logo is deleted. The old multipart route that wrote to Supabase is removed. Reads: Dominion [MakerLogo.tsx](../apps/admin/src/components/admin/vehicle-catalog/MakerLogo.tsx) and Fleet `GET …/parts/catalog-makers` build `media.roamfleet.co` addresses. No fallback is needed: 0 of 56 makers had a logo. Tests: [catalog_maker_logo_routes.test.ts](../supabase/functions/_fleet-server/catalog_maker_logo_routes.test.ts) (in CI), admin typecheck 0 errors. **Live proof after deploy:** upload one logo in Dominion → it shows in Dominion and in Fleet Find parts, and the file is in `roam-public/catalogue/logos/platform/`. | |
| **M4** | Copy the 413 existing files to their new keys with a one-off script (list → download → upload → compare size and count). | The R2 count matches 413 and every size matches. |
| **M5** | One migration rewrites every database column that holds a Supabase storage path or URL to the new key. Find them by searching all text columns for `/storage/v1/object/` and the bucket names. | A search for `/storage/v1/object/` across all tables returns 0 rows. |
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
