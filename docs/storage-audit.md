# Storage Audit — Roam / Fleet / Dash

Supabase Storage security audit — bucket policies, upload validation, and file-handling logic across `supabase/migrations`, Fleet Edge Functions, Roam Edge Functions, and the frontend apps that upload directly to storage.

**Totals:** 3 critical findings · 6 high priority · 5 cleanup items · 7 things done right.

> **Production verification note** (from a prior direct check against the live project `csfllzzastacofsvcdsc`, dated 2026-07-18 — supersedes code-only inference below where noted): `merchant-assets` is **confirmed public**, by design, for storefront/menu image reads. The `ephemeral-evidence` bucket is defined in a migration but **had not actually been deployed to production** as of that check — treat its findings below as "will apply once deployed," not "currently live." `driver-photos` and `driver-documents` were not present in that production bucket list either, which may mean those two upload paths aren't live yet — worth confirming directly before treating their findings as active.

---

## Executive summary

This codebase actually has two different storage architectures living side by side — one genuinely well-built, one that matches the "dragged files into the Storage UI" pattern the audit brief predicted. The problem is telling them apart requires reading the dashboard, not the repo.

### 1. Zero storage RLS policies exist in version control — for any bucket, ever

A repo-wide search for `CREATE POLICY ON storage.objects` across every migration and every script returns nothing. Not "a weak policy" — no policy at all, tracked anywhere. For the two buckets created via migration (`ephemeral-evidence`, `merchant-documents`), this turns out to be fine in practice: every upload/download to those two goes through an Edge Function running as `service_role`, which bypasses storage RLS entirely by design, so there was never anything to write a policy for. But for the other buckets in active use — including at least one that clients write to directly from the browser — whatever access control exists was clicked together in the Supabase dashboard and has never been reviewed, versioned, or tested. Nobody, including this audit, can say with certainty what those policies currently allow.

### 2. `merchant-assets` is the one to worry about most

Two different frontend files upload directly to this bucket using the browser's own anon-key session — no Edge Function in the loop at all. It's never created by a migration; production verification confirms it's public by design (reasonable for storefront images), but that only covers the *read* side. There is no server-side file size check, no MIME validation of any kind, and the filename is built from `Date.now()` + `Math.random()` — not a cryptographically random UUID, and not scoped to the uploading user's ID at all. If the live storage policy for this bucket's *write* side is anything looser than "authenticated users can only touch files under their own folder" — which is exactly the kind of policy someone clicks past quickly in the dashboard UI — any logged-in user can overwrite any other user's file.

> `apps/dash-merchant/src/components/ImageUpload.tsx:78-98` · `apps/dash-merchant/src/components/account/EditProfileView.tsx:78-90`

### 3. MIME magic-number validation doesn't exist anywhere — not even in the well-built upload paths

This is the one gap that's completely universal. Every single upload path in this codebase — the careful, server-mediated ones and the sloppy direct-from-browser ones alike — validates a file's type by trusting either the browser's `file.type` or a client-supplied `Content-Type` header. Nowhere does anything read the first few bytes of the actual file to confirm it's really an image or PDF. A `.html` file renamed to `photo.jpg` with a spoofed `Content-Type: image/jpeg` header will sail through every check in this repo.

### 4. Bucket provisioning is scattered across four files with different, conflicting settings

The Fleet server's two admin-facing document buckets (`make-37f42386-docs`, `make-37f42386-vehicles`) aren't created by a migration at all — they're created lazily, in code, the first time they're needed. Three separate files each contain their own copy of "create this bucket if it doesn't exist" logic, and they don't agree with each other: one sets a 5MB limit, one sets none, one sets 10MB. Whichever code path happens to run first wins, permanently, until something else notices and patches it — which is exactly what happened (a migration had to retroactively patch a missing size limit on the vehicles bucket that a code path had created without one; production confirms it's now correctly at 10MB).

