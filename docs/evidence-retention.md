# Ephemeral evidence retention

Scan photos (fuel receipts, toll receipts, odometer proofs, maintenance invoices) are stored in **`ephemeral-evidence`** and tracked in **`public.evidence_files`**.

## Policy

- **14 days** after **Approved** or **Rejected**, the photo file is purged from storage.
- **Pending** records hold photos indefinitely (`pending_hold` in `evidence_files`).
- Extracted fields (amount, date, odometer, merchant) remain in KV forever.
- `receiptUrl` / `odometerProofUrl` strings stay in KV for toll cash logic; UI reads `metadata.evidenceExpired` to avoid broken images.

## Feature flag

`EVIDENCE_TTL_ENABLED` (default `false`). When off, uploads use legacy `make-37f42386-docs/driver-docs/` paths and all TTL code paths no-op.

## Key modules

| Path | Role |
|------|------|
| `apps/fleet/src/supabase/functions/server/evidence_storage.ts` | Register, schedule deletion, URL parse, cleanup runner |
| `apps/fleet/src/supabase/functions/server/evidence_routes.ts` | Admin summary, legacy audit/purge, internal cron route |
| `packages/types/src/evidence.ts` | Shared types + `appendUploadEvidenceMeta()` |
| `apps/fleet/src/services/uploadEvidence.ts` | Client helper (`uploadEvidenceFile`) |
| `apps/fleet/src/components/evidence/*` | UI panels, badges, retention notice |

## Upload (submit flows only)

`POST /make-server-37f42386/upload` accepts optional form fields: `evidenceType`, `sourceType`, `sourceId`, `retentionClass`, `parentStatus`, `orgId`.

When flag on + `retentionClass=ephemeral`: path `ephemeral-evidence/{orgId}/{type}/{uuid}.{ext}` + `evidence_files` row.

Scan-only endpoints (`/scan-receipt`, `/scan-odometer`) remain memory-only. `SubmitExpenseModal` defers upload until submit.

## Lifecycle

On approve/reject (`expenses/approve`, `expenses/reject`, toll reconcile approve/reject, fuel station-gate release): `scheduleEvidenceDeletion` sets `delete_after = resolved_at + 14d` and `metadata.evidenceDeleteAfter` on the parent record.

## Cleanup

- Edge function: `supabase/functions/evidence-cleanup` (`X-Fleet-Cron-Secret`)
- Internal: `POST /make-server-37f42386/internal/evidence-cleanup?dryRun=true`
- Schedule: Supabase cron daily 03:00 UTC (see `supabase/scripts/schedule_evidence_cleanup.sql`)
- Admin: `GET /admin/evidence-storage/summary` → Data Center → Delete → Storage Health panel

## Legacy reclamation

- `POST /admin/evidence-storage/audit-legacy` — classify `make-37f42386-docs/driver-docs/` orphans vs referenced
- `POST /admin/evidence-storage/purge-legacy` — delete orphan paths (default `orphanOnly: true`)

## Tests

`apps/fleet/src/utils/evidenceStorage.test.ts`, `tollEvidenceRetention.test.ts`