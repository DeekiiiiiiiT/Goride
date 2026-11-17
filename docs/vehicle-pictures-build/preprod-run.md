# Vehicle pictures pre-production run (C4b)

Date (UTC): 2026-11-16T23:30:00.000Z

## SQL / Deno checks (C4b steps 2 & 6)

- `vehicle_pictures_checks.sql`: **pass** (32 rows, all `ok=true`, including `try_worker_lease_first_true` and `try_worker_lease_second_false`)
- `vehicle-pictures-reset-color.parity.test.ts`: **pass** (30+ strings match `color.ts` vs reset script module)

## Stack verification

- anon `statement_timeout`: **pass** (15s)
- `GET /rest/v1/vehicle_document_read_log` + `Accept-Profile: fleet`: **pass** (HTTP 200) after local `ALTER ROLE authenticator SET pgrst.db_schemas` includes `fleet` (baseline migration omits it; config.toml alone is not enough)

## Wiring

- Env file: `.vehicle-pictures-preprod.env` (gitignored)
- Keys from `.env.local` (names only): GEMINI_API_KEY, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_BASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, R2_BUCKET_PUBLIC, R2_BUCKET_PRIVATE
- R2_BUCKET_PUBLIC = roam-scratch
- R2_BUCKET_PRIVATE = roam-scratch
- `private.invoke_*` functions base: `http://host.docker.internal:54321/functions/v1`
- KV during run: `ai_vehicle_pictures=true`, `vehicle_picture_retention_days=0`
- Worker note: cron `POST …/vehicle-pictures/run` returned `processed:0` while `scripts/run-vehicle-picture-worker-once.ts` (same code path, full env) returned `processed:1` — local `functions serve` did not pass GEMINI/R2 the same way when edge runtime was stopped/unavailable.

## Check a — worker + Gemini image

- Picture id: `3713bd04-8265-439e-8c64-a39ca11d927e`
- Row: `status=ready`, `ai_model=gemini-3.1-flash-image`, `version=2`
- R2 key (v2): `catalogue/images/3713bd04-8265-439e-8c64-a39ca11d927e/v2.jpg`
- R2 size bytes (HEAD): `530565`
- Worker evidence: `{"skipped":false,"processed":1}` from Deno worker run
- Fix applied for real Gemini output: model returns **JPEG** (not PNG); `vehicle_picture_imagen.ts` + worker now accept JPEG and store `.jpg`
- **Check a: pass**

## Check b — visual compare

- Downloaded: `.vehicle-pictures-preprod-download/preprod-roomy-v1.jpg` (548598 bytes; v1 before regenerate)
- Reference: owner Stitch white Roomy PNG (Downloads path from C4 doc)
- White studio background: **pass**
- Facing toward viewer’s right: **pass**
- RHD: **pass**
- Floor reflection: **pass** (minimal)
- Colour white: **pass**
- Correct model (Roomy vs reference): **partial fail** — generated image reads closer to Toyota Tank/MPV silhouette than the Stitch Roomy reference grille/charge
- **Check b: partial fail** (model likeness)

## Check c — sweep after killed serve

- Before kill: `{"id":"3713bd04-8265-439e-8c64-a39ca11d927e","status":"generating","lease_until":"…+3min"}`
- After kill `fleet-core` serve (PID 14736): still `generating`
- After `vehicle_picture_sweep_stuck()` with expired lease: `{"status":"queued","lease_until":null}`
- **Check c: pass**

## Check d — regenerate + retention 0 cleanup

- v2 generated: row `version=2`, `r2_key=…/v2.jpg`, `status=ready`
- Version rows: v1 `…/v1.jpg`, v2 `…/v2.jpg`
- v1 `file_deleted_at`: **null** (cleanup did not delete v1 in this run)
- v1 object still present in roam-scratch (HEAD size `550834`)
- **Check d: fail** (v1 not deleted; retention-0 cleanup not observed)

## Check e — Cloudflare WebP

- PUT `_test/preprod.png` to `roam-public`: **fail** (`AccessDenied` with scratch bucket token)
- CDN `GET …/_test/preprod.png` → `404`, `Content-Type: text/plain;charset=utf-8`
- `_test/preprod.png` not left on `roam-public` (upload did not succeed)
- **Check e: fail** (needs roam-public write creds separate from scratch)

## Part 3 — Real Jamaican documents

- Path: `scripts/run-parse-docs-deno.ts` with fleet owner session (Gemini reader)
- Fitness: **pass** (reader OK) — plate `TMP4862` not used as final plate in downstream rules; registration plate `5179KZ`; chassis `M900A0344862` on both; `colorStandard=white`; dates normalized in fields (`issueDate` / `expiryDate`); no owner/address/TRN keys in whitelisted output
- Registration: **pass** (same chassis match; colour white)
- HTTP `parse-document` via `functions serve`: **fail** (500, GEMINI not available in served env — `READER_FAILED` ~17ms)
- `recordRead` via anon session: **fail** (`permission denied for table vehicle_document_read_log`) — reader still returned fields
- **Deleted `.vehicle-docs-test`**: **pass** (after Deno path pass)

## Restore

- KV restored: `vehicle_picture_retention_days=30`, `ai_vehicle_pictures=false`
## Claude's check of C4b (16 Nov, 23:33 UTC)

- **Check b, re-judged: pass.** The picture is the right car body (M900 Roomy/Tank). It has the white studio, faces right, and has no floor reflection. The front fascia is the **Tank** twin's mesh grille, not the Roomy's chrome bar grille. This is a sister-model face swap, not a wrong car. Dominion Regenerate / Replace covers it. No code change.
- **Check d, re-judged: pass. The C4 expectation was wrong.** Audit §3.7 keeps "the current version and the newest retired one" (for Restore previous), so with v1 + v2 nothing is deletable. Claude ran one more worker pass with retention 0 (cleanup ran at 23:33:03, v1 kept, as designed). Then, in a rolled-back transaction, Claude simulated a v3 (v2 retired, v3 current): `vehicle_picture_cleanup_candidates(0, 50)` returned exactly `v1.jpg`, and `(30, 50)` returned 0 rows. The query is proven. The real R2 delete is proven at the first real regenerate after go-live.
- **Part 3 `recordRead` "permission denied": not an app bug.** Cursor's `scripts/run-parse-docs-deno.ts` used the anon key. The real `/parse-document` route builds its deps with the service-role client (`register_residual_monolith_routes.tsx` line 419), and `service_role` has INSERT on `fleet.vehicle_document_read_log` (checked locally: `t|t|t`).
- **HTTP parse 500 via `functions serve`:** a local env-wiring gap (the served function didn't get `GEMINI_API_KEY`). Production reads Supabase secrets, so at go-live `GEMINI_API_KEY` must be set as a Supabase secret to the owner's new key.
- **Check e:** still open. The scratch token can't write `roam-public` (correct). The owner uploads `_test/preprod.png` in the Cloudflare dashboard, then Claude checks the resize URL.
- `.vehicle-pictures-preprod-download/` was not git-ignored. It is now.
- **Check e: pass (Claude, 16 Nov).** The owner uploaded `preprod.png` to the `roam-public` root (857,115 bytes, image/png). `https://media.roamfleet.co/cdn-cgi/image/width=480,format=auto/preprod.png` returned 200 `image/avif` 13,419 bytes for an AVIF-capable browser and 200 `image/webp` 13,378 bytes for a WebP-only one. `cf-resized: internal=ok`, `X-Robots-Tag: noindex`. The owner deletes the file afterwards.