The good news is real and worth leading with, not just a consolation prize: the **primary** Fleet evidence-upload endpoint and the merchant-KYC-document endpoint are both genuinely well-built — real server-side size limits, cryptographically random UUID filenames, proper folder scoping, signed URLs for viewing, and (for evidence specifically) a complete automated orphan-cleanup system tied to record lifecycle. Whoever built those two knew what they were doing. The gap is that not every upload path in this codebase was built by the same standard.

---

## Bucket-by-bucket matrix

Every bucket found in active use in code. Columns marked "prod-confirmed" reflect the live production check noted above; everything else is inferred from source.

| Bucket | Created by | Public? | Storage RLS | Upload path | Filename | User-scoped path | Size limit |
|---|---|---|---|---|---|---|---|
| `ephemeral-evidence` | Migration (not yet deployed to prod) | Private (as migrated) | None needed — service_role only | Edge Function (service_role) | UUID | org_id/type/uuid | 5MB (bucket + app) |
| `merchant-documents` | Migration | Private *(prod-confirmed)* | None needed — service_role only | Edge Function (service_role) | merchant-id + timestamp, not UUID | merchant_id/doctype | 10MB *(prod-confirmed)* |
| `make-37f42386-docs` | Code (3 sites, inconsistent) | Private *(prod-confirmed)* | Untracked — not in any migration | Mixed: 1 Edge Function path has real checks, 1 doesn't | UUID | Not user-scoped (admin-managed) | 10MB *(prod-confirmed; code disagrees internally, see Section C)* |
| `make-37f42386-vehicles` | Code (2 sites) + 1 migration patch | Private *(prod-confirmed)* | Untracked | Edge Function (server-generated images) | License plate or UUID | N/A — vehicle-scoped | Was missing, now 10MB *(prod-confirmed fixed)* |
| `merchant-assets` | Never created in code — dashboard only | **Public** *(prod-confirmed, by design)* | Untracked, unverifiable (write side) | Direct from browser, anon-key session | Date.now() + weak random | No — shared folder, not per-user | None found anywhere |
| `driver-documents` | Never created in code — dashboard only | Unknown; not seen in prod bucket list | Untracked, unverifiable | Direct from browser, anon-key session | Fixed slot name (license/insurance) | user_id/slot | None found anywhere |
| `driver-photos` | Never created in code — dashboard only | Unknown; not seen in prod bucket list | Untracked, unverifiable | Direct from browser, anon-key session | Fixed name (avatar.ext) | user_id/avatar | None found anywhere |

---

## A — Untracked buckets, direct client uploads

The buckets nobody created in a migration, and the frontend files that upload straight to them from the browser.

### 🚨 Critical

**Two files upload directly to `merchant-assets` from the browser with the anon-key session, no server-side check of any kind — size, MIME type, or ownership.** (`apps/dash-merchant/src/components/ImageUpload.tsx:78-98`, `apps/dash-merchant/src/components/account/EditProfileView.tsx:78-90`.) The 5MB check and image-type check that exist are pure client-side JavaScript (`validateAndProcess`), which means they're advisory for a well-behaved browser and irrelevant to anyone calling the Storage API directly. The filename is `${folder}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}` — not cryptographically random, not scoped to the uploading user, sharing one flat folder across every merchant using that image type. Public read on this bucket is confirmed intentional — the gap is entirely on the write side.

```ts
// current — apps/dash-merchant/src/components/ImageUpload.tsx
const uploadBlob = async (file, originalName) => {
  const fileExt = originalName.split('.').pop() || 'jpg';
  const fileName = `${folder}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
  await supabase.storage.from(bucket).upload(fileName, file, { upsert: false });
  const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(fileName);
  onChange(publicUrl);
};

// fix — route through a small Edge Function that does the checks the client can't be trusted to do,
// and scope the path to the authenticated user/merchant:
// POST /merchant-assets/upload  (Edge Function, verifies auth.getUser() first)
const MAX = 5 * 1024 * 1024;
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);
export default async function handler(req: Request) {
  const { data: { user } } = await supabase.auth.getUser(bearerFrom(req));
  if (!user) return json({ error: 'unauthorized' }, 401);
  const form = await req.formData();
  const file = form.get('file') as File;
  if (!file || file.size > MAX) return json({ error: 'file_too_large' }, 413);
  const buf = new Uint8Array(await file.arrayBuffer());
  const magic = detectImageMagicBytes(buf); // see Section B
  if (!magic || !ALLOWED.has(magic)) return json({ error: 'invalid_file_type' }, 400);
  const path = `${user.id}/${crypto.randomUUID()}.${extFor(magic)}`;
  const { error } = await serviceClient.storage.from('merchant-assets').upload(path, buf, {
    contentType: magic, upsert: false,
  });
  if (error) return json({ error: error.message }, 500);
  return json({ path });
}
```

Right now, anyone who opens their browser's dev tools while logged in can call the upload API directly — skipping your size and type checks entirely — and can write to a shared folder that isn't scoped to their own account. This moves the checks server-side, where a user can't bypass them, and gives every file its own unguessable name inside a folder that belongs only to them.

**`driver-photos` and `driver-documents` are also written to directly from the browser, and neither bucket is created anywhere in code** (`apps/haul/src/utils/updateHaulerProfile.ts:14-24`, `apps/haul/src/utils/saveHaulerOnboarding.ts:26-36`) — and neither appeared in the production bucket check, so confirm whether these two paths are actually live before prioritizing this. If they are, their `public` flag, size limit, and MIME allowlist all live only in the dashboard. The path scoping here is actually done right (`${user.id}/avatar.${ext}`), which limits the blast radius of a bad storage policy to "can a user touch *a* folder they don't own," not "can they touch every folder" — but there's still no server-side size or type check on either path, and `driver-documents` almost certainly holds ID/compliance documents, which deserve the same treatment as the properly-built `merchant-documents` KYC flow elsewhere in this same codebase.

The good news here is the folder structure already does the hard part. The fix is smaller than the one above: add a size + magic-byte check before the upload call, and confirm in the dashboard that the storage policy actually restricts writes to `auth.uid() = (storage.foldername(name))[1]` rather than something broader.

### ⚠️ High priority

None of the three untracked buckets (`merchant-assets`, `driver-documents`, `driver-photos`) have their configuration anywhere in version control. Even where the live dashboard policies turn out to be correct today, there's no way to review a future change to them in a pull request, no way to reproduce the setup in a new environment, and no way for this audit — or the next one — to confirm anything beyond "it isn't broken today." Recommend backfilling a migration for each that matches whatever the dashboard currently has, going forward.

```sql
-- template for backfilling the missing bucket definitions
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('merchant-assets', 'merchant-assets', true, 5242880,
        ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- and the matching storage.objects policy, once you know what it should be —
-- this example assumes "own folder only" for writes, public read:
CREATE POLICY "merchant_assets_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'merchant-assets');
CREATE POLICY "merchant_assets_own_folder_write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'merchant-assets' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "merchant_assets_own_folder_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'merchant-assets' AND (storage.foldername(name))[1] = auth.uid()::text);
```

### 🧹 Cleanup

The `ImageUpload.tsx` filename generator (`Date.now() + Math.random().toString(36)`) should just be `crypto.randomUUID()` — it's built into every modern browser and every Deno runtime, costs nothing, and removes any theoretical collision risk. This is a one-line change independent of the bigger server-side-validation fix above.

---

## B — MIME validation: missing everywhere, including the good paths

Every upload path in this codebase, without exception, trusts the declared file type instead of reading the bytes.

### ⚠️ High priority

Not one file in this codebase checks a file's actual magic bytes before accepting it. The server-mediated paths (evidence uploads, merchant KYC documents, Fleet vehicle docs) all pass whatever `file.type` the browser reports straight through as the storage object's `contentType`. For buckets with an `allowed_mime_types` restriction at the bucket level (`ephemeral-evidence`, `merchant-documents`), Supabase's Storage API does check the declared Content-Type header against that allowlist — which blocks the laziest version of this attack — but it never inspects the actual bytes, so a file that lies about its own type in the upload request still gets through.

```ts
// drop-in magic-byte check — add to every Edge Function upload handler
// (works in Deno without any external dependency; add the "file-type" npm package
// via `npm:file-type` for a more exhaustive signature list if you want broader coverage)
function detectImageMagicBytes(bytes: Uint8Array): string | null {
  const sig = (...b: number[]) => b.every((v, i) => bytes[i] === v);
  if (sig(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (sig(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (sig(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45) return 'image/webp';
  if (sig(0x25, 0x50, 0x44, 0x46)) return 'application/pdf';
  if (sig(0x00, 0x00, 0x00) && String.fromCharCode(...bytes.slice(4, 8)) === 'ftyp') return 'image/heic';
  return null; // not a recognized type — reject
}

// in the upload handler, before calling storage.upload():
const buffer = new Uint8Array(await file.arrayBuffer());
const detected = detectImageMagicBytes(buffer);
if (!detected || !ALLOWED_TYPES.has(detected)) {
  return c.json({ error: 'File content does not match an allowed type' }, 400);
}
// upload `buffer` (not the original File/Blob) with contentType: detected — not file.type
```

Right now, if someone uploads a file called "receipt.jpg" that's actually an HTML page with a script tag inside, and a staff member later opens it expecting a photo, their browser will run that script with the permissions of whatever page served it. Reading the first few bytes of the file — the "magic number" every real image/PDF format starts with — catches this before the file is ever saved, regardless of what name or Content-Type header the uploader claimed.

### ✅ Partial mitigation already in place

Both migration-defined buckets (`ephemeral-evidence`, `merchant-documents`) set `allowed_mime_types` at the bucket level, which Supabase's Storage API enforces against the declared Content-Type on every upload — not a substitute for byte-level validation, but a real check that's better than nothing, and already correctly configured.

---

## C — Bucket provisioning: scattered across four files

`make-37f42386-docs` and `make-37f42386-vehicles` — created lazily in code, three different places, three different opinions about the size limit.

### 🧹 Cleanup

**Three separate "create this bucket if missing" blocks disagree with each other.** `index.tsx:7805-7814` creates `make-37f42386-docs` with a 10MB limit (or 5MB for the ephemeral variant) and self-heals an existing bucket's limit on every call. `admin-operations/index.ts:373-375` creates the same bucket with a 5MB limit and never revisits it. `ai-services/index.ts:200-203` creates `make-37f42386-vehicles` with no limit at all. Whichever of these runs first for a given bucket wins, permanently, until another code path happens to call `updateBucket()` — which is exactly how the vehicles bucket ended up needing a migration to retroactively patch a missing size limit (production now confirms it's correctly at 10MB, and `make-37f42386-docs` is also at 10MB in prod — meaning the `index.tsx` code path is the one that actually won).

```ts
// consolidate into one shared helper, called from every Edge Function that needs a bucket,
// so there's exactly one place that decides bucket config:
// apps/fleet/src/supabase/functions/server/storage_buckets.ts
export const BUCKET_CONFIG = {
  'make-37f42386-docs': { public: false, fileSizeLimit: 10_485_760 },
  'make-37f42386-vehicles': { public: false, fileSizeLimit: 10_485_760 },
} as const;

export async function ensureBucket(supabase: SupabaseClient, name: keyof typeof BUCKET_CONFIG) {
  const { data: buckets } = await supabase.storage.listBuckets();
  const cfg = BUCKET_CONFIG[name];
  if (!buckets?.some((b) => b.name === name)) {
    await supabase.storage.createBucket(name, cfg);
  } else {
    await supabase.storage.updateBucket(name, cfg); // idempotent — keeps drifted buckets in sync
  }
}
// then every upload handler calls: await ensureBucket(supabase, 'make-37f42386-docs');
```

This isn't a security hole today — both buckets ended up private either way — but it's exactly the kind of quiet inconsistency that becomes one. The next person who adds a fourth upload path for one of these buckets has a one-in-three chance of copying the version with no size limit, and the `admin-operations/index.ts` copy is currently dead weight that no longer matches what's actually deployed.

### ✅ What's actually solid

Every one of these code-created buckets is created with `public: false` — nobody accidentally flipped the visibility flag, which is the single most common version of this mistake and the one the audit brief specifically worried about. It didn't happen here.

---

## D — The well-built examples

Worth studying, not just praising — this is the pattern the buckets in Section A should be rebuilt to match.

### ✅ What's actually solid

- **The Fleet evidence-upload endpoint (`index.tsx:7770-7828`) does almost everything right.** Real server-side size check with a clear 413 response, bucket size limit kept in sync on every call, `crypto.randomUUID()` filenames, org-scoped folder structure with the org ID sanitized against path-traversal characters, and a private bucket with signed URLs for viewing. The only gap is the magic-byte check covered in Section B.
- **The merchant KYC document endpoint (`supabase/functions/delivery/merchant_application_routes.ts:485-554`) is the best-built upload path in the entire audit.** It verifies the caller owns a merchant profile before accepting anything, validates the declared document type against a business-type-specific allowlist, enforces a real 10MB server-side limit, scopes the storage path to the merchant's own ID, and — critically — the read side (`extendAdminMerchantDetail`) generates a fresh `createSignedUrl()` for every document rather than ever exposing a public URL for what is explicitly private KYC material.
- **The evidence-cleanup system (`evidence_storage.ts`, `evidence_routes.ts`) is a genuinely complete answer to pillar 8.** Every evidence file is registered in a tracking table with a computed `delete_after` timestamp tied to when its parent record (a transaction, fuel entry, or maintenance log) gets resolved; a scheduled job (`runEvidenceCleanup`, gated behind a cron secret) purges both the storage object and the tracking row once the retention window passes; and there's a separate legacy-bucket audit tool that cross-references stored files against the records that reference them to find true orphans. This is more thoughtful than most production systems bother to be — worth deploying (see the production note at the top: this bucket isn't live yet).
- Both the evidence and merchant-document flows correctly route every operation through a `service_role` client, which is exactly why neither of those two buckets needed a `storage.objects` policy in the first place — the Edge Function *is* the access-control layer, and it does the ownership check itself before ever touching storage.

### 🧹 One thing worth tightening

The merchant-document filename (`${merchant.id}/${docType}-${Date.now()}.${ext}`) leans on `merchant.id` plus a timestamp rather than a UUID. Not exploitable — the folder scoping already does the real work, and `upsert: true` means predictable collisions are actually the intended behavior here (one file per doc type, latest wins) — but worth a comment in the code explaining that the predictability is deliberate, so a future refactor doesn't "fix" it into something that breaks the upsert-by-doctype behavior.

---

## E — Cleanup, image transforms, and malware scanning

### ✅ Orphan cleanup — good where it exists, absent elsewhere

Covered in Section D — the evidence system's cleanup is real and automated (once deployed). No equivalent exists for `merchant-assets`, `driver-photos`, or `driver-documents`: nothing found in this audit deletes a user's uploaded logo/avatar/document when their profile record is deleted or the field is overwritten with a new upload. `upsert: true` on the avatar/document paths means old versions at the *same* path get overwritten (not orphaned), which limits this mostly to "what happens on account deletion" rather than routine turnover — but that case isn't handled anywhere found in scope.

### 🧹 Image transformation abuse

No use of Supabase's built-in image transformation query parameters (`?width=`, `?height=`) was found anywhere in this codebase — every image URL in scope is served as-is. This means the specific bandwidth/compute abuse pattern the audit brief describes isn't currently a live attack surface here. Worth revisiting if transformation ever gets adopted for thumbnails — at that point, front it with a small proxy that clamps requested dimensions to a fixed allowlist (e.g. 100/400/1200px) rather than passing arbitrary client-supplied values straight through.

### ⚠️ Malware / payload scanning

No virus or malware scanning exists anywhere in this codebase, and it doesn't need to for most of what's stored (evidence photos and vehicle images are effectively self-serve, not shared with other end users). The two buckets where this actually matters are `merchant-documents` and `driver-documents` — real third-party-supplied files (KYC documents, licenses) that staff members will open and view. Given the low volume of these specific uploads, a lightweight scan-on-upload is a reasonable, low-cost addition rather than a hard requirement:

```ts
// skeleton: scan-on-upload via a third-party API (e.g. VirusTotal, or a self-hosted ClamAV REST wrapper)
// call this after the magic-byte check passes, before the file is persisted to storage
async function scanForMalware(buffer: Uint8Array): Promise<{ clean: boolean; reason?: string }> {
  const apiKey = Deno.env.get("MALWARE_SCAN_API_KEY");
  if (!apiKey) return { clean: true }; // fail-open if not configured; log this
  const res = await fetch("https://api.virustotal.com/api/v3/files", {
    method: "POST",
    headers: { "x-apikey": apiKey },
    body: (() => { const fd = new FormData(); fd.append("file", new Blob([buffer])); return fd; })(),
  });
  if (!res.ok) return { clean: true }; // fail-open on scanner outage; log this
  const { data } = await res.json();
  const stats = data?.attributes?.last_analysis_stats;
  if (stats?.malicious > 0) return { clean: false, reason: `${stats.malicious} engines flagged this file` };
  return { clean: true };
}

// in the upload handler:
const scan = await scanForMalware(buffer);
if (!scan.clean) {
  return c.json({ error: "This file failed a security scan and was not uploaded." }, 422);
}
```

This one's about protecting your staff, not your users — nobody uploads a virus to steal their own data, but a malicious applicant absolutely could upload a booby-trapped "driver's license" hoping someone on your team opens it. Scanning on upload catches it before it ever reaches a human.

---

*Compiled from a direct read-through of every migration referencing `storage.buckets`/`storage.objects`, every Edge Function calling the Storage API, and every frontend component doing the same, cross-checked against a prior live production bucket listing where available. One incidental finding outside this audit's scope: `PUT /merchants/:id` in `merchant_application_routes.ts:437-464` updates a merchant record by URL parameter with no check that the caller owns that merchant — worth a look in a future pass.*

---

## Remediation status (2026-07-18)

| Wave | Status | What landed |
|------|--------|-------------|
| 0 Lock policies | Done | Dropped loose authenticated write/delete on `merchant-assets`; public SELECT only |
| 1 Merchant upload EF | Done | `POST /merchant-assets/upload` + dash-merchant `ImageUpload` / `EditProfileView` |
| 2 Bucket migration | Done | `20260718210000_storage_audit_buckets_policies.sql` � all buckets + driver own-folder RLS |
| 3 Magic bytes | Done | Evidence + KYC uploads validate file bytes |
| 4 Fleet ensureBucket | Done | `storage_buckets.ts` shared helper |
| 5 ephemeral-evidence | Done | Bucket present on prod |
| 6 Docs + Notion | Done | This section |
| 7 Malware stub | Done | `malwareScan.ts` on KYC (fail-open without `MALWARE_SCAN_API_KEY`) |
| 8 Commit/push | Gated | Wait for explicit ask |

**Live policy note:** Before Wave 0, any authenticated user could INSERT/UPDATE/DELETE any object in `merchant-assets`. That hole is closed.

